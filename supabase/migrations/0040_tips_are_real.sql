-- 0040 — Dricksen blir verklig.
--
-- `tips` skrevs av `place_order` men LÄSTES inte av någon kod. Statistiken,
-- plattformsöversikten och avräkningen summerade `orders.tip_ore` i stället.
-- Två svar på samma fråga, och regel 8 i CLAUDE.md säger att dricksen har en
-- egen tabell just för att den inte får blandas ihop med omsättningen.
--
-- Att bara peka om läsarna hade inte räckt. Fyra saker var fel, alla mätta mot
-- en riktig databas innan den här migrationen skrevs:
--
--   1. `tips.payment_id` sattes bara i kortflödet. Efter en KONTANT kvittering
--      stod den kvar som null — och kontant är det vanligaste betalsättet i
--      Bosnien och Serbien. Frågan "vem betalade in den här dricksen" hade
--      alltså inget svar i precis de fall personalen ska dela på den.
--   2. En helt återbetald order behöll sin dricksrad. Gästen fick tillbaka
--      allt, personalen stod kvar som mottagare.
--   3. Ett UTKAST som aldrig betalades — kortordern som nekades — behöll sin
--      dricksrad. Dricks på mat ingen fick.
--   4. Raderna gick att skriva om och radera. En dricksliggare man kan ändra i
--      är ingen liggare.
--
-- Skillnaden mot `orders.tip_ore` efter den här migrationen, och den ska stå
-- kvar: **`orders.tip_ore` är vad gästen valde på notan. `tips` är pengar
-- personalen faktiskt fick.** Det första hör till kvittot och får aldrig ändras
-- i efterhand; det andra är det enda som ska räknas.

-- ── Återlämnad dricks ───────────────────────────────────────────────────────
--
-- Samma form som kupongen och klippkortet fick i 0038: raden står kvar och får
-- en tidpunkt. Historiken ska visa både att dricksen togs emot och att den gick
-- tillbaka — en rad som raderas svarar inte på varför kassan inte stämmer.

alter table public.tips
  add column released_at timestamptz;

comment on column public.tips.released_at is
  'Satt när ordern avbrutits eller återbetalats i sin helhet. Räknade rader är de där den är null.';

create index tips_active_idx
  on public.tips (restaurant_id, created_at desc)
  where released_at is null;

create or replace function public.release_order_tips()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tips
  set released_at = now()
  where order_id = new.id
    and released_at is null;

  return null;
end;
$$;

/*
 * CANCELLED och REFUNDED, inte bara CANCELLED.
 *
 * `release_order_holds` (0038) lämnar tillbaka kupong, klippkort och
 * presentkort när ordern AVBRYTS. Dricksen behöver båda lägena: ett utkast som
 * aldrig betalades avbryts, medan en nota som betalats och sedan lämnats
 * tillbaka går till REFUNDED. I båda fallen har personalen inga pengar.
 *
 * En DELåterbetalning släpper inte dricksen. Ordern står kvar som COMPLETED —
 * `settle_refund` flyttar den bara när hela notan är tillbaka — och samma regel
 * gäller Burps avgift i 0039: en kompenserad kall förrätt upphäver inte att
 * måltiden ägde rum.
 */
create trigger orders_release_tips
  after update of status on public.orders
  for each row
  when (new.status in ('CANCELLED', 'REFUNDED') and old.status is distinct from new.status)
  execute function public.release_order_tips();

comment on function public.release_order_tips is
  'Märker dricksen som återlämnad när ordern avbryts eller återbetalas helt. Trigger och inte anropande kod: ordern kan avbrytas från fyra håll.';

