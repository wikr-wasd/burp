-- 0007 — Gäst: adresser, lojalitet, recensioner och favoriter (avsnitt 7, 10).

create table public.addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  label          text,                  -- "Hem", "Jobb"
  street_address text not null,
  postal_code    text not null,
  city           text not null,
  location       geography(point, 4326),
  door_code      text,
  instructions   text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default_per_user on public.addresses (user_id)
  where is_default;

create trigger addresses_touch before update on public.addresses
  for each row execute function public.touch_updated_at();

-- ── Lojalitet ───────────────────────────────────────────────────────────────
-- Saldot LAGRAS ALDRIG. `loyalty_accounts` håller bara metadata; poängen
-- räknas fram ur `loyalty_transactions` som är en ren händelselogg
-- (avsnitt 10). Ett lagrat saldo kan hamna i otakt med sina transaktioner vid
-- en misslyckad skrivning; en summa över loggen kan det inte.

create table public.loyalty_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- Null = Burps globala program. Satt = restaurangens eget program.
  restaurant_id  uuid references public.restaurants(id) on delete cascade,

  referred_by    uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index loyalty_accounts_user_key
  on public.loyalty_accounts (user_id, coalesce(restaurant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create trigger loyalty_accounts_touch before update on public.loyalty_accounts
  for each row execute function public.touch_updated_at();

create table public.loyalty_transactions (
  id             bigint generated always as identity primary key,
  account_id     uuid not null references public.loyalty_accounts(id) on delete cascade,
  order_id       uuid references public.orders(id) on delete set null,

  kind           public.loyalty_kind not null,

  -- Positivt för intjänade poäng, negativt för inlösta och utgångna.
  points         integer not null check (points <> 0),

  -- Poäng har utgångsdatum för att inte bygga upp en evig skuld (avsnitt 10).
  -- Null = går aldrig ut.
  expires_at     timestamptz,

  description    text,
  created_at     timestamptz not null default now()
);

create index loyalty_transactions_account_idx
  on public.loyalty_transactions (account_id, created_at desc);
create index loyalty_transactions_expiring_idx
  on public.loyalty_transactions (expires_at)
  where expires_at is not null and points > 0;

comment on table public.loyalty_transactions is
  'Append-only händelselogg. Saldot är summan av raderna, aldrig ett lagrat värde.';

-- ── Recensioner ─────────────────────────────────────────────────────────────
-- Betyg går BARA att lämna på en genomförd order (avsnitt 7). Kopplingen till
-- order_id, med unikt index, är det som stoppar falska recensioner. Regeln
-- enforcas dessutom av trigger i migration 0010 — ett index hindrar dubbletter
-- men inte att någon recenserar en order som aldrig slutfördes.

create table public.reviews (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete set null,

  -- Separata betyg. Ett dåligt leveransbetyg får inte dra ned maten.
  rating_food       smallint not null check (rating_food between 1 and 5),
  rating_service    smallint check (rating_service between 1 and 5),
  rating_delivery   smallint check (rating_delivery between 1 and 5),

  comment           text,
  image_url         text,

  -- Restaurangen kan svara offentligt.
  response          text,
  responded_at      timestamptz,
  responded_by      uuid references auth.users(id) on delete set null,

  is_published      boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index reviews_order_key on public.reviews (order_id);
create index reviews_restaurant_idx on public.reviews (restaurant_id, created_at desc)
  where is_published;

create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- ── Favoriter ───────────────────────────────────────────────────────────────

create table public.favorites (
  user_id        uuid not null references auth.users(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  created_at     timestamptz not null default now(),

  primary key (user_id, restaurant_id)
);

create index favorites_restaurant_idx on public.favorites (restaurant_id);
