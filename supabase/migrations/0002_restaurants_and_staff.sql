-- 0002 — Restaurang, enheter, personal och gästprofiler.

-- ── profiles ────────────────────────────────────────────────────────────────
-- Speglar auth.users. Supabase äger inloggningen; allt vi vill veta om
-- personen utöver e-post ligger här.

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  phone         text,
  email         text,
  birth_date    date,          -- för födelsedagsbelöning (avsnitt 10)
  marketing_opt_in boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Skapar profilen automatiskt när ett konto registreras, så att ingen kodväg
-- kan glömma bort det och lämna en användare utan profil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── restaurants ─────────────────────────────────────────────────────────────

create table public.restaurants (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null,
  description     text,
  org_number      text not null,

  -- Adress och geo. `city_slug` är denormaliserad ur `city` för att URL:en
  -- burp.se/r/{stad}/{slug} ska kunna slås upp med ett index i stället för en
  -- funktion över kolumnen.
  street_address  text not null,
  postal_code     text not null,
  city            text not null,
  city_slug       text generated always as (public.slugify(city)) stored,
  location        geography(point, 4326),
  phone           text,
  email           text,

  cuisines        text[] not null default '{}',
  price_tier      smallint check (price_tier between 1 and 4),
  hero_image_url  text,

  -- Öppettider som JSONB: { "mon": [{"opens":"11:00","closes":"22:00"}], ... }
  -- Flera pass per dag (lunch + kväll) är vanligt, därför en array per dag.
  opening_hours   jsonb not null default '{}'::jsonb,

  -- Restaurangens regler för vad gästen får ändra (avsnitt 5.2).
  order_policy    jsonb not null default jsonb_build_object(
    'edit_window_seconds', 120,
    'editable_until_status', 'ACCEPTED',
    'allow_add_items', true,
    'allow_remove_items', true,
    'allow_change_options', false,
    'allow_cancel_until_status', 'PREPARING',
    'auto_accept', false,
    'prep_time_minutes', 20,
    'allow_scheduled_orders', false
  ),

  -- Avgiftsavtalet. `fee_override_bps` null = Burps standard (340) gäller.
  -- Se docs/OPEN-QUESTIONS.md fråga 1 innan detta låses.
  fee_base           public.fee_base not null default 'GROSS_ITEMS',
  fee_override_bps   integer check (fee_override_bps between 0 and 10000),

  status          public.restaurant_status not null default 'PENDING',

  -- Cachat snittbetyg (avsnitt 7). Räknas om av trigger i migration 0010 —
  -- en sökträff får inte kosta en aggregering över alla recensioner.
  rating_average  numeric(2,1),
  rating_count    integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint restaurants_org_number_format check (org_number ~ '^\d{10}$')
);

-- Sluggen måste vara unik inom staden, inte globalt: två städer får ha var sin
-- "pizzeria-roma" utan att krocka.
create unique index restaurants_city_slug_key on public.restaurants (city_slug, slug);
create unique index restaurants_org_number_key on public.restaurants (org_number);
create index restaurants_status_idx on public.restaurants (status) where status = 'ACTIVE';
create index restaurants_location_idx on public.restaurants using gist (location);
create index restaurants_name_trgm_idx on public.restaurants using gin (name gin_trgm_ops);
create index restaurants_cuisines_idx on public.restaurants using gin (cuisines);

create trigger restaurants_touch before update on public.restaurants
  for each row execute function public.touch_updated_at();

-- ── locations ───────────────────────────────────────────────────────────────
-- Kedjor med flera enheter (Fas 5). Finns med redan nu så att `orders` kan
-- peka på en enhet utan att schemat behöver byggas om senare.

create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  name            text not null,
  street_address  text not null,
  postal_code     text not null,
  city            text not null,
  location        geography(point, 4326),
  opening_hours   jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index locations_restaurant_idx on public.locations (restaurant_id);
create index locations_geo_idx on public.locations using gist (location);

create trigger locations_touch before update on public.locations
  for each row execute function public.touch_updated_at();

-- ── staff ───────────────────────────────────────────────────────────────────
-- Kopplingen användare ↔ restaurang. Den här tabellen är navet i hela
-- RLS-modellen: varje policy frågar "finns en rad här för mig?".

create table public.staff (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           public.staff_role not null default 'staff',
  is_active      boolean not null default true,
  invited_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (restaurant_id, user_id)
);

create index staff_user_idx on public.staff (user_id) where is_active;
create index staff_restaurant_idx on public.staff (restaurant_id) where is_active;

create trigger staff_touch before update on public.staff
  for each row execute function public.touch_updated_at();

comment on table public.staff is
  'Navet i RLS-modellen. En rad = en person har tillgång till en restaurang med en roll. Varje policy i migration 0009 går via public.is_staff_of().';
