-- 0062 — Avgiftsändringar lämnar spår.
--
-- `restaurants.fee_override_bps` har funnits sedan migration 0002 och går att
-- ändra i backoffice sedan dess. Fältet skrivs när det tappar fokus: ingen
-- bekräftelse, ingen anteckning, ingen historik. Det som ändras är villkoren i
-- ett avtal om pengar, och efteråt går det inte att svara på vem som ändrade,
-- när, från vad, eller varför.
--
-- Kravet är dessutom uttalat: avgiften ska bara ändras VID UNDANTAGSFALL. En
-- regel som bara finns i någons huvud är ingen regel. Den här tabellen gör den
-- till något systemet kan hålla — ändringen kräver ett skäl, och skälet
-- sparas.
--
-- ── Varför en egen tabell och inte en kolumn på restaurangen ────────────────
--
-- En kolumn `fee_changed_at` hade svarat på "när senast" och tappat allt
-- annat. Frågan man faktiskt ställer ett år senare är "vad har vi kommit
-- överens om med den här restaurangen, och när ändrade vi oss" — det är en
-- historik, inte ett tillstånd.
--
-- ── Oföränderlig, av samma skäl som order_events ────────────────────────────
--
-- Regel 6 i CLAUDE.md. En logg som går att skriva om är ingen logg. Triggern
-- är samma `reject_mutation()` som order_events och loyalty_transactions
-- använder — ett beteende, inte tre.
--
-- ── NULL betyder "Burps standard" ───────────────────────────────────────────
--
-- Samma betydelse som i `restaurants.fee_override_bps`, och skillnaden mot 340
-- spelar roll: en restaurang med NULL följer med när standarden ändras, en med
-- 340 gör det inte. Loggen måste kunna skilja "vi satte 3,40 %" från "vi tog
-- bort undantaget".

create table public.fee_changes (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  -- Vem. Inte `auth.uid()` som default: raden skrivs av en serveråtgärd som
  -- redan kontrollerat rollen, och ett default hade dolt att fältet är ett
  -- krav.
  changed_by     uuid not null references auth.users(id) on delete restrict,

  -- Adressen skrivs AV på raden och slås inte upp vid läsning.
  --
  -- Två skäl. `auth.users` är inte läsbar för `authenticated` och ska inte
  -- vara det, så en uppslagning hade krävt service role för att visa en
  -- kolumn i en lista. Och en revisionslogg ska bära vem det VAR: byter
  -- personen adress, eller lämnar hen Burp, ska raden fortfarande säga vem
  -- som fattade beslutet.
  changed_by_email text not null check (length(btrim(changed_by_email)) > 0),

  previous_bps   integer check (previous_bps between 0 and 10000),
  new_bps        integer check (new_bps between 0 and 10000),

  -- Skälet är obligatoriskt och får inte vara tomt. Det är hela poängen med
  -- "endast vid undantagsfall": den som ändrar måste skriva varför, och nästa
  -- person kan läsa det.
  reason         text not null check (length(btrim(reason)) >= 3),

  created_at     timestamptz not null default now(),

  -- En rad som varken ändrar något eller tar bort ett undantag är brus i en
  -- logg som ska gå att lita på.
  constraint fee_changes_actually_changed check (previous_bps is distinct from new_bps)
);

create index fee_changes_restaurant_idx
  on public.fee_changes (restaurant_id, created_at desc);

comment on table public.fee_changes is
  'Oföränderlig historik över ändrad avgift per restaurang. NULL i bps betyder Burps standard, inte noll. Skälet är obligatoriskt — avgiften ska bara ändras vid undantagsfall.';

create trigger fee_changes_immutable
  before update or delete on public.fee_changes
  for each row execute function public.reject_mutation();

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Bara Burps egen personal. Restaurangen ser inte loggen: den innehåller våra
-- interna anteckningar om avtalet, inte deras. Vill de veta sin avgift står
-- den på avräkningen.
--
-- Regel 4 i CLAUDE.md: policy OCH grant. En policy utan grant är verkningslös
-- — rollen har då inga tabellrättigheter alls, och det felet har begåtts en
-- gång förut (migration 0012).

alter table public.fee_changes enable row level security;

create policy fee_changes_platform_read on public.fee_changes
  for select
  to authenticated
  using (public.is_platform_admin());

-- Bara `admin` och `owner`. `support` läser för att hjälpa till och ska inte
-- kunna ändra villkoren i ett avtal — samma avgränsning som avgiftsfältet
-- självt har i `setRestaurantFee`.
create policy fee_changes_platform_write on public.fee_changes
  for insert
  to authenticated
  with check (
    public.has_platform_role(array['admin', 'owner']::public.platform_role[])
    and changed_by = auth.uid()
  );

grant select, insert on public.fee_changes to authenticated;
