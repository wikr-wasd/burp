-- 0001 — Grund: tillägg, enums och gemensamma hjälpfunktioner.
--
-- Konventioner som gäller i hela schemat:
--   * Pengar lagras som `integer` i ÖRE. Aldrig numeric, aldrig float.
--     149,50 kr = 14950. Se packages/core/src/money.ts för resonemanget.
--   * Procentsatser lagras i BASPUNKTER (bps). 340 = 3,40 %.
--   * Alla tabeller som tillhör en restaurang bär `restaurant_id` och skyddas
--     av RLS (migration 0009).
--   * Tidsstämplar är `timestamptz`. Sverige har sommartid; `timestamp` utan
--     tidszon skulle göra en order lagd 02:30 sista söndagen i oktober tvetydig.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "postgis";    -- geo-punkt per enhet (avsnitt 9.3)
create extension if not exists "pg_trgm";    -- fritextsök på restaurang- och rättnamn

-- ── Enums ───────────────────────────────────────────────────────────────────

create type public.restaurant_status as enum (
  'PENDING',    -- ansökt, väntar på Burps godkännande
  'ACTIVE',
  'PAUSED',     -- tillfälligt stängd av restaurangen själv
  'SUSPENDED'   -- avstängd av Burp
);

-- Roller enligt avsnitt 11. Rättigheterna sitter i RLS-policies, inte här.
create type public.staff_role as enum (
  'owner',      -- allt
  'manager',    -- drift och meny
  'staff',      -- order och bord
  'kitchen'     -- bara köksskärmen
);

create type public.order_status as enum (
  'DRAFT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED'
);

create type public.order_type as enum ('DELIVERY', 'PICKUP', 'TABLE');

create type public.table_status as enum (
  'ACTIVE',
  'LOCKED',     -- personalen har spärrat bordet (avsnitt 4.4)
  'ARCHIVED'
);

create type public.table_session_status as enum ('OPEN', 'CLOSED');

create type public.payment_status as enum (
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED'
);

create type public.payout_status as enum ('SCHEDULED', 'PAID', 'FAILED');

-- Vad Burps avgift räknas på. Öppen fråga 1 — därför konfigurerbart.
create type public.fee_base as enum ('GROSS_ITEMS', 'NET_ITEMS', 'GROSS_TOTAL');

create type public.media_kind as enum ('IMAGE', 'VIDEO');

-- All media börjar som PENDING och granskas innan den syns (avsnitt 8.3).
create type public.media_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create type public.content_status as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');

create type public.loyalty_kind as enum (
  'EARN',
  'REDEEM',
  'EXPIRE',
  'REFERRAL',
  'BIRTHDAY',
  'ADJUSTMENT'
);

-- ── Gemensamma hjälpfunktioner ──────────────────────────────────────────────

-- Håller `updated_at` aktuell utan att varje INSERT/UPDATE i applikationen
-- behöver komma ihåg det.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Slug-normalisering för URL:er: burp.se/r/{stad}/{slug}
create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(
    both '-' from regexp_replace(
      lower(
        translate(input, 'åäöÅÄÖéèêëÉÈÊËüÜñÑ', 'aaoAAOeeeeEEEEuUnN')
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

comment on function public.slugify is
  'Gör om fritext till en URL-säker slug. Svenska tecken translittereras (å→a) i stället för att strykas, så att "Kött & Bröd" blir "kott-brod" och inte "k-t-br-d".';