-- ── Vem betalade in dricksen ────────────────────────────────────────────────
--
-- Kopplingen gjordes förut i `confirm_order_payment` (0026) och i
-- presentkortets motsvarighet (0030) — alltså bara i de flöden en webhook
-- driver. Kontantkvitteringen i kassan har ingen sådan funktion att haka på,
-- och gick därför tomhänt.
--
-- En trigger på betalningen täcker samtliga vägar på en gång: kontant, kort,
-- presentkort, bordets gemensamma nota och den leverantör som läggs till
-- härnäst. De två uppdateringarna i 0026 och 0030 blir därmed överflödiga men
-- gör ingen skada — de sätter samma värde under samma villkor.
--
-- **Vilken betalning som får dricksen** när notan delats på flera: den som gör
-- notan slut. Ett presentkort betalar maten och kontanterna resten; det är i
-- sedlarna dricksen ligger. Regeln är också den enda som går att tillämpa utan
-- att gissa, eftersom ingen betalning bär en egen dricksuppgift.

create or replace function public.link_tip_to_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_paid  integer;
begin
  if new.status not in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED') then
    return null;
  end if;

  select total_ore into v_total from public.orders where id = new.order_id;

  select coalesce(sum(amount_ore), 0) into v_paid
  from public.payments
  where order_id = new.order_id
    and status <> 'FAILED';

  -- Notan är inte slut. Dricksen ligger kvar i det som återstår att betala.
  if v_paid < v_total then
    return null;
  end if;

  update public.tips
  set payment_id = new.id
  where order_id = new.order_id
    and payment_id is null
    and released_at is null;

  return null;
end;
$$;

-- INSERT **och** UPDATE OF status. En kortbetalning skrivs som PENDING och
-- lyfts till CAPTURED av webhooken; med bara INSERT hade den aldrig kopplats.
create trigger payments_link_tip
  after insert or update of status on public.payments
  for each row execute function public.link_tip_to_payment();

-- ── Liggaren går inte att skriva om ─────────────────────────────────────────
--
-- Samma princip som `order_events`, `loyalty_transactions` och
-- `coupon_redemptions`: beloppet är det som gör raden till bevis. Två fält får
-- ändras, och bara från tomt till ifyllt — betalningen den hör till, och
-- tidpunkten den lämnades tillbaka.

create or replace function public.guard_tip_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'En dricksrad tas aldrig bort — den märks som återlämnad'
      using errcode = 'insufficient_privilege';
  end if;

  -- En återlämnad rad är färdig. Villkoret är på OLD och inte på skillnaden
  -- mellan old och new: `now()` är samma tidpunkt i hela transaktionen, så en
  -- andra återlämning hade sett identisk ut och sluppit igenom.
  if old.released_at is not null then
    raise exception 'Dricksen är redan återlämnad'
      using errcode = 'insufficient_privilege';
  end if;

  if old.payment_id is not null and new.payment_id is distinct from old.payment_id then
    raise exception 'Dricksen är redan knuten till en betalning'
      using errcode = 'insufficient_privilege';
  end if;

  -- Jämförelsen görs på hela raden och inte kolumn för kolumn, av samma skäl
  -- som i 0038: nästa kolumn någon lägger till skyddas automatiskt.
  if (to_jsonb(new) - 'released_at' - 'payment_id')
     is distinct from (to_jsonb(old) - 'released_at' - 'payment_id') then
    raise exception 'En dricksrad kan bara knytas till en betalning eller märkas som återlämnad'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger tips_guard
  before update or delete on public.tips
  for each row execute function public.guard_tip_update();

comment on table public.tips is
  'Dricks personalen faktiskt fick. Skild från orders.tip_ore, som är vad gästen valde på notan och aldrig ändras i efterhand. Raden märks som återlämnad när ordern avbryts eller återbetalas helt.';

-- ── Dricks att fördela ──────────────────────────────────────────────────────
--
-- Personalens egen siffra, och den enda i produkten som är det. Servitören ser
-- den — RLS på `tips` ger hela personalen läsrätt (0009) och det är avsiktligt:
-- att låta ägaren ensam se hur mycket dricks som kommit in vore att göra
-- personalens pengar till en företagsuppgift.
--
-- SECURITY INVOKER, som all annan statistik. RLS avgör vad som räknas med.

