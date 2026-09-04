-- 0074 — Vad gästerna faktiskt beställer, som signal och inte som siffra.
--
-- Migration 0073 gav plattformens puls. Den här ger samma sak där gästen
-- faktiskt väljer: på kortet i listan och på restaurangens egen sida.
--
-- ── Bucket, inte tal ────────────────────────────────────────────────────────
--
-- Ingen av funktionerna lämnar ut HUR MÅNGA order en enskild restaurang har.
-- Det talet är restaurangens affär och skulle läsas av vem som helst — en
-- konkurrent på andra sidan gatan kan i praktiken räkna om det till omsättning.
--
-- Det som lämnas ut är ett JA eller NEJ ("hör den här till veckans mest
-- beställda?") och namnen på de rätter som beställts oftast. Det första är en
-- signal gästen kan använda; det andra är restaurangens egen meny.
--
-- ── Trösklar, av samma skäl som i 0073 ──────────────────────────────────────
--
-- En "populär" märkning som alla bär är ingen märkning. Den kräver ett
-- bottental OCH en plats bland de tio främsta, alltså kan högst tio
-- restauranger bära den samtidigt. "Gästernas favoriter" kräver att stället
-- har haft tillräckligt många order för att listan ska vara ett mönster och
-- inte tre slumpar.

create or replace function public.popular_restaurant_ids(
  p_days  integer default 7,
  p_min   integer default 10,
  p_limit integer default 10
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.restaurant_id
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.created_at > now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
    and o.status not in ('DRAFT', 'CANCELLED')
    and r.status = 'ACTIVE'
  group by o.restaurant_id
  having count(*) >= greatest(coalesce(p_min, 10), 1)
  order by count(*) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

comment on function public.popular_restaurant_ids is
  'Veckans mest beställda restauranger — bara id:n. Antalet order per restaurang lämnar aldrig databasen.';

/*
 * Rätterna gästerna väljer oftast hos en restaurang.
 *
 * Namnet tas ur `order_items.name_snapshot` och inte ur menyn: det är vad
 * gästen faktiskt beställde, och en rätt som bytt namn i menyn ska inte byta
 * namn i historiken. En rätt som tagits bort ur menyn faller däremot bort —
 * `menu_item_id` måste fortfarande peka på något som går att beställa —
 * publicerat OCH inte slut för dagen — annars pekar listan på en rätt som
 * inte finns. Kolumnen är `on delete set null`, så en borttagen rätt faller
 * ur listan av sig själv utan att historiken rörs.
 */
create or replace function public.restaurant_favourite_dishes(
  p_restaurant_id uuid,
  p_limit         integer default 3,
  p_days          integer default 30,
  p_min_orders    integer default 15
)
returns table (name text)
language sql
stable
security definer
set search_path = public
as $$
  with window_orders as (
    select o.id
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and o.created_at > now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
      and o.status not in ('DRAFT', 'CANCELLED')
  )
  select oi.name_snapshot
  from public.order_items oi
  join window_orders w on w.id = oi.order_id
  join public.menu_items mi on mi.id = oi.menu_item_id
  where mi.is_available
    and mi.status = 'PUBLISHED'
    -- Under bottentalet är listan tre slumpar och inte ett mönster.
    and (select count(*) from window_orders) >= greatest(coalesce(p_min_orders, 15), 1)
  group by oi.name_snapshot
  order by sum(oi.quantity) desc, oi.name_snapshot
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

comment on function public.restaurant_favourite_dishes is
  'De oftast beställda rätterna hos en restaurang. Namn, aldrig antal — antalet är restaurangens affär.';

grant execute on function public.popular_restaurant_ids(integer, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.restaurant_favourite_dishes(uuid, integer, integer, integer)
  to anon, authenticated, service_role;
