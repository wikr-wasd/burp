-- 0071 — Allergener blir koder.
--
-- ── Vad som var fel ─────────────────────────────────────────────────────────
--
-- `menu_items.allergens` var fritext, och personalytan bad om dem
-- "kommaseparerade". I den lokala datan stod redan `mleko` och `mlijeko` sida
-- vid sida — samma allergen, två stavningar, två restauranger.
--
-- Två följder, och den andra är allvarlig:
--
--   1. Den som söker en rätt utan mjölk hittade hälften.
--   2. En svensk gäst i Sarajevo läste "mlijeko" och förstod ingenting.
--
-- `CLAUDE.md` säger att allergenlistans ETIKETT översätts "därför att det är
-- det enda stället på menyn där en gäst som inte förstår riskerar något värre
-- än en missad rätt". Etiketten översattes. Innehållet gjorde det inte.
--
-- ── Varför koder och inte maskinöversättning ────────────────────────────────
--
-- En översättningstjänst kan gissa, och en gissning om nötter är inte ett svar
-- man ger en allergiker. Koder översätts av vår egen ordbok: exakt, gratis, och
-- likadant varje gång. Listan är EU:s fjorton enligt förordning 1169/2011 —
-- fler går att lägga till, färre går inte.

-- ── Engångskonvertering ─────────────────────────────────────────────────────
--
-- Kartan nedan är INTE en regel som lever vidare på två ställen. Den körs en
-- gång, på det som redan står i databasen. Framåt är det check-villkoret som
-- gäller, och `parseAllergens()` i @burp/core som tolkar inmatning.
--
-- Det som inte går att tolka faller bort. En rätt som tappar en allergen är
-- fel; en rätt som får FEL allergen är farligare, och en gissning är precis
-- det.

update public.menu_items
set allergens = coalesce((
  select array_agg(distinct kod order by kod)
  from unnest(allergens) as a(varde)
  cross join lateral (
    select case lower(btrim(a.varde))
      when 'gluten' then 'GLUTEN' when 'vete' then 'GLUTEN' when 'wheat' then 'GLUTEN'
      when 'weizen' then 'GLUTEN' when 'pšenica' then 'GLUTEN'
      when 'skaldjur' then 'CRUSTACEANS' when 'crustaceans' then 'CRUSTACEANS'
      when 'rakovi' then 'CRUSTACEANS'
      when 'ägg' then 'EGGS' when 'egg' then 'EGGS' when 'eggs' then 'EGGS'
      when 'eier' then 'EGGS' when 'jaja' then 'EGGS' when 'jaje' then 'EGGS'
      when 'fisk' then 'FISH' when 'fish' then 'FISH' when 'riba' then 'FISH'
      when 'jordnötter' then 'PEANUTS' when 'peanuts' then 'PEANUTS'
      when 'kikiriki' then 'PEANUTS'
      when 'soja' then 'SOY' when 'soy' then 'SOY' when 'soya' then 'SOY'
      when 'mjölk' then 'MILK' when 'milk' then 'MILK' when 'milch' then 'MILK'
      when 'melk' then 'MILK' when 'mlijeko' then 'MILK' when 'mleko' then 'MILK'
      when 'laktos' then 'MILK'
      when 'nötter' then 'NUTS' when 'nuts' then 'NUTS' when 'nüsse' then 'NUTS'
      when 'orašasti plodovi' then 'NUTS' when 'orasi' then 'NUTS'
      when 'selleri' then 'CELERY' when 'celery' then 'CELERY'
      when 'sellerie' then 'CELERY' when 'celer' then 'CELERY'
      when 'senap' then 'MUSTARD' when 'mustard' then 'MUSTARD'
      when 'senf' then 'MUSTARD' when 'slačica' then 'MUSTARD'
      when 'sesam' then 'SESAME' when 'sesame' then 'SESAME' when 'susam' then 'SESAME'
      when 'sulfiter' then 'SULPHITES' when 'sulphites' then 'SULPHITES'
      when 'sulfite' then 'SULPHITES' when 'sulfiti' then 'SULPHITES'
      when 'lupin' then 'LUPIN' when 'lupine' then 'LUPIN'
      when 'blötdjur' then 'MOLLUSCS' when 'molluscs' then 'MOLLUSCS'
      when 'weichtiere' then 'MOLLUSCS' when 'mekušci' then 'MOLLUSCS'
      else null
    end as kod
  ) m
  where m.kod is not null
), array[]::text[])
where array_length(allergens, 1) > 0;

-- ── Framåt gäller koderna ───────────────────────────────────────────────────
--
-- `<@` läser "är en delmängd av". En tom lista är en delmängd av allt, så
-- rätter utan allergener passerar.

alter table public.menu_items
  add constraint menu_items_allergens_are_codes
  check (allergens <@ array[
    'GLUTEN', 'CRUSTACEANS', 'EGGS', 'FISH', 'PEANUTS', 'SOY', 'MILK',
    'NUTS', 'CELERY', 'MUSTARD', 'SESAME', 'SULPHITES', 'LUPIN', 'MOLLUSCS'
  ]::text[]);

comment on column public.menu_items.allergens is
  'EU:s fjorton allergener som KODER, aldrig fritext. Översätts av ordboken i apps/web/src/lib/i18n — inte av en översättningstjänst, eftersom en gissning om nötter inte är ett svar man ger en allergiker. Listan speglas av ALLERGENS i @burp/core; ändras den ena måste den andra följa med.';
