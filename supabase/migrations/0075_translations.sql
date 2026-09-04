-- 0075 — Cachen för maskinöversatt text (öppen fråga 16).
--
-- Beslutet 2026-09-04: gästen ska läsa restaurangens text på sitt språk, och
-- restaurangen ska läsa gästens text på sitt. "Alla i Bosnien kan inte
-- engelska" — och en svensk gäst kan inte bosniska.
--
-- ── Nyckeln är innehållet, inte raden ───────────────────────────────────────
--
-- Uppslaget sker på en hash av TEXTEN plus målspråket, aldrig på (tabell, id,
-- fält). Två följder, båda önskade:
--
--   1. En ändrad rätt får en ny nyckel. Den gamla översättningen blir oanvänd
--      i stället för FEL, och ingen invalideringskod behöver skrivas — den
--      sortens kod glöms bort och lämnar gammal text kvar i månader.
--   2. "utan lök" skrivs av tusen gäster och översätts EN gång, för hela
--      plattformen. Det är skillnaden mellan en kostnad och en avgift.
--
-- ── Varför tabellen inte är publikt läsbar ──────────────────────────────────
--
-- Därför att den är innehållsadresserad och därmed BLIND för vem texten hör
-- till. Samma tabell bär en rättbeskrivning som vem som helst får se och ett
-- meddelande till köket — "allergisk mot nötter, bord 6" — som ingen utanför
-- restaurangen ska se. En policy kan inte skilja dem åt, eftersom raden inte
-- vet vad den är.
--
-- Alltså: ingen åtkomst alls utom service role, och uppslaget görs på servern
-- av `lib/translate.ts`. Frågan dit är alltid `where source_hash = any(...)`,
-- alltså aldrig ett svep över tabellen.
--
-- ── Vad som ALDRIG går den här vägen ────────────────────────────────────────
--
-- Allergener (koder sedan 0071 — en maskin som gissar fel på nötter ger ett
-- svar man inte vill ge en allergiker), priser, och restaurangens namn.

create table public.translations (
  -- Hashen ÄR nyckeln. sha256 i hex av "<målspråk>\n<normaliserad text>".
  source_hash    text primary key check (source_hash ~ '^[0-9a-f]{64}$'),

  target_locale  text not null check (target_locale in ('bs', 'en', 'de', 'no', 'sv')),

  -- Vad motorn svarade. Kan vara identisk med källan när källan redan var på
  -- målspråket — och då är `translated` false, så att gränssnittet inte
  -- påstår att något översatts.
  text           text not null,
  translated     boolean not null default true,

  -- Vad motorn trodde att källan var. Bara för felsökning; ingenting räknar
  -- på den. Null när motorn inte sa något.
  source_locale  text,

  -- 'GOOGLE' i dag. Byter vi motor vill vi kunna se vilka rader som kom från
  -- vilken — en översättning är inte en sanning, den är en leverantörs svar.
  provider       text not null,

  created_at     timestamptz not null default now()
);

create index translations_created_idx on public.translations (created_at);

alter table public.translations enable row level security;

/*
 * En policy som säger NEJ, i stället för ingen policy alls.
 *
 * Utfallet är detsamma — RLS utan policy låser tabellen lika hårt — men de två
 * ser olika ut för den som läser schemat om ett år. "Ingen policy" är också
 * hur en GLÖMD policy ser ut, och `verify-schema.sh` flaggar därför varje
 * sådan tabell. Den här raden gör avsikten till något någon skrivit.
 *
 * Service role kringgår RLS och är den enda vägen in — se kommentaren ovan om
 * varför en policy inte KAN skilja publik text från privat i en
 * innehållsadresserad tabell.
 */
create policy translations_no_one_reads on public.translations
  for all to anon, authenticated
  using (false)
  with check (false);

grant select, insert on public.translations to service_role;

comment on table public.translations is
  'Cache för maskinöversatt användartext. Nyckeln är hash(målspråk + text) — inte raden texten kom från. Endast service role; tabellen kan inte skilja publik text från privat.';
