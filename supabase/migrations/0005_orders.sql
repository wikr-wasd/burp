-- 0005 — Order, orderrader och händelselogg (avsnitt 5).

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete restrict,
  location_id       uuid references public.locations(id) on delete set null,

  -- Gästen. NULL för anonym QR-beställning vid bordet — det är hela poängen
  -- med QR-flödet att inget konto ska krävas (avsnitt 4).
  guest_id          uuid references auth.users(id) on delete set null,

  -- Kopplingen till bordet. `orders.table_id` är den ENDA koppling som behövs
  -- för att restaurangen ska få omsättning per bord, aktiva bord just nu och
  -- tid från beställning till servering (avsnitt 4.3).
  table_id          uuid references public.tables(id) on delete set null,
  table_session_id  uuid references public.table_sessions(id) on delete set null,

  type              public.order_type not null,
  status            public.order_status not null default 'DRAFT',

  -- Belopp i öre. Ögonblicksbild vid beställningstillfället — ändras menyn
  -- i morgon ska kvittot fortfarande visa vad gästen betalade.
  items_gross_ore   integer not null default 0 check (items_gross_ore >= 0),
  items_vat_ore     integer not null default 0 check (items_vat_ore >= 0),

  -- Moms uppdelad per sats: {"1200": 1596, "2500": 1780}. En order kan blanda
  -- 12 % mat och 25 % alkohol och bokföringen behöver dem åtskilda.
  vat_by_rate       jsonb not null default '{}'::jsonb,

  delivery_fee_ore  integer not null default 0 check (delivery_fee_ore >= 0),
  discount_ore      integer not null default 0 check (discount_ore <= 0),
  tip_ore           integer not null default 0 check (tip_ore >= 0),
  total_ore         integer not null default 0 check (total_ore >= 0),

  note              text,

  -- Schemalagd beställning (avsnitt 5.3). Ordern släpps till köket
  -- `prep_time_minutes` innan denna tid.
  scheduled_for     timestamptz,
  released_at       timestamptz,

  -- Idempotensnyckel (avsnitt 12). Dubbeltryck på "Beställ" får aldrig bli
  -- två notor.
  idempotency_key   uuid not null,

  placed_at         timestamptz,
  accepted_at       timestamptz,
  ready_at          timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- En bordsorder måste ha ett bord, och bara en bordsorder får ha ett.
  constraint orders_table_requires_type check (
    (type = 'TABLE' and table_id is not null)
    or (type <> 'TABLE' and table_id is null)
  )
);

create unique index orders_idempotency_key on public.orders (restaurant_id, idempotency_key);

-- Köksskärmen frågar "vilka order är aktiva just nu?" flera gånger per minut.
-- Partiellt index gör att den bara läser de raderna, inte hela historiken.
create index orders_kitchen_idx on public.orders (restaurant_id, status, placed_at)
  where status in ('PLACED', 'ACCEPTED', 'PREPARING', 'READY');

create index orders_restaurant_created_idx on public.orders (restaurant_id, created_at desc);
create index orders_table_idx on public.orders (table_id, created_at desc) where table_id is not null;
create index orders_session_idx on public.orders (table_session_id) where table_session_id is not null;
create index orders_guest_idx on public.orders (guest_id, created_at desc) where guest_id is not null;
create index orders_scheduled_idx on public.orders (scheduled_for)
  where scheduled_for is not null and released_at is null;

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ── order_items ─────────────────────────────────────────────────────────────
-- Ögonblicksbild av namn och pris. `menu_item_id` finns kvar för statistik men
-- får aldrig läsas för att visa vad ordern kostade.

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,

  -- ON DELETE SET NULL: en rätt som tas bort ur menyn får inte radera
  -- historiken över vad som sålts.
  menu_item_id     uuid references public.menu_items(id) on delete set null,

  name_snapshot    text not null,
  unit_price_ore   integer not null check (unit_price_ore >= 0),
  vat_rate_bps     integer not null check (vat_rate_bps between 0 and 10000),
  quantity         smallint not null check (quantity > 0),
  line_gross_ore   integer not null check (line_gross_ore >= 0),

  note             text,     -- "utan lök"
  created_at       timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_menu_item_idx on public.order_items (menu_item_id, created_at desc);

create table public.order_item_options (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references public.order_items(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  option_id      uuid references public.options(id) on delete set null,
  name_snapshot  text not null,
  price_ore      integer not null,
  created_at     timestamptz not null default now()
);

create index order_item_options_item_idx on public.order_item_options (order_item_id);

-- ── order_events ────────────────────────────────────────────────────────────
-- Logg över varje statusändring och varje ändring gästen gjort (avsnitt 5.2).
-- Det ska alltid gå att se vem som ändrade vad och när — både för supporten
-- och för att kunna reda ut en tvist om en order.

create table public.order_events (
  id             bigint generated always as identity primary key,
  order_id       uuid not null references public.orders(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  event_type     text not null,          -- 'STATUS_CHANGED', 'ITEM_ADDED', ...
  from_status    public.order_status,
  to_status      public.order_status,

  -- Vem. NULL = gästen (anonym vid bordet) eller systemet.
  actor_id       uuid references auth.users(id) on delete set null,
  actor_kind     text not null default 'SYSTEM'
    check (actor_kind in ('GUEST', 'STAFF', 'SYSTEM', 'WEBHOOK')),

  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at);
create index order_events_restaurant_idx on public.order_events (restaurant_id, created_at desc);

comment on table public.order_events is
  'Append-only. Rader får aldrig uppdateras eller raderas — loggen är värdelös om den går att skriva om i efterhand. Enforcas av policy i migration 0009.';
