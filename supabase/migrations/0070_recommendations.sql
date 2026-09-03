-- 0070 — "Andra sparade också", och Burps egna utvalda.
--
-- ── Två listor, och de får inte blandas ihop ────────────────────────────────
--
-- Rubriken "andra i området hade även dessa som favorit" är ett PÅSTÅENDE om
-- vad riktiga gäster gjort. En handplockad lista under den rubriken är inte en
-- rekommendation, den är en annons som utger sig för att vara något annat.
--
-- Det är samma tillit som `reviews` är byggd för att skydda: betyg får bara
-- komma från genomförda order, och `lib/reviews.ts` bär beslutet att skribenten
-- är pseudonym eftersom hon aldrig sagt ja till annat. En påhittad
-- popularitetslista hade underminerat exakt det.
--
-- Därför två saker:
--
--   1. `co_favourites()` — RÄKNAD ur riktiga favoriter. Rubriken stämmer.
--   2. `featured_restaurants` — Burps egna val per stad, under sin egen rubrik.
--
-- ⚠️ Om en restaurang ska kunna KÖPA sin plats i en annan stads lista är det
-- ett affärsbeslut och inte en funktion: det hör till docs/BUSINESS.md, kräver
-- ett pris, och kräver att listan märks som betald. Den här tabellen är Burps
-- redaktionella urval och ingenting annat.

-- ── 1. Det som faktiskt går att påstå ───────────────────────────────────────
--
-- Klassisk samförekomst: de som sparat något du sparat, vad sparade de mer?
-- Faller det ut tomt — vilket det gör för den som just skapat konto — svarar
-- funktionen med stadens mest sparade i stället. En tom lista är en yta som
-- ser trasig ut.
--
-- Security definer därför att `favorites_own` med rätta hindrar en gäst från
-- att läsa andras favoriter. Funktionen ger aldrig ut VEM som sparat något,
-- bara hur många — och en restaurang är inte en personuppgift.

create or replace function public.co_favourites(
  p_user_id uuid,
  p_city_slug text default null,
  p_limit integer default 6
)
returns table (restaurant_id uuid, saves integer, from_others boolean)
language sql
stable
security definer
set search_path = public
as $$
  with mina as (
    select f.restaurant_id from public.favorites f where f.user_id = p_user_id
  ),
  /*
   * Gäster som delar minst en favorit med mig. Jag själv utesluten — annars
   * rekommenderas jag mina egna val tillbaka.
   */
  liknande as (
    select distinct f.user_id
    from public.favorites f
    join mina on mina.restaurant_id = f.restaurant_id
    where f.user_id <> p_user_id
  ),
  deras as (
    select f.restaurant_id, count(*)::integer as saves
    from public.favorites f
    join liknande on liknande.user_id = f.user_id
    where f.restaurant_id not in (select restaurant_id from mina)
    group by f.restaurant_id
  ),
  /*
   * Reserven: stadens mest sparade. Används när samförekomsten är tom, alltså
   * för den som just skapat konto — och det är de flesta.
   */
  populara as (
    select f.restaurant_id, count(*)::integer as saves
    from public.favorites f
    where f.restaurant_id not in (select restaurant_id from mina)
    group by f.restaurant_id
  )
  select r.id, x.saves, x.from_others
  from (
    select d.restaurant_id, d.saves, true as from_others from deras d
    union all
    select p.restaurant_id, p.saves, false from populara p
    where not exists (select 1 from deras)
  ) x
  join public.restaurants r on r.id = x.restaurant_id
  where r.status = 'ACTIVE'
    -- Området: samma stad som gästen tittar i. Null = hela plattformen.
    and (p_city_slug is null or r.city_slug = p_city_slug)
  order by x.from_others desc, x.saves desc, r.rating_average desc nulls last, r.name
  limit p_limit;
$$;

comment on function public.co_favourites is
  'Restauranger sparade av gäster som delar en favorit med den här gästen, annars stadens mest sparade. RÄKNAD ur riktiga favoriter — rubriken "andra sparade också" måste vara sann. Ger aldrig ut vem som sparat något.';

revoke execute on function public.co_favourites(uuid, text, integer) from public, anon;
grant execute on function public.co_favourites(uuid, text, integer) to authenticated, service_role;

-- ── 2. Burps egna val, per stad ─────────────────────────────────────────────
--
-- Stad och inte restaurang-id som nyckel: urvalet gäller ett OMRÅDE. Den som
-- tittar i Mostar ska kunna få andra ställen än den som tittar i Beograd, och
-- samma restaurang kan vara utvald i flera städer — ett ställe i Sarajevo kan
-- mycket väl vara värt en resa för den som bor i Zenica.

create table public.featured_restaurants (
  id            uuid primary key default gen_random_uuid(),
  city_slug     text not null check (city_slug ~ '^[a-z0-9-]{2,64}$'),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  sort_order    integer not null default 0,
  -- Varför den valdes. Syns bara i backoffice; ett urval utan skäl blir en
  -- lista ingen vågar ändra i om ett halvår.
  note          text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  unique (city_slug, restaurant_id)
);

create index featured_restaurants_city_idx
  on public.featured_restaurants (city_slug, sort_order);

comment on table public.featured_restaurants is
  'Burps redaktionella urval per stad. INTE en popularitetslista — den räknas av co_favourites(). Blandas de två blir rubriken om vad andra gäster gillar osann.';

-- Regel 4: policy OCH grant, aldrig det ena utan det andra.
alter table public.featured_restaurants enable row level security;

create policy featured_select_public on public.featured_restaurants
  for select to anon, authenticated using (true);

create policy featured_write_platform on public.featured_restaurants
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

grant select on public.featured_restaurants to anon;
grant select, insert, update, delete on public.featured_restaurants to authenticated;
grant all on public.featured_restaurants to service_role;
