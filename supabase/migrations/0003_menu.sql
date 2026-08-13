-- 0003 — Meny: menyer, kategorier, rätter, tillvalsgrupper och tillgänglighet.

-- ── menus ───────────────────────────────────────────────────────────────────
-- En restaurang kan ha flera menyer med olika giltighetstider: lunch, kväll,
-- helg. Vilken som visas avgörs av `active_days` + tidsfönstret.

create table public.menus (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null,
  description    text,

  -- 0 = söndag … 6 = lördag, samma numrering som PostgreSQL `extract(dow)`.
  active_days    smallint[] not null default '{0,1,2,3,4,5,6}',
  active_from    time,
  active_until   time,

  status         public.content_status not null default 'DRAFT',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index menus_restaurant_idx on public.menus (restaurant_id, status);

create trigger menus_touch before update on public.menus
  for each row execute function public.touch_updated_at();

-- ── menu_categories ─────────────────────────────────────────────────────────

create table public.menu_categories (
  id             uuid primary key default gen_random_uuid(),
  menu_id        uuid not null references public.menus(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null,
  description    text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index menu_categories_menu_idx on public.menu_categories (menu_id, sort_order);

create trigger menu_categories_touch before update on public.menu_categories
  for each row execute function public.touch_updated_at();

-- ── menu_items ──────────────────────────────────────────────────────────────

create table public.menu_items (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references public.menu_categories(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  name           text not null,
  description    text,

  -- Pris INKLUSIVE moms, i öre. Svensk konsumentprissättning anges alltid
  -- inkl. moms, och det är priset gästen ser — nettot räknas fram ur det.
  price_ore      integer not null check (price_ore >= 0),

  -- Momssats i baspunkter. 1200 = 12 % (mat), 2500 = 25 % (alkohol).
  -- Satsen sitter per rad eftersom momsklassningen är restaurangens ansvar
  -- och en meny kan blanda båda.
  vat_rate_bps   integer not null default 1200 check (vat_rate_bps between 0 and 10000),

  -- EU:s 14 allergener plus restaurangens egna noteringar.
  allergens      text[] not null default '{}',

  image_url      text,

  -- `is_available` är dagens "slut för dagen"-knapp i dashboarden.
  -- `status` är den långsiktiga publiceringen.
  is_available   boolean not null default true,
  status         public.content_status not null default 'DRAFT',

  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index menu_items_category_idx on public.menu_items (category_id, sort_order);
create index menu_items_restaurant_idx on public.menu_items (restaurant_id);
create index menu_items_available_idx on public.menu_items (restaurant_id)
  where is_available and status = 'PUBLISHED';
create index menu_items_name_trgm_idx on public.menu_items using gin (name gin_trgm_ops);

create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();

-- ── option_groups och options ───────────────────────────────────────────────
-- "Välj storlek" (välj exakt 1), "Tillbehör" (välj 0–3).

create table public.option_groups (
  id             uuid primary key default gen_random_uuid(),
  menu_item_id   uuid not null references public.menu_items(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null,
  min_select     smallint not null default 0 check (min_select >= 0),
  max_select     smallint not null default 1 check (max_select >= 1),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint option_groups_min_lte_max check (min_select <= max_select)
);

create index option_groups_item_idx on public.option_groups (menu_item_id, sort_order);

create trigger option_groups_touch before update on public.option_groups
  for each row execute function public.touch_updated_at();

create table public.options (
  id               uuid primary key default gen_random_uuid(),
  option_group_id  uuid not null references public.option_groups(id) on delete cascade,
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  name             text not null,

  -- Prispåslag inkl. moms. Får vara negativt ("utan ost, −10 kr") men raden i
  -- sin helhet kan aldrig bli negativ — det kontrolleras i @burp/core.
  price_ore        integer not null default 0,

  is_available     boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index options_group_idx on public.options (option_group_id, sort_order);
create index options_restaurant_idx on public.options (restaurant_id);

create trigger options_touch before update on public.options
  for each row execute function public.touch_updated_at();

-- ── item_availability ───────────────────────────────────────────────────────
-- Schemalagd tillgänglighet, t.ex. "bara lunch" eller "slut till på fredag".
-- Skild från `menu_items.is_available` som är dagens av/på-knapp.

create table public.item_availability (
  id             uuid primary key default gen_random_uuid(),
  menu_item_id   uuid not null references public.menu_items(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  available_from timestamptz,
  available_to   timestamptz,
  -- Null = gäller alla dagar; annars samma numrering som menus.active_days.
  weekday        smallint check (weekday between 0 and 6),
  reason         text,
  created_at     timestamptz not null default now(),

  constraint item_availability_range check (
    available_from is null or available_to is null or available_from < available_to
  )
);

create index item_availability_item_idx on public.item_availability (menu_item_id);