create or replace function public.restaurant_tips_summary(
  p_restaurant_id uuid,
  p_from          timestamptz,
  p_to            timestamptz
)
returns table (
  tips_ore    bigint,
  cash_ore    bigint,
  card_ore    bigint,
  pending_ore bigint
)
language sql
stable
as $$
  select
    coalesce(sum(t.amount_ore), 0)::bigint                                   as tips_ore,
    coalesce(sum(t.amount_ore) filter (where p.provider = 'CASH'), 0)::bigint as cash_ore,
    coalesce(sum(t.amount_ore) filter (
      where p.id is not null and p.provider <> 'CASH'
    ), 0)::bigint                                                            as card_ore,
    -- Notan är serverad men inte betald. Pengarna finns inte än, och en siffra
    -- som blandar ihop dem med sedlarna i lådan går inte att stämma av mot.
    coalesce(sum(t.amount_ore) filter (where p.id is null), 0)::bigint       as pending_ore
  from public.tips t
  join public.orders o on o.id = t.order_id
  left join public.payments p on p.id = t.payment_id
  where t.restaurant_id = p_restaurant_id
    and t.released_at is null
    and o.completed_at >= p_from
    and o.completed_at < p_to;
$$;

revoke execute on function public.restaurant_tips_summary(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.restaurant_tips_summary(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

comment on function public.restaurant_tips_summary is
  'Dricks att fördela för en period, delad på hur den kom in. Läser tips och inte orders.tip_ore — se migration 0040.';

-- ── Läsarna pekas om ────────────────────────────────────────────────────────
--
-- Tre funktioner summerade `orders.tip_ore`. De läser nu liggaren i stället, så
-- att en återlämnad dricks slutar räknas överallt samtidigt.
--
-- För statistiken och plattformsöversikten ändras ingen siffra i praktiken:
-- båda filtrerar redan på COMPLETED, och en avbruten eller återbetald order är
-- inte det. Avräkningen är undantaget — den tar med REFUNDED med flit, för att
-- en helt återbetald order annars hade fallit ur bruttot samtidigt som
-- återbetalningen drogs av. Där räknades dricksen på en återbetald nota med
-- fram till nu.

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
    count(*)                                              as orders_count,
    coalesce(sum(o.items_gross_ore), 0)                   as items_gross_ore,
    coalesce(sum(o.items_vat_ore), 0)                     as items_vat_ore,
    coalesce(sum(o.items_gross_ore - o.items_vat_ore), 0) as items_net_ore,
    coalesce(sum(tip.amount_ore), 0)::bigint              as tips_ore,
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
    ), 0)                                                 as fees_ore,
    case when count(*) = 0 then 0
         else (sum(o.items_gross_ore) / count(*))::bigint
    end                                                   as avg_order_ore
  from public.orders o
  -- Lateral och inte en vanlig join: en order kan få fler dricksrader den dag
  -- dricks efter måltiden byggs, och en rad per dricks hade dubblerat bruttot.
  left join lateral (
    select coalesce(sum(t.amount_ore), 0) as amount_ore
    from public.tips t
    where t.order_id = o.id and t.released_at is null
  ) tip on true
  where o.restaurant_id = p_restaurant_id
    and o.status = 'COMPLETED'
    and o.completed_at >= p_from
    and o.completed_at < p_to;
$$;

comment on function public.restaurant_revenue_summary is
  'Omsättning för en period. Bara COMPLETED räknas. Avgiften läses ur fees och dricksen ur tips — inte räknade på nytt, och inte ur ordern.';

create or replace function public.platform_revenue_by_currency(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  currency         public.currency_code,
  orders_count     bigint,
  gmv_ore          bigint,
  burp_revenue_ore bigint,
  tips_ore         bigint
)
language sql
stable
as $$
  select
    o.currency,
    count(o.id)                                       as orders_count,
    -- GMV: det som gick genom plattformen, inte det Burp behöll.
    coalesce(sum(o.items_gross_ore), 0)::bigint       as gmv_ore,
    coalesce(sum(f.fee_ore), 0)::bigint               as burp_revenue_ore,
    coalesce(sum(tip.amount_ore), 0)::bigint          as tips_ore
  from public.orders o
  left join public.fees f on f.order_id = o.id
  left join lateral (
    select coalesce(sum(t.amount_ore), 0) as amount_ore
    from public.tips t
    where t.order_id = o.id and t.released_at is null
  ) tip on true
  where o.status = 'COMPLETED'
    and o.completed_at >= p_from
    and o.completed_at < p_to
  group by o.currency
  order by gmv_ore desc;
