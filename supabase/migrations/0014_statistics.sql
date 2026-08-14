-- 0014 — Statistik och ekonomiunderlag (avsnitt 11).
--
-- Aggregeringen ligger i databasen, inte i applikationen. Att hämta hem varje
-- order för en månad och summera i JavaScript fungerar för seed-data och
-- havererar för en restaurang med tusen order i veckan — och felet märks först
-- när det gör som mest ont.
--
-- Funktionerna körs som SECURITY INVOKER, alltså med anroparens rättigheter.
-- Det är avsiktligt: RLS på `orders`, `fees` och `tips` avgör vad som räknas
-- med, precis som överallt annars. En SECURITY DEFINER-funktion här skulle
-- läcka en annan restaurangs omsättning till den som gissar rätt uuid.

/*
 * Sammanfattning för en period.
 *
 * Bara COMPLETED räknas. En order som ligger i kön är inte omsättning, och en
 * avbruten order är det definitivt inte — annars visar dashboarden pengar som
 * aldrig kom in.
 */
create or replace function public.restaurant_revenue_summary(
  p_restaurant_id uuid,
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  orders_count     bigint,
  items_gross_ore  bigint,
  items_vat_ore    bigint,
  items_net_ore    bigint,
  tips_ore         bigint,
  fees_ore         bigint,
  avg_order_ore    bigint
)
language sql
stable
as $$
  select
    count(*)                                          as orders_count,
    coalesce(sum(o.items_gross_ore), 0)               as items_gross_ore,
    coalesce(sum(o.items_vat_ore), 0)                 as items_vat_ore,
    coalesce(sum(o.items_gross_ore - o.items_vat_ore), 0) as items_net_ore,
    coalesce(sum(o.tip_ore), 0)                       as tips_ore,
    -- Avgiften läses ur `fees`, inte räknas om. Procentsatsen kan ha ändrats
    -- sedan ordern lades, och historiken ska visa vad som faktiskt togs ut.
    coalesce((
      select sum(f.fee_ore) from public.fees f
      where f.order_id in (
        select id from public.orders
        where restaurant_id = p_restaurant_id
          and status = 'COMPLETED'
          and completed_at >= p_from and completed_at < p_to
      )
    ), 0)                                             as fees_ore,
    case when count(*) = 0 then 0
         else (sum(o.items_gross_ore) / count(*))::bigint
    end                                               as avg_order_ore
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.status = 'COMPLETED'
    and o.completed_at >= p_from
    and o.completed_at < p_to;
$$;

comment on function public.restaurant_revenue_summary is
  'Omsättning för en period. Bara COMPLETED räknas. Avgiften läses ur fees, inte räknas om — procentsatsen kan ha ändrats sedan ordern lades.';

/* Populäraste rätterna. Namnet tas ur ögonblicksbilden, inte ur menyn — en
 * rätt som bytt namn eller tagits bort ska fortfarande synas i statistiken. */
create or replace function public.restaurant_top_items(
  p_restaurant_id uuid,
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit integer default 10
)
returns table (
  name        text,
  quantity    bigint,
  gross_ore   bigint
)
language sql
stable
as $$
  select
    oi.name_snapshot                as name,
    sum(oi.quantity)::bigint        as quantity,
    sum(oi.line_gross_ore)::bigint  as gross_ore
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.restaurant_id = p_restaurant_id
    and o.status = 'COMPLETED'
    and o.completed_at >= p_from
    and o.completed_at < p_to
  group by oi.name_snapshot
  order by quantity desc, gross_ore desc
  limit greatest(1, least(p_limit, 50));
$$;

/*
 * Omsättning per bord (avsnitt 4.3).
 *
 * Det här är siffran QR-flödet finns för att kunna ge. Bord utan order i
 * perioden tas med som noll, så att ett bord som inte säljer syns i listan i
 * stället för att tyst försvinna.
 */
