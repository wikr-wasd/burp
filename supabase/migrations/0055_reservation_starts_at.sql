-- 0055 — Bokningens starttid som egen kolumn.
--
-- `during` är ett `tstzrange` därför att exclude-villkoret i migration 0054
-- behöver ett intervall att jämföra med `&&`. Det är rätt form för spärren och
-- fel form för allt annat: PostgREST serialiserar ett range som en STRÄNG
-- (`["2026-08-28 19:00:00+00","2026-08-28 20:30:00+00")`), och varje läsare
-- tvingas då plocka isär den med en regex.
--
-- Det gjorde appen redan, i `parseRange()`. En sådan tolkning ser ut att
-- fungera tills klamrarna byter form eller tidszonen skrivs annorlunda, och då
-- går den sönder på en plats som inte har med bokningar att göra.
--
-- Kolumnen är GENERERAD och inte skriven. Den kan därför aldrig komma i otakt
-- med intervallet den härleds ur — till skillnad från två kolumner som skrivs
-- var för sig, vilket är samma skäl som lojalitetssaldot inte lagras (regel 7).

alter table public.reservations
  add column starts_at timestamptz generated always as (lower(during)) stored;

comment on column public.reservations.starts_at is
  'Bokningens starttid, härledd ur during. Genererad och aldrig skriven — en andra kolumn som skrivs för hand kommer förr eller senare i otakt med intervallet.';

-- Personalens vy frågar alltid "vad händer i dag" och sorterar på tiden.
create index reservations_starts_at_idx
  on public.reservations (restaurant_id, starts_at);
