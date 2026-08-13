-- 0006 — Pengar: betalningar, dricks, Burps avgift och utbetalningar (avsnitt 6).
--
-- ⚠️ Ingen betalleverantör är beslutad (öppen fråga 5). Schemat är därför
-- leverantörsneutralt: `provider` + `provider_reference` räcker för Stripe
-- Connect, Adyen for Platforms eller Klarna utan schemaändring.

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete restrict,
  restaurant_id       uuid not null references public.restaurants(id) on delete restrict,

  amount_ore          integer not null check (amount_ore > 0),
  currency            char(3) not null default 'SEK',

  provider            text not null,             -- 'stripe', 'adyen', 'klarna'
  provider_reference  text,                      -- PaymentIntent-id el. motsv.
  method              text,                      -- 'card', 'swish', 'apple_pay'

  status              public.payment_status not null default 'PENDING',

  -- Idempotensnyckel (avsnitt 12). Dubbeltryck får aldrig ge dubbla
  -- debiteringar. Nyckeln skickas även till leverantören.
  idempotency_key     uuid not null,

  -- Rått svar från leverantören. Sparas för att kunna reda ut en tvist utan
  -- att behöva logga in i leverantörens portal.
  provider_payload    jsonb not null default '{}'::jsonb,

  authorized_at       timestamptz,
  captured_at         timestamptz,
  failed_at           timestamptz,
  failure_reason      text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index payments_idempotency_key on public.payments (idempotency_key);
create unique index payments_provider_ref_key on public.payments (provider, provider_reference)
  where provider_reference is not null;
create index payments_order_idx on public.payments (order_id);
create index payments_restaurant_idx on public.payments (restaurant_id, created_at desc);

create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ── tips ────────────────────────────────────────────────────────────────────
-- Egen tabell, helt skild från ordersumman (avsnitt 6.3).
--
-- Dricks är gästens pengar till personalen, inte restaurangens omsättning.
-- Blandas den in i ordersumman blir både Burps avgiftsunderlag och
-- restaurangens bokföring fel.
--
-- ⚠️ Dricks har skatte- och redovisningsregler. Ta det med en revisor innan
-- lansering — schemat säger ingenting om hur den ska beskattas.

create table public.tips (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete restrict,
  restaurant_id  uuid not null references public.restaurants(id) on delete restrict,
  payment_id     uuid references public.payments(id) on delete set null,

  amount_ore     integer not null check (amount_ore > 0),

  -- Hur gästen valde: procent av ordern eller fast belopp.
  chosen_as      text not null default 'AMOUNT' check (chosen_as in ('PERCENT', 'AMOUNT')),
  chosen_bps     integer check (chosen_bps between 0 and 10000),

  -- Dricks kan ges efter måltiden, kopplat till betygsteget (avsnitt 7).
  given_after_meal boolean not null default false,

  created_at     timestamptz not null default now()
);

create index tips_order_idx on public.tips (order_id);
create index tips_restaurant_idx on public.tips (restaurant_id, created_at desc);

-- ── fees ────────────────────────────────────────────────────────────────────
-- Burps avgift per order.
--
-- Bas, procentsats OCH beräknat belopp sparas per rad. Det gör att
-- avgiftsmodellen kan ändras utan att historiken skrivs om — en order från
-- i fjol visar fortfarande vad som faktiskt togs ut då.

create table public.fees (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete restrict,
  restaurant_id       uuid not null references public.restaurants(id) on delete restrict,

  base                public.fee_base not null,
  base_amount_ore     integer not null check (base_amount_ore >= 0),
  bps                 integer not null check (bps between 0 and 10000),
  fee_ore             integer not null check (fee_ore >= 0),

  -- Betalleverantörens egen avgift. NULL tills öppen fråga 1 är besvarad:
  -- ligger kortavgiften ovanpå 3,4 % eller inuti? Kolumnen finns så att svaret
  -- kan börja registreras samma dag det kommer, utan migration.
  provider_fee_ore    integer check (provider_fee_ore >= 0),

  created_at          timestamptz not null default now()
);

create unique index fees_order_key on public.fees (order_id);
create index fees_restaurant_idx on public.fees (restaurant_id, created_at desc);

comment on table public.fees is
  'En rad per order. Bas, procentsats och belopp sparas tillsammans så att avgiftsmodellen kan ändras utan att historiken skrivs om. Se docs/OPEN-QUESTIONS.md fråga 1.';

-- ── payouts ─────────────────────────────────────────────────────────────────

create table public.payouts (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete restrict,

  period_start        date not null,
  period_end          date not null,

  gross_ore           integer not null check (gross_ore >= 0),
  fees_ore            integer not null check (fees_ore >= 0),
  tips_ore            integer not null default 0 check (tips_ore >= 0),
  refunds_ore         integer not null default 0 check (refunds_ore >= 0),
  net_ore             integer not null,

  status              public.payout_status not null default 'SCHEDULED',
  provider            text,
  provider_reference  text,
  paid_at             timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint payouts_period_order check (period_start <= period_end)
);

create unique index payouts_period_key on public.payouts (restaurant_id, period_start, period_end);
create index payouts_restaurant_idx on public.payouts (restaurant_id, period_end desc);

create trigger payouts_touch before update on public.payouts
  for each row execute function public.touch_updated_at();

-- ── Kassaregister ───────────────────────────────────────────────────────────
-- ⚠️ Sverige har krav på certifierat kassaregister vid försäljning på plats.
-- Hur kravet slår mot ett QR-flöde där gästen betalar i sin egen telefon är
-- INTE utrett (öppen fråga 4) — fråga Skatteverket eller en skattejurist innan
-- ni går live.
--
-- Tabellen finns så att en kassaregisterintegration kan läggas till utan
-- ombyggnad. Den fylls inte av någon kod idag.

create table public.register_receipts (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete restrict,
  restaurant_id       uuid not null references public.restaurants(id) on delete restrict,
  provider            text not null,
  receipt_number      text,
  control_code        text,
  payload             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create unique index register_receipts_order_key on public.register_receipts (order_id);