create or replace function public.restaurant_table_revenue(
  p_restaurant_id uuid,
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  table_number  text,
  zone          text,
  orders_count  bigint,
  gross_ore     bigint
)
language sql
stable
as $$
  select
    t.table_number,
    t.zone,
    count(o.id)                              as orders_count,
    coalesce(sum(o.items_gross_ore), 0)::bigint as gross_ore
  from public.tables t
  left join public.orders o
    on o.table_id = t.id
   and o.status = 'COMPLETED'
   and o.completed_at >= p_from
   and o.completed_at < p_to
  where t.restaurant_id = p_restaurant_id
    and t.status <> 'ARCHIVED'
  group by t.id, t.table_number, t.zone
  order by gross_ore desc, t.table_number;
$$;

/*
 * Tid från lagd order till klar mat.
 *
 * Median och inte medelvärde. En order som glömdes bort över natten drar upp
 * ett medelvärde så att siffran blir oanvändbar; medianen påverkas knappt.
 * p90 finns med för att visa hur illa det blir när det går illa — det är den
 * siffran en gäst minns.
 */
create or replace function public.restaurant_prep_times(
  p_restaurant_id uuid,
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  measured_orders bigint,
  median_seconds  integer,
  p90_seconds     integer
)
language sql
stable
as $$
  select
    count(*)                                                                as measured_orders,
    coalesce(percentile_cont(0.5) within group (
      order by extract(epoch from (ready_at - placed_at))
    ), 0)::integer                                                          as median_seconds,
    coalesce(percentile_cont(0.9) within group (
      order by extract(epoch from (ready_at - placed_at))
    ), 0)::integer                                                          as p90_seconds
  from public.orders
  where restaurant_id = p_restaurant_id
    and status = 'COMPLETED'
    and placed_at is not null
    and ready_at is not null
    and completed_at >= p_from
    and completed_at < p_to;
$$;

/*
 * Moms per sats för bokföringsunderlaget.
 *
 * `vat_by_rate` är JSONB med satsen som nyckel: {"1200": 1543, "2500": 1780}.
 * En order kan blanda 12 % mat och 25 % alkohol, och redovisningen behöver dem
 * åtskilda — det är hela anledningen till att kolumnen finns.
 */
create or replace function public.restaurant_vat_breakdown(
  p_restaurant_id uuid,
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  vat_rate_bps integer,
  vat_ore      bigint
)
language sql
stable
as $$
  select
    (entry.key)::integer          as vat_rate_bps,
    sum((entry.value)::bigint)    as vat_ore
  from public.orders o
  cross join lateral jsonb_each_text(o.vat_by_rate) as entry(key, value)
  where o.restaurant_id = p_restaurant_id
    and o.status = 'COMPLETED'
    and o.completed_at >= p_from
    and o.completed_at < p_to
  group by entry.key
  order by vat_rate_bps;
$$;

-- Statistiken är personalens, inte gästens. anon har inget här att göra.
revoke execute on function
  public.restaurant_revenue_summary(uuid, timestamptz, timestamptz),
  public.restaurant_top_items(uuid, timestamptz, timestamptz, integer),
  public.restaurant_table_revenue(uuid, timestamptz, timestamptz),
  public.restaurant_prep_times(uuid, timestamptz, timestamptz),
  public.restaurant_vat_breakdown(uuid, timestamptz, timestamptz)
  from public, anon;

grant execute on function
  public.restaurant_revenue_summary(uuid, timestamptz, timestamptz),
  public.restaurant_top_items(uuid, timestamptz, timestamptz, integer),
  public.restaurant_table_revenue(uuid, timestamptz, timestamptz),
  public.restaurant_prep_times(uuid, timestamptz, timestamptz),
  public.restaurant_vat_breakdown(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

-- Statistiken filtrerar alltid på restaurang, status och completed_at.
-- Utan indexet blir varje sidladdning en full scan av ordertabellen.
create index if not exists orders_completed_idx
  on public.orders (restaurant_id, completed_at)
  where status = 'COMPLETED';
