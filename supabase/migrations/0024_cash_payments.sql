-- 0024 — Kontantbetalning registrerad av personalen (öppen fråga 6).
--
-- Fram till nu skrevs `payments` inte av någon kod alls. Tabellen fanns för en
-- betalleverantör som ännu inte är vald, och SELECT-policyn utgick från att
-- varje rad skrevs av en webhook med service role.
--
-- Kontant är inte det fallet. Där finns ingen leverantör och ingen webhook —
-- det är en människa i kassan som tar emot sedlar och kvitterar summan. Utan
-- den kvittensen finns ingen kassaavstämning och inget bekräftat underlag för
-- Burps avgift: restaurangen skulle betala 3,4 % på en siffra ingen sett.
--
-- GRANT behövs inte här. 0012 gav `authenticated` INSERT på samtliga tabeller,
-- och det som stänger dem är avsaknaden av policy. Den här migrationen öppnar
-- exakt ett hål: kontanter, på en egen slutförd order, av någon som jobbar där.

-- ── En kontantrad per order ─────────────────────────────────────────────────
--
-- `payments_idempotency_key` skyddar mot att SAMMA anrop körs två gånger, men
-- inte mot att kassan trycker "Registrera" två gånger — andra trycket bär en
-- ny nyckel. Det här indexet gör dubbelregistrering omöjlig i databasen i
-- stället för att lita på att gränssnittet hinner låsa knappen.
--
-- Partiellt på `provider = 'CASH'`: en framtida kortlösning kan behöva flera
-- rader per order (delbetalning, återbetalning) och ska inte låsas av det här.

create unique index payments_cash_order_key
  on public.payments (order_id)
  where provider = 'CASH';

-- En kontantbetalning är genomförd i samma stund den registreras. Det finns
-- inget "auktoriserad men inte dragen" när pengarna ligger i lådan, och en
-- CAPTURED-rad utan tidpunkt går inte att stämma av mot ett kassapass.
alter table public.payments
  add constraint payments_cash_is_captured
  check (provider <> 'CASH' or (status = 'CAPTURED' and captured_at is not null));

-- ── Vem får registrera ──────────────────────────────────────────────────────
--
-- `staff` ingår med flit. Det är servitören som tar emot pengarna; att kräva
-- ägaren för varje nota skulle betyda att ingen registrerar något en fredag
-- kväll. `kitchen` ingår inte — köket hanterar mat, inte kassa.
--
-- Fyra villkor, alla nödvändiga:
--
--   1. Bara kontant. Kortbetalningar skrivs av en webhook med service role när
--      en leverantör valts, aldrig av en inloggad användare.
--   2. Bara CAPTURED. Se constrainten ovan.
--   3. Bara den egna restaurangen.
--   4. Bara på en order som faktiskt är slutförd, och som hör till samma
--      restaurang som betalningsraden påstår. Utan punkt 4 kan en anställd
--      skriva en betalning på en främmande order genom att ange sitt eget
--      restaurant_id på raden.

create policy payments_insert_cash on public.payments
  for insert to authenticated
  with check (
    provider = 'CASH'
    and status = 'CAPTURED'
    and public.has_role_at(
      restaurant_id,
      array['owner', 'manager', 'staff']::public.staff_role[]
    )
    and exists (
      select 1
      from public.orders o
      where o.id = payments.order_id
        and o.restaurant_id = payments.restaurant_id
        and o.status = 'COMPLETED'
    )
  );

-- ── Vem får läsa ────────────────────────────────────────────────────────────
--
-- `payments_select_owner` (0009) ger ägare och chef allt. Servitören behöver
-- också läsa, annars kan kassavyn inte visa vilka order som ÄR betalda och
-- listan skulle be om samma nota om och om igen.
--
-- Begränsad till kontantrader. Vad korten drar in är marginalfrågor som hör
-- till ägaren, precis som statistiksidan.

create policy payments_select_cash_staff on public.payments
  for select to authenticated
  using (
    provider = 'CASH'
    and public.has_role_at(restaurant_id, array['staff']::public.staff_role[])
  );

-- Ingen UPDATE- och ingen DELETE-policy, med flit. En felregistrerad
-- kontantbetalning rättas inte genom att skriva om historien — den rättas med
-- en motbokning när återbetalningsflödet byggs. Samma princip som
-- `order_events` och `loyalty_transactions`: kassaloggen ska gå att lita på.

comment on index public.payments_cash_order_key is
  'En kontantbetalning per order. Gör dubbeltryck i kassan omöjligt i databasen, inte bara i gränssnittet.';
