-- 0048 — Kökets egen uppskattning per order.
--
-- Gästens kvitto har hittills räknat ned från `prep_time_minutes` i
-- restaurangens orderregler — ett tal som gäller varje order dygnet runt. Det
-- är rätt som utgångsläge och fel så fort verkligheten lägger sig i: fem
-- ćevapi klockan tre är inte samma sak som femton på en fredagskväll med
-- fullsatt uteservering.
--
-- Köket vet. Den här kolumnen är stället där kocken får säga det.
--
-- ── NULL betyder "ingen har sagt något" ────────────────────────────────────
--
-- Inte noll, och inte restaurangens default kopierad in i raden. Skillnaden
-- betyder något: en order där ingen tryckt på en siffra ska följa
-- restaurangens regel också om regeln ändras efteråt, och en order där kocken
-- sagt 30 ska stå kvar på 30. Ett default i schemat hade fryst regeln vid den
-- sekund ordern lades och gjort de två fallen omöjliga att skilja åt.
--
-- Samma resonemang som `staff.locale` i 0047.
--
-- ── Varför en kolumn på ordern och inte en händelse ────────────────────────
--
-- Ändringen loggas ändå i `order_events` när statusen går vidare, och det är
-- där historiken hör hemma. Men kvittosidan renderas per request och ska inte
-- behöva läsa en logg för att veta vad som gäller nu. Kolumnen är svaret;
-- loggen är hur vi kom fram till det.

alter table public.orders
  add column prep_minutes integer,
  -- Fyra timmar är inte en gräns någon når, utan ett skydd mot ett feltryck:
  -- en kock som råkar skriva 300 ska inte lova gästen fem timmar. Undre
  -- gränsen är 1 — noll minuter är inte en uppskattning utan ett påstående om
  -- att maten redan står där.
  add constraint orders_prep_minutes_range
    check (prep_minutes is null or (prep_minutes >= 1 and prep_minutes <= 240));

comment on column public.orders.prep_minutes is
  'Kökets uppskattade tillagningstid för just den här ordern, i minuter. NULL = ingen har satt någon; kvittot faller då tillbaka på order_policy.prep_time_minutes. Sätts av personalen när ordern tas emot.';

-- ── Inga nya rättigheter ───────────────────────────────────────────────────
--
-- Kolumnen ligger på en tabell som redan har sin policy och sina grants
-- (0009 och 0012). `orders_write_staff` släpper igenom personal på den egna
-- restaurangen, vilket är exakt den som ska kunna sätta tiden — köksskärmen
-- skriver den i samma update som statusen.
--
-- Gästen kan inte skriva den. Bordssessionens väg in i ordern går genom
-- `remove_order_item` och `cancel_order`, som båda är SECURITY DEFINER och
-- bara rör de kolumner de själva namnger. En anonym gäst har ingen
-- `auth.uid()` och därmed ingen policy som släpper igenom en update alls.