$$;

comment on function public.platform_revenue_by_currency is
  'Burps omsättning per valuta. En rad per valuta — belopp från olika valutor läggs aldrig ihop. Dricksen läses ur tips.';

create or replace function public.settlement_preview(
  p_restaurant_id uuid,
  p_period_start  date,
  p_period_end    date
)
returns table (
  currency        public.currency_code,
  orders_count    bigint,
  gross_ore       bigint,
  tips_ore        bigint,
  cash_ore        bigint,
  fees_ore        bigint,
  refunds_ore     bigint,
  fee_credit_ore  bigint,
  amount_due_ore  bigint
)
language sql
stable
as $$
  with span as (
    select public.restaurant_period_range(p_restaurant_id, p_period_start, p_period_end) as at
  ),
  sold as (
    select
      count(*)                                     as orders_count,
      coalesce(sum(o.items_gross_ore), 0)::bigint  as gross_ore,
      -- Dricksen läses ur liggaren. Bruttot tar med REFUNDED med flit, men
      -- dricksen på en helt återbetald nota gick tillbaka till gästen och ska
      -- inte stå kvar som personalens.
      coalesce(sum(tip.amount_ore), 0)::bigint     as tips_ore,
      coalesce(sum(f.fee_ore), 0)::bigint          as fees_ore,
      count(distinct o.currency)                   as currencies,
      min(o.currency)                              as currency
    from public.orders o
    left join public.fees f on f.order_id = o.id
    left join lateral (
      select coalesce(sum(t.amount_ore), 0) as amount_ore
      from public.tips t
      where t.order_id = o.id and t.released_at is null
    ) tip on true
    cross join span
    where o.restaurant_id = p_restaurant_id
      and o.status in ('COMPLETED', 'REFUNDED')
      and span.at @> o.completed_at
  ),
  cash as (
    select coalesce(sum(p.amount_ore), 0)::bigint as cash_ore
    from public.payments p
    cross join span
    where p.restaurant_id = p_restaurant_id
      and p.provider = 'CASH'
      and p.status in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      and span.at @> p.captured_at
  ),
  given_back as (
    select coalesce(sum(rf.amount_ore), 0)::bigint as refunds_ore
    from public.refunds rf
    cross join span
    where rf.restaurant_id = p_restaurant_id
      and rf.status = 'SUCCEEDED'
      and span.at @> rf.settled_at
  ),
  credited as (
    select coalesce(sum(f.fee_ore), 0)::bigint as fee_credit_ore
    from public.orders o
    join public.fees f on f.order_id = o.id
    cross join span
    where o.restaurant_id = p_restaurant_id
      and o.status = 'REFUNDED'
      and span.at @> (
        select max(rf.settled_at)
        from public.refunds rf
        where rf.order_id = o.id and rf.status = 'SUCCEEDED'
      )
  )
  select
    case
      when sold.currencies > 1 then null
      else coalesce(
        sold.currency,
        (select r.currency from public.restaurants r where r.id = p_restaurant_id)
      )
    end,
    sold.orders_count,
    sold.gross_ore,
    sold.tips_ore,
    cash.cash_ore,
    sold.fees_ore,
    given_back.refunds_ore,
    credited.fee_credit_ore,
    sold.fees_ore - credited.fee_credit_ore
  from sold, cash, given_back, credited;
$$;

-- ── Historiken städas ───────────────────────────────────────────────────────
--
-- Dricksrader som redan hör till en avbruten eller återbetald order märks som
-- återlämnade en gång, här. Utan det hade regeln gällt framåt men inte bakåt,
-- och de första rapporterna efter migrationen visat dricks som gått tillbaka
-- för länge sedan.

update public.tips t
set released_at = coalesce(o.cancelled_at, o.updated_at)
from public.orders o
where o.id = t.order_id
  and t.released_at is null
  and o.status in ('CANCELLED', 'REFUNDED');
