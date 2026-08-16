-- 0023 — slugify() klarar balkanska tecken.
--
-- Funktionen translittererade svenska å ä ö och några franska tecken, men
-- strök č ć š ž đ helt. På den svenska marknaden var det rätt; på den här är
-- det förödande:
--
--   Ćevabdžinica Željo  →  evabd-inica-eljo
--
-- Adressen blir obrukbar, oläslig och osökbar. Seed-datan dolde felet eftersom
-- dess sluggar skrevs för hand — det syntes först när ansökningsfunktionen
-- började generera dem, alltså i samma stund som riktiga restauranger hade
-- börjat använda den.
--
-- Ć och Č blir båda "c", Đ blir "d". Det följer den vedertagna
-- translittereringen till latinskt alfabet utan diakriter, och är hur namnen
-- redan skrivs i URL:er och söktjänster.

create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(
    both '-' from regexp_replace(
      lower(
        translate(
          input,
          -- Svenska och franska, som förut.
          'åäöÅÄÖéèêëÉÈÊËüÜñÑ' ||
          -- Bosniska, kroatiska och serbiska. Đ/đ har ingen enkel
          -- gemenmotsvarighet i translate() utan listas i båda formerna.
          'čćšžđČĆŠŽĐ',
          'aaoAAOeeeeEEEEuUnN' ||
          'ccszdCCSZD'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

comment on function public.slugify is
  'Gör om fritext till en URL-säker slug. Svenska OCH balkanska tecken translittereras (å→a, ć→c, ž→z, đ→d) i stället för att strykas, så att "Ćevabdžinica Željo" blir "cevabdzinica-zeljo" och inte "evabd-inica-eljo".';

/*
 * `restaurants.city_slug` är en genererad kolumn över slugify(city).
 *
 * Postgres räknar inte om en STORED-kolumn när funktionen den bygger på
 * ändras. Befintliga rader bär därför fortfarande den gamla, felaktiga
 * slugen — och för seed-datan spelar det ingen roll, men för en produktion
 * som redan hunnit ta emot ansökningar gör det det.
 *
 * En tom uppdatering tvingar fram omräkningen.
 */
update public.restaurants set city = city;
