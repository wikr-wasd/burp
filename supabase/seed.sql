-- Testdata för lokal utveckling. Körs automatiskt av `supabase db reset`.
--
-- Marknaden är Bosnien, Serbien och Kroatien. Datan speglar det: tre länder,
-- tre valutor, tre momssystem och organisationsnummer i rätt format för
-- respektive land (JIB 13 siffror, PIB 9, OIB 11).
--
-- Rätterna är faktisk mat från regionen, inte platshållartext. En demo med
-- "Rätt 1" och "Rätt 2" går inte att bedöma; en med ćevapi och burek gör det.
--
-- ⚠️ Kör ALDRIG mot produktionsdatabasen.

-- ── Bosnien ─────────────────────────────────────────────────────────────────
-- Momssats: 17 % på allt. Ingen reducerad sats för livsmedel.

insert into public.restaurants (
  id, name, slug, description, org_number,
  street_address, postal_code, city, location,
  phone, cuisines, price_tier, status, country, currency,
  opening_hours
)
values (
  '11111111-1111-1111-1111-111111111111',
  'Ćevabdžinica Željo',
  'cevabdzinica-zeljo',
  'Ćevapi i lepinja bakad i vedugn. Samma recept sedan 1971, samma kolgrill.',
  '4200000000001',
  'Kundurdžiluk 19', '71000', 'Sarajevo',
  st_point(18.4287, 43.8595)::geography,
  '+38733447000',
  array['Bosniskt', 'Grill'],
  1,
  'ACTIVE', 'BA', 'BAM',
  -- Lunch och kväll som separata pass, samma struktur som is_restaurant_open läser.
  '{
    "mon": [{"opens": "08:00", "closes": "22:00"}],
    "tue": [{"opens": "08:00", "closes": "22:00"}],
    "wed": [{"opens": "08:00", "closes": "22:00"}],
    "thu": [{"opens": "08:00", "closes": "22:00"}],
    "fri": [{"opens": "08:00", "closes": "23:00"}],
    "sat": [{"opens": "08:00", "closes": "23:00"}],
    "sun": [{"opens": "09:00", "closes": "21:00"}]
  }'::jsonb
);

-- ── Fler restauranger, för marknadsplatsvyn ────────────────────────────────
--
-- Startsidan går inte att bedöma med en enda restaurang — filtrering, sortering
-- och tomma träfflistor syns först när det finns något att sålla bland. De här
-- har varken meny eller bord; de finns för att fylla upptäcktsytan.
--
-- `city_slug` sätts inte här. Den är en genererad kolumn (migration 0002).
--
-- `rating_average` och `rating_count` skrivs normalt av en trigger när ett
-- omdöme läggs. Här sätts de för hand så att betygen syns i listan innan
-- omdömesytan fyllts. Riktiga betyg kan bara komma från en genomförd order.

insert into public.restaurants (
  id, name, slug, description, org_number,
  street_address, postal_code, city, location,
  phone, cuisines, price_tier, status, country, currency,
  rating_average, rating_count, opening_hours
)
values
  ('11111111-1111-1111-1111-111111111112',
   'Buregdžinica Bosna', 'buregdzinica-bosna',
   'Burek rullad för hand varje morgon. Kött, spenat eller ost — inget annat.',
   '4200000000002', 'Bravadžiluk 11', '71000', 'Sarajevo',
   st_point(18.4302, 43.8590)::geography, '+38733533000',
   array['Bosniskt', 'Bageri'], 1, 'ACTIVE', 'BA', 'BAM', 4.7, 218,
   '{"mon": [{"opens": "07:00", "closes": "20:00"}],
     "tue": [{"opens": "07:00", "closes": "20:00"}],
     "wed": [{"opens": "07:00", "closes": "20:00"}],
     "thu": [{"opens": "07:00", "closes": "20:00"}],
     "fri": [{"opens": "07:00", "closes": "21:00"}],
     "sat": [{"opens": "07:00", "closes": "21:00"}],
     "sun": [{"opens": "08:00", "closes": "18:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111113',
   'Konoba Fjaka', 'konoba-fjaka',
   'Fisk från Adriatiska havet, grillad hel. Menyn beror på vad båtarna fick.',
   '12345678901', 'Ilica 42', '10000', 'Zagreb',
   st_point(15.9694, 45.8130)::geography, '+38514833000',
   array['Kroatiskt', 'Fisk'], 3, 'ACTIVE', 'HR', 'EUR', 4.5, 96,
   '{"tue": [{"opens": "12:00", "closes": "23:00"}],
     "wed": [{"opens": "12:00", "closes": "23:00"}],
     "thu": [{"opens": "12:00", "closes": "23:00"}],
     "fri": [{"opens": "12:00", "closes": "00:00"}],
     "sat": [{"opens": "12:00", "closes": "00:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111114',
   'Pekara Zagreb', 'pekara-zagreb',
   'Surdegsbageri med kroatiska klassiker. Allt bakas på plats från fyra på morgonen.',
   '12345678902', 'Tkalčićeva 8', '10000', 'Zagreb',
   st_point(15.9760, 45.8150)::geography, '+38514812000',
   array['Bageri', 'Café'], 1, 'ACTIVE', 'HR', 'EUR', 4.3, 141,
   '{"mon": [{"opens": "06:00", "closes": "18:00"}],
     "tue": [{"opens": "06:00", "closes": "18:00"}],
     "wed": [{"opens": "06:00", "closes": "18:00"}],
     "thu": [{"opens": "06:00", "closes": "18:00"}],
     "fri": [{"opens": "06:00", "closes": "18:00"}],
     "sat": [{"opens": "07:00", "closes": "15:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111115',
   'Kafana Tri Šešira', 'kafana-tri-sesira',
   'Skadarlija sedan 1864. Levande musik, långa kvällar, roštilj från kolgrill.',
   '123456789', 'Skadarska 29', '11000', 'Beograd',
   st_point(20.4650, 44.8195)::geography, '+381112476000',
   array['Serbiskt', 'Grill'], 3, 'ACTIVE', 'RS', 'RSD', 4.6, 312,
   '{"mon": [{"opens": "11:00", "closes": "01:00"}],
     "tue": [{"opens": "11:00", "closes": "01:00"}],
     "wed": [{"opens": "11:00", "closes": "01:00"}],
     "thu": [{"opens": "11:00", "closes": "01:00"}],
     "fri": [{"opens": "11:00", "closes": "02:00"}],
     "sat": [{"opens": "11:00", "closes": "02:00"}],
     "sun": [{"opens": "12:00", "closes": "23:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111116',
   'Pljeskavica Beograd', 'pljeskavica-beograd',
   'Pljeskavica med kajmak och ajvar. Snabbt, hett, inget krångel.',
   '123456790', 'Knez Mihailova 22', '11000', 'Beograd',
   st_point(20.4570, 44.8165)::geography, '+381112630000',
   array['Serbiskt', 'Snabbmat'], 1, 'ACTIVE', 'RS', 'RSD', 4.2, 187,
   '{"mon": [{"opens": "09:00", "closes": "23:00"}],
     "tue": [{"opens": "09:00", "closes": "23:00"}],
     "wed": [{"opens": "09:00", "closes": "23:00"}],
     "thu": [{"opens": "09:00", "closes": "23:00"}],
     "fri": [{"opens": "09:00", "closes": "02:00"}],
     "sat": [{"opens": "09:00", "closes": "02:00"}],
     "sun": [{"opens": "10:00", "closes": "22:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111117',
   'Aščinica Stari Grad', 'ascinica-stari-grad',
   'Hemlagat i grytor sedan gryningen. Det som är slut är slut.',
   '4200000000003', 'Mudželiti Veliki 2', '71000', 'Sarajevo',
   st_point(18.4295, 43.8588)::geography, '+38733531000',
   array['Bosniskt', 'Husmanskost'], 2, 'ACTIVE', 'BA', 'BAM', 4.4, 73,
   '{"mon": [{"opens": "09:00", "closes": "16:00"}],
     "tue": [{"opens": "09:00", "closes": "16:00"}],
     "wed": [{"opens": "09:00", "closes": "16:00"}],
     "thu": [{"opens": "09:00", "closes": "16:00"}],
     "fri": [{"opens": "09:00", "closes": "16:00"}],
     "sat": [{"opens": "09:00", "closes": "15:00"}]}'::jsonb);

-- ── Meny ────────────────────────────────────────────────────────────────────

insert into public.menus (id, restaurant_id, name, status)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Meni',
  'PUBLISHED'
);

insert into public.menu_categories (id, menu_id, restaurant_id, name, description, sort_order)
values
  ('33333333-3333-3333-3333-333333333331',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Sa roštilja', 'Sa žara na ćumur', 2),
  ('33333333-3333-3333-3333-333333333332',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Pića', 'Za uz jelo', 5),

  -- Resten av menyn. En ćevabdžinica i Sarajevo har inte tre rätter, och en
  -- meny med tre rätter går inte att bedöma: kategorinavigeringen har inget
  -- att navigera i, sökrutan visas inte alls och ingen ser hur menyn beter sig
  -- när den är längre än skärmen. Det är i den vyn QR-gästen bor.
  --
  -- Ingen fläskrätt. En ćevabdžinica i Baščaršija är halal, och en meny som
  -- inte stämmer med verkligheten är sämre testdata än ingen alls.
  ('33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Predjela', 'Za početak', 1),
  ('33333333-3333-3333-3333-333333333334',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Pite', 'Pečeno u krušnoj peći', 3),
  ('33333333-3333-3333-3333-333333333335',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Prilozi', 'Uz glavno jelo', 4),
  ('33333333-3333-3333-3333-333333333336',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Deserti', 'Za kraj', 6);

/*
 * Priser i minsta enhet, inklusive moms. Bosnien har EN momssats: 17 % på
 * allt, även dryck. Det är därför alla rader nedan har 1700 och inte två
 * olika satser som i Sverige eller Kroatien.
 *
 * 1200 fening = 12,00 KM.
 *
 * ── Beskrivningarna och allergenerna står på bosniska ──────────────────────
 *
 * De stod på svenska fram till 2026-08-22 — "Saltat mjölkfett från Vlašić",
 * "ALLERGENER: MJÖLK" — och det är inte en översättning som glömts bort utan
 * testdata som inte kan finnas. Restaurangens egen text översätts ALDRIG (se
 * CLAUDE.md), så en bosnisk ćevabdžinica med svenska rättbeskrivningar visar
 * en meny ingen gäst någonstans kan få se.
 *
 * Det gjorde varje genomgång av gästflödet ohederlig: sidan såg fel ut, och
 * felet var seedens. Beslutat av William 2026-08-22.
 *
 * Priset är att den som felsöker får slå upp ett ord ibland. Vinsten är att
 * det man ser på skärmen är det gästen ser.
 */
insert into public.menu_items (
  id, category_id, restaurant_id, name, description,
  price_ore, vat_rate_bps, allergens, is_available, status, sort_order
)
values
  ('44444444-4444-4444-4444-444444444441',
   '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Ćevapi 10 kom', 'Deset ćevapa u lepinji, sa lukom i kajmakom',
   1200, 1700, array['GLUTEN', 'MILK'], true, 'PUBLISHED', 1),

  ('44444444-4444-4444-4444-444444444442',
   '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Pljeskavica', 'Sa žara, u lepinji sa ajvarom',
   1400, 1700, array['GLUTEN'], true, 'PUBLISHED', 2),

  ('44444444-4444-4444-4444-444444444443',
   '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Bosanska kafa', 'Kuhana u džezvi, uz rahat lokum',
   350, 1700, array[]::text[], true, 'PUBLISHED', 1);

insert into public.option_groups (id, menu_item_id, restaurant_id, name, min_select, max_select)
values (
  '55555555-5555-5555-5555-555555555551',
  '44444444-4444-4444-4444-444444444441',
  '11111111-1111-1111-1111-111111111111',
  'Dodaci', 0, 3
);

insert into public.options (option_group_id, restaurant_id, name, price_ore, sort_order)
values
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'Extra kajmak', 200, 1),
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'Ajvar', 150, 2),
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'Bez luka', -100, 3);

/*
 * Resten av menyn.
 *
 * Priserna ligger i fening, allt med 17 % moms. Rätterna finns på riktigt i
 * Baščaršija — poängen med testdatan är att kunna se hur menyn ser ut för en
 * gäst, och "Rätt 4" säger ingenting om det.
 *
 * OBS för smoke.sh: tillvalsnamnen måste vara unika i hela filen. Skriptet
 * slår upp 'Extra kajmak' och 'Bez luka' på namn och förutsätter en rad.
 */
insert into public.menu_items (
  id, category_id, restaurant_id, name, description,
  price_ore, vat_rate_bps, allergens, is_available, status, sort_order
)
values
  -- Predjela
  ('44444444-4444-4444-4444-4444444444a1', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Kajmak', 'Sa Vlašića, sječen iz kace',
   400, 1700, array['MILK'], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-4444444444a2', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Ajvar domaći', 'Od pečene paprike i patlidžana',
   350, 1700, array[]::text[], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444a3', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Uštipci', 'Prženo tijesto, služi se sa kajmakom',
   600, 1700, array['GLUTEN', 'MILK'], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444a4', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Suho meso', 'Dimljena govedina, tanko narezana',
   900, 1700, array[]::text[], true, 'PUBLISHED', 4),

  -- Sa roštilja
  ('44444444-4444-4444-4444-4444444444b1', '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Ćevapi 5 kom', 'Pet ćevapa u pola lepinje — mala porcija',
   800, 1700, array['GLUTEN'], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444b2', '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Ćevapi 15 kom', 'Petnaest ćevapa u cijeloj lepinji, luk i kajmak',
   1700, 1700, array['GLUTEN', 'MILK'], true, 'PUBLISHED', 4),
  ('44444444-4444-4444-4444-4444444444b3', '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Ražnjići', 'Teletina i janjetina sa žara na ćumur',
   1600, 1700, array[]::text[], true, 'PUBLISHED', 5),
  ('44444444-4444-4444-4444-4444444444b4', '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Pileći ćevapi', 'Od piletine, za lakšu varijantu',
   1300, 1700, array['GLUTEN'], true, 'PUBLISHED', 6),

  -- Pite
  ('44444444-4444-4444-4444-4444444444c1', '33333333-3333-3333-3333-333333333334',
   '11111111-1111-1111-1111-111111111111',
   'Burek', 'Ručno savijen, sa junećim mesom i lukom',
   700, 1700, array['GLUTEN'], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-4444444444c2', '33333333-3333-3333-3333-333333333334',
   '11111111-1111-1111-1111-111111111111',
   'Sirnica', 'Sa mladim sirom',
   700, 1700, array['GLUTEN', 'MILK'], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444c3', '33333333-3333-3333-3333-333333333334',
   '11111111-1111-1111-1111-111111111111',
   'Zeljanica', 'Sa špinatom i sirom',
   700, 1700, array['GLUTEN', 'MILK'], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444c4', '33333333-3333-3333-3333-333333333334',
   '11111111-1111-1111-1111-111111111111',
   'Krompiruša', 'Sa krompirom i lukom',
   650, 1700, array['GLUTEN'], true, 'PUBLISHED', 4),

  -- Prilozi
  ('44444444-4444-4444-4444-4444444444d1', '33333333-3333-3333-3333-333333333335',
   '11111111-1111-1111-1111-111111111111',
   'Lepinja', 'Svježe pečena, iz krušne peći',
   200, 1700, array['GLUTEN'], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-4444444444d2', '33333333-3333-3333-3333-333333333335',
   '11111111-1111-1111-1111-111111111111',
   'Kiseli kupus', 'Domaći, iz kace',
   300, 1700, array[]::text[], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444d3', '33333333-3333-3333-3333-333333333335',
   '11111111-1111-1111-1111-111111111111',
   'Pomfrit', 'Prženi krompirići',
   400, 1700, array[]::text[], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444d4', '33333333-3333-3333-3333-333333333335',
   '11111111-1111-1111-1111-111111111111',
   'Zelena salata', 'Sa paradajzom i crvenim lukom',
   350, 1700, array[]::text[], true, 'PUBLISHED', 4),

  -- Pića
  ('44444444-4444-4444-4444-4444444444e1', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Čaj od nane', 'Od svježih listova',
   300, 1700, array[]::text[], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444e2', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Kiseljak 0,5 l', 'Sarajevska mineralna voda',
   250, 1700, array[]::text[], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444e3', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Coca-Cola 0,33 l', null,
   350, 1700, array[]::text[], true, 'PUBLISHED', 4),
  ('44444444-4444-4444-4444-4444444444e4', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Sok od jabuke', 'Mutni, od jabuka',
   350, 1700, array[]::text[], true, 'PUBLISHED', 5),
  -- Slut för dagen. Menyn ska kunna granskas med ett slutsålt kort i sig —
  -- det tillståndet syns annars aldrig i utvecklingsmiljön.
  ('44444444-4444-4444-4444-4444444444e5', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Kefir 0,33 l', 'Kiselo mliječno piće',
   300, 1700, array['MILK'], false, 'PUBLISHED', 6),

  -- Deserti
  ('44444444-4444-4444-4444-4444444444f1', '33333333-3333-3333-3333-333333333336',
   '11111111-1111-1111-1111-111111111111',
   'Tufahija', 'Kuhana jabuka punjena orasima, sa šlagom',
   600, 1700, array['NUTS', 'MILK'], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-4444444444f2', '33333333-3333-3333-3333-333333333336',
   '11111111-1111-1111-1111-111111111111',
   'Baklava', 'Sa orasima i agdom',
   500, 1700, array['GLUTEN', 'NUTS'], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444f3', '33333333-3333-3333-3333-333333333336',
   '11111111-1111-1111-1111-111111111111',
   'Hurmašice', 'Natopljene agdom',
   450, 1700, array['GLUTEN'], true, 'PUBLISHED', 3);

/*
 * En obligatorisk storleksgrupp.
 *
 * Ražnjići har inget eget pris förrän gästen valt portion, och det är precis
 * det fallet menykortets "Från 16,00 KM" finns för. Utan en sådan grupp i
 * testdatan går prisintervallet inte att se någonstans.
 */
insert into public.option_groups (id, menu_item_id, restaurant_id, name, min_select, max_select)
values (
  '55555555-5555-5555-5555-555555555552',
  '44444444-4444-4444-4444-4444444444b3',
  '11111111-1111-1111-1111-111111111111',
  'Veličina', 1, 1
);

insert into public.options (option_group_id, restaurant_id, name, price_ore, sort_order)
values
  ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', 'Mala — 4 spett', 0, 1),
  ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', 'Velika — 6 spett', 500, 2);

-- ── Bord ────────────────────────────────────────────────────────────────────
--
-- `qr_public_id` är bara de sex första tecknen. Den fullständiga QR-URL:en
-- kräver HMAC-signaturen, som beror på QR_TOKEN_SECRET och därför inte kan
-- ligga i en SQL-fil. Skriv ut de körbara länkarna med:
--
--     node scripts/print-qr-links.mjs
--
-- Femton bord och inte tre.
--
-- Samma skäl som menyn har tjugosju rätter: tre bord går inte att bedöma.
-- Planritningen ritar dem i rummets form, och tre prickar i ett tomt rutnät
-- visar varken om rummet läses rätt, om numren är läsbara när borden står
-- tätt, eller om färgerna går att skilja åt på en meters håll. Det är i den
-- vyn servitören står när hon ska avgöra vilket bord som ropar.
--
-- Bord 1, 2 och 3 behåller sina koder. De står i planen för genomgången och
-- i utskrivna dekaler; ett bord som byter kod är ett bord som slutar fungera.
insert into public.tables (restaurant_id, table_number, zone, capacity, qr_public_id, status)
values
  ('11111111-1111-1111-1111-111111111111', '1',  'Bašta',   2, 'R7K2M9', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '2',  'Bašta',   4, 'B3H8N5', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '3',  'Unutra',  6, 'X9V4T2', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '4',  'Bašta',   4, 'K4M7P2', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '5',  'Bašta',   2, 'T8R3V6', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '6',  'Bašta',   8, 'H5N9Z4', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '7',  'Bašta',   4, 'P2W6K8', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '8',  'Bašta',   4, 'M3T7B5', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '9',  'Bašta',   2, 'V9H4R2', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '10', 'Bašta',   2, 'N6Z8T3', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '11', 'Unutra',  4, 'R5P9M4', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '12', 'Unutra',  4, 'B7V2K6', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '13', 'Unutra',  6, 'Z3H8N7', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '14', 'Unutra',  4, 'T4M5W9', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '15', 'Unutra',  4, 'K9R6B2', 'ACTIVE');

-- ── Planritningarna ─────────────────────────────────────────────────────────
--
-- Två ritningar, för att en restaurang sällan har en. Željo i Baščaršija har
-- en uteservering mot gränden och en smalare sal innanför — och det är just
-- skillnaden mellan dem som gör att ritningen är värd något: "bord 7" säger
-- inget om servitören inte vet om hon ska gå ut eller in.
--
-- Koordinaterna är rutnätsenheter, aldrig pixlar. Ritytan skalas till skärmen;
-- med pixlar hade rummet ritats om varje gång någon bytte från telefon till
-- surfplatta.

insert into public.floor_plans (id, restaurant_id, name, width, height, sort_order)
values
  ('66666666-6666-6666-6666-666666666661',
   '11111111-1111-1111-1111-111111111111', 'Bašta',  40, 24, 1),
  ('66666666-6666-6666-6666-666666666662',
   '11111111-1111-1111-1111-111111111111', 'Unutra', 30, 20, 2);

-- Uteserveringen: tre rader mot gränden, med långbordet vid husväggen.
-- Storlekarna följer antalet platser — ett tvåsitsigt bord och ett åttamanna
-- långbord ska inte ritas lika stora, annars säger ritningen inget om rummet.
update public.tables as t set
  floor_plan_id = v.plan::uuid,
  pos_x         = v.x,
  pos_y         = v.y,
  shape         = v.shape::public.table_shape,
  width         = v.w,
  height        = v.h,
  rotation      = v.rot
from (values
  -- Främre raden, mot gränden
  ('1',  '66666666-6666-6666-6666-666666666661',  4,  3, 'ROUND',  4, 4,  0),
  ('2',  '66666666-6666-6666-6666-666666666661', 12,  3, 'ROUND',  5, 5,  0),
  ('4',  '66666666-6666-6666-6666-666666666661', 21,  3, 'ROUND',  5, 5,  0),
  ('5',  '66666666-6666-6666-6666-666666666661', 31,  3, 'ROUND',  4, 4,  0),
  -- Mittenraden. Långbordet står längs husväggen och är därför avlångt.
  ('6',  '66666666-6666-6666-6666-666666666661',  4, 11, 'RECT',  10, 5,  0),
  ('7',  '66666666-6666-6666-6666-666666666661', 18, 11, 'ROUND',  5, 5,  0),
  ('8',  '66666666-6666-6666-6666-666666666661', 27, 11, 'ROUND',  5, 5,  0),
  -- Bortre raden, två små bord i hörnet
  ('9',  '66666666-6666-6666-6666-666666666661',  8, 18, 'ROUND',  4, 4,  0),
  ('10', '66666666-6666-6666-6666-666666666661', 17, 18, 'ROUND',  4, 4,  0),

  -- Salen innanför: smalare rum, fyrkantiga bord längs väggarna.
  ('3',  '66666666-6666-6666-6666-666666666662',  4,  4, 'RECT',   8, 4,  0),
  ('11', '66666666-6666-6666-6666-666666666662', 16,  4, 'SQUARE', 5, 5,  0),
  ('12', '66666666-6666-6666-6666-666666666662', 23,  4, 'SQUARE', 5, 5,  0),
  ('13', '66666666-6666-6666-6666-666666666662',  4, 12, 'RECT',   8, 4,  0),
  ('14', '66666666-6666-6666-6666-666666666662', 16, 12, 'SQUARE', 5, 5,  0),
  ('15', '66666666-6666-6666-6666-666666666662', 23, 12, 'SQUARE', 5, 5,  0)
) as v(nr, plan, x, y, shape, w, h, rot)
where t.restaurant_id = '11111111-1111-1111-1111-111111111111'
  and t.table_number = v.nr;

-- ── Merförsäljning, dryckesavdelning och en rätt som lagas i sats ──────────
--
-- Utan det här går tre funktioner inte att bedöma i seed-datan: kundvagnens
-- förslag har inget att föreslå, dryckesgenvägen vet inte vilken avdelning som
-- är dryck, och ingen rätt har en satsgräns att pröva mot.

update public.menu_categories
set is_drinks = true
where id = '33333333-3333-3333-3333-333333333332';

-- Punjene paprike lagas i sats om fyra. Restaurangen tar inte fram ett helt
-- ugnsbleck för en portion, och menyn säger det i stället för att kassan gör
-- det efteråt.
insert into public.menu_items (
  id, category_id, restaurant_id, name, description,
  price_ore, vat_rate_bps, allergens, is_available, status, sort_order, min_quantity
)
values
  ('44444444-4444-4444-4444-44444444aa01',
   '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Punjene paprike', 'Paprike punjene mesom i rižom, iz pećnice',
   1400, 1700, array['GLUTEN']::text[], true, 'PUBLISHED', 9, 4);

-- Restaurangens egna förslag. Ingen algoritm: den som står vid grillen vet att
-- ćevapi går med jogurt och att kaffet säljs efter baklavan.
insert into public.item_upsells (restaurant_id, source_item_id, suggested_item_id, sort_order)
values
  -- Till ćevapi: jogurt och pommes.
  ('11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-444444444441',
   '44444444-4444-4444-4444-4444444444e2', 1),
  ('11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-444444444441',
   '44444444-4444-4444-4444-4444444444d3', 2),
  -- Till punjene paprike: en sallad.
  ('11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-44444444aa01',
   '44444444-4444-4444-4444-4444444444d4', 1);

-- Restaurangens egen färg. Ett dovt grönt som klarar både ljust och mörkt läge
-- — se checkAccentColor() i @burp/core. Logotyp och banner sätts inte här:
-- de kräver en fil i Storage och ska gå genom granskningen som allt annat.
update public.restaurants
set accent_hex = '#15803d'
where id = '11111111-1111-1111-1111-111111111111';

-- ── Bordsbokning (migration 0054) ──────────────────────────────────────────
--
-- Utan det här går bokningen inte att bedöma: policyn är avstängd som standard,
-- och utan ett bord med egenskaper syns aldrig skillnaden mellan ett vanligt
-- bord och ett vid fönstret.
update public.restaurants
set reservation_policy = jsonb_build_object(
  'enabled', true,
  'duration_minutes', 90,
  'grace_minutes', 15,
  'lead_minutes', 60,
  'horizon_days', 30,
  'max_party_size', 12
)
where id = '11111111-1111-1111-1111-111111111111';

-- Två bord som är värda att välja, och ett tillägg som hamnar på notan i
-- restaurangen — Burp tar aldrig emot beloppet.
update public.tables
set attributes = array['WINDOW', 'VIEW']::text[], surcharge_ore = 1000
where restaurant_id = '11111111-1111-1111-1111-111111111111' and table_number = '6';

update public.tables
set attributes = array['QUIET']::text[]
where restaurant_id = '11111111-1111-1111-1111-111111111111' and table_number = '11';

-- ── Aščinica Stari Grad får en meny ────────────────────────────────────────
--
-- Fram till nu hade EN restaurang meny i seeden, och marknadsplatsen såg
-- därför ut som en katalog med ett ställe. Rättsidorna (migration 0058) kräver
-- dessutom att minst två restauranger har samma rätt — tröskeln finns för att
-- en sida som listar ett enda ställe är en sämre kopia av det ställets egen
-- sida — och utan den här menyn fanns ingen sådan rätt alls att bedöma.
--
-- Överlappet är avsiktligt: ćevapi, burek och kaffe finns hos båda, precis som
-- i Baščaršija. Resten skiljer sig, för en aščinica lagar grytor och en
-- ćevabdžinica gör inte det.

insert into public.menus (id, restaurant_id, name, status)
values (
  '22222222-2222-2222-2222-222222222227',
  '11111111-1111-1111-1111-111111111117',
  'Meni',
  'PUBLISHED'
);

insert into public.menu_categories (id, menu_id, restaurant_id, name, description, sort_order)
values
  ('33333333-3333-3333-3333-333333333371',
   '22222222-2222-2222-2222-222222222227',
   '11111111-1111-1111-1111-111111111117', 'Iz lonca', 'Kuhano od jutra', 1),
  ('33333333-3333-3333-3333-333333333372',
   '22222222-2222-2222-2222-222222222227',
   '11111111-1111-1111-1111-111111111117', 'Pića', 'Za uz jelo', 2);

insert into public.menu_items (
  id, category_id, restaurant_id, name, description,
  price_ore, vat_rate_bps, allergens, is_available, status, sort_order, min_quantity
)
values
  -- Delas med Željo. Det är de här raderna som ger rättsidorna något att lista.
  ('44444444-4444-4444-4444-44444444bb01', '33333333-3333-3333-3333-333333333371',
   '11111111-1111-1111-1111-111111111117',
   'Ćevapi 10 kom', 'Sa domaćom lepinjom',
   1300, 1700, array['GLUTEN', 'MILK']::text[], true, 'PUBLISHED', 1, 1),
  ('44444444-4444-4444-4444-44444444bb02', '33333333-3333-3333-3333-333333333371',
   '11111111-1111-1111-1111-111111111117',
   'Punjene paprike', 'Kuhane u loncu, sa pavlakom',
   1250, 1700, array['MILK']::text[], true, 'PUBLISHED', 2, 1),

  -- Aščinicans eget.
  ('44444444-4444-4444-4444-44444444bb03', '33333333-3333-3333-3333-333333333371',
   '11111111-1111-1111-1111-111111111117',
   'Bosanski lonac', 'Meso i povrće, kuhano sporo',
   1600, 1700, array[]::text[], true, 'PUBLISHED', 3, 1),
  ('44444444-4444-4444-4444-44444444bb04', '33333333-3333-3333-3333-333333333371',
   '11111111-1111-1111-1111-111111111117',
   'Grah sa suhim mesom', 'Sa domaćim hljebom',
   1100, 1700, array['GLUTEN']::text[], true, 'PUBLISHED', 4, 1),
  ('44444444-4444-4444-4444-44444444bb05', '33333333-3333-3333-3333-333333333371',
   '11111111-1111-1111-1111-111111111117',
   'Sarma', 'Iz kiselog kupusa',
   1200, 1700, array[]::text[], true, 'PUBLISHED', 5, 1),

  -- Också delad, och den vanligaste rätten av alla i en aščinica.
  ('44444444-4444-4444-4444-44444444bb06', '33333333-3333-3333-3333-333333333372',
   '11111111-1111-1111-1111-111111111117',
   'Kiseljak 0,5 l', 'Sarajevska mineralna voda',
   250, 1700, array[]::text[], true, 'PUBLISHED', 1, 1),
  ('44444444-4444-4444-4444-44444444bb07', '33333333-3333-3333-3333-333333333372',
   '11111111-1111-1111-1111-111111111117',
   'Bosanska kafa', 'U džezvi, sa rahat lokumom',
   300, 1700, array[]::text[], true, 'PUBLISHED', 2, 1);

update public.menu_categories
set is_drinks = true
where id = '33333333-3333-3333-3333-333333333372';

-- ── Fler städer ────────────────────────────────────────────────────────────
--
-- Marknadsplatsen såg ut som en katalog med tre städer: Sarajevo, Zagreb och
-- Beograd. Startsidans stadsrad hade tre knappar, kartan tre klungor, och en
-- gäst som inte råkade bo i någon av dem fick svaret "ingenting här".
--
-- Sex städer till, valda för att de faktiskt bär den marknad Burp siktar på:
-- Mostar och Tuzla i Bosnien, Split och Rijeka i Kroatien, Novi Sad och Niš i
-- Serbien. Mostar och Novi Sad får menyer — utan minst två restauranger med
-- samma rätt finns ingen rättsida att bedöma utanför Sarajevo.
--
-- Org.numren följer respektive lands format (regel 9): JIB 13 siffror i
-- Bosnien, OIB 11 i Kroatien, PIB 9 i Serbien. Ett nummer i fel format stoppas
-- av check-villkoret i migration 0019 — vilket är hela poängen med att det
-- finns.

insert into public.restaurants (
  id, name, slug, description, org_number,
  street_address, postal_code, city, location,
  phone, cuisines, price_tier, status, country, currency,
  rating_average, rating_count, opening_hours
)
values
  -- ── Mostar ───────────────────────────────────────────────────────────────
  ('11111111-1111-1111-1111-11111111a001',
   'Šadrvan', 'sadrvan',
   'Under vinrankan vid Gamla bron. Samma gård sedan 1988.',
   '4227000000011', 'Jusovina 11', '88000', 'Mostar',
   st_point(17.8146, 43.3372)::geography, '+38736578000',
   array['Bosniskt', 'Husmanskost'], 2, 'ACTIVE', 'BA', 'BAM', 4.6, 412,
   '{"mon": [{"opens": "09:00", "closes": "23:00"}],
     "tue": [{"opens": "09:00", "closes": "23:00"}],
     "wed": [{"opens": "09:00", "closes": "23:00"}],
     "thu": [{"opens": "09:00", "closes": "23:00"}],
     "fri": [{"opens": "09:00", "closes": "23:00"}],
     "sat": [{"opens": "09:00", "closes": "23:00"}],
     "sun": [{"opens": "09:00", "closes": "23:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-11111111a002',
   'Ćevabdžinica Tima-Irma', 'cevabdzinica-tima-irma',
   'Ćevapi över kol, portioner ingen gör slut på.',
   '4227000000012', 'Onešćukova 26', '88000', 'Mostar',
   st_point(17.8153, 43.3378)::geography, '+38736555000',
   array['Bosniskt', 'Grill'], 2, 'ACTIVE', 'BA', 'BAM', 4.4, 288,
   '{"mon": [{"opens": "08:00", "closes": "22:00"}],
     "tue": [{"opens": "08:00", "closes": "22:00"}],
     "wed": [{"opens": "08:00", "closes": "22:00"}],
     "thu": [{"opens": "08:00", "closes": "22:00"}],
     "fri": [{"opens": "08:00", "closes": "22:00"}],
     "sat": [{"opens": "08:00", "closes": "22:00"}],
     "sun": [{"opens": "09:00", "closes": "21:00"}]}'::jsonb),

  -- ── Tuzla ────────────────────────────────────────────────────────────────
  ('11111111-1111-1111-1111-11111111a003',
   'Aščinica Behar', 'ascinica-behar',
   'Grytor från morgonen. Det som är slut är slut.',
   '4209000000013', 'Turalibegova 18', '75000', 'Tuzla',
   st_point(18.6739, 44.5382)::geography, '+38735252000',
   array['Bosniskt', 'Husmanskost'], 1, 'ACTIVE', 'BA', 'BAM', 4.3, 96,
   '{"mon": [{"opens": "07:00", "closes": "16:00"}],
     "tue": [{"opens": "07:00", "closes": "16:00"}],
     "wed": [{"opens": "07:00", "closes": "16:00"}],
     "thu": [{"opens": "07:00", "closes": "16:00"}],
     "fri": [{"opens": "07:00", "closes": "16:00"}],
     "sat": [{"opens": "07:00", "closes": "14:00"}]}'::jsonb),

  -- ── Split ────────────────────────────────────────────────────────────────
  ('11111111-1111-1111-1111-11111111a004',
   'Konoba Matejuška', 'konoba-matejuska',
   'Fisk från morgonens fångst, grillad hel. Menyn beror på båtarna.',
   '12345678904', 'Tomića stine 3', '21000', 'Split',
   st_point(16.4353, 43.5069)::geography, '+38521355000',
   array['Kroatiskt', 'Fisk'], 3, 'ACTIVE', 'HR', 'EUR', 4.7, 331,
   '{"mon": [{"opens": "12:00", "closes": "23:00"}],
     "tue": [{"opens": "12:00", "closes": "23:00"}],
     "wed": [{"opens": "12:00", "closes": "23:00"}],
     "thu": [{"opens": "12:00", "closes": "23:00"}],
     "fri": [{"opens": "12:00", "closes": "00:00"}],
     "sat": [{"opens": "12:00", "closes": "00:00"}],
     "sun": [{"opens": "12:00", "closes": "22:00"}]}'::jsonb),

  -- ── Rijeka ───────────────────────────────────────────────────────────────
  ('11111111-1111-1111-1111-11111111a005',
   'Bistro Korzo', 'bistro-korzo',
   'Kaffe på morgonen, marenda vid tolv. Samma bord sedan farfar.',
   '12345678903', 'Korzo 14', '51000', 'Rijeka',
   st_point(14.4422, 45.3271)::geography, '+38551335000',
   array['Kroatiskt', 'Café'], 2, 'ACTIVE', 'HR', 'EUR', 4.1, 74,
   '{"mon": [{"opens": "07:00", "closes": "20:00"}],
     "tue": [{"opens": "07:00", "closes": "20:00"}],
     "wed": [{"opens": "07:00", "closes": "20:00"}],
     "thu": [{"opens": "07:00", "closes": "20:00"}],
     "fri": [{"opens": "07:00", "closes": "22:00"}],
     "sat": [{"opens": "08:00", "closes": "22:00"}]}'::jsonb),

  -- ── Novi Sad ─────────────────────────────────────────────────────────────
  ('11111111-1111-1111-1111-11111111a006',
   'Kafana Dva Štapa', 'kafana-dva-stapa',
   'Roštilj och levande musik. Kvällar som blir längre än man tänkt.',
   '123456791', 'Zmaj Jovina 12', '21000', 'Novi Sad',
   st_point(19.8451, 45.2551)::geography, '+38121420000',
   array['Serbiskt', 'Grill'], 2, 'ACTIVE', 'RS', 'RSD', 4.5, 203,
   '{"mon": [{"opens": "10:00", "closes": "00:00"}],
     "tue": [{"opens": "10:00", "closes": "00:00"}],
     "wed": [{"opens": "10:00", "closes": "00:00"}],
     "thu": [{"opens": "10:00", "closes": "00:00"}],
     "fri": [{"opens": "10:00", "closes": "02:00"}],
     "sat": [{"opens": "10:00", "closes": "02:00"}],
     "sun": [{"opens": "11:00", "closes": "23:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-11111111a007',
   'Pekara Trandafilović', 'pekara-trandafilovic',
   'Burek från fem på morgonen. Slut vid elva, varje dag.',
   '123456792', 'Dunavska 5', '21000', 'Novi Sad',
   st_point(19.8478, 45.2553)::geography, '+38121421000',
   array['Serbiskt', 'Bageri'], 1, 'ACTIVE', 'RS', 'RSD', 4.4, 158,
   '{"mon": [{"opens": "05:00", "closes": "15:00"}],
     "tue": [{"opens": "05:00", "closes": "15:00"}],
     "wed": [{"opens": "05:00", "closes": "15:00"}],
     "thu": [{"opens": "05:00", "closes": "15:00"}],
     "fri": [{"opens": "05:00", "closes": "15:00"}],
     "sat": [{"opens": "05:00", "closes": "13:00"}],
     "sun": [{"opens": "06:00", "closes": "12:00"}]}'::jsonb),

  -- ── Niš ──────────────────────────────────────────────────────────────────
  ('11111111-1111-1111-1111-11111111a008',
   'Kafana Stara Srbija', 'kafana-stara-srbija',
   'Burek, roštilj och rakija. Ingenting har ändrats sedan sjuttiotalet.',
   '123456793', 'Kopitareva 6', '18000', 'Niš',
   st_point(21.8958, 43.3209)::geography, '+38118520000',
   array['Serbiskt', 'Husmanskost'], 1, 'ACTIVE', 'RS', 'RSD', 4.2, 89,
   '{"mon": [{"opens": "08:00", "closes": "23:00"}],
     "tue": [{"opens": "08:00", "closes": "23:00"}],
     "wed": [{"opens": "08:00", "closes": "23:00"}],
     "thu": [{"opens": "08:00", "closes": "23:00"}],
     "fri": [{"opens": "08:00", "closes": "01:00"}],
     "sat": [{"opens": "08:00", "closes": "01:00"}],
     "sun": [{"opens": "09:00", "closes": "22:00"}]}'::jsonb);

-- ── Menyer i Mostar och Novi Sad ───────────────────────────────────────────
--
-- Två restauranger per stad delar minst en rätt, vilket är vad rättsidorna
-- kräver (migration 0058). Utan det fanns "punjene paprike Sarajevo" men
-- ingenting motsvarande för någon annan stad — och en funktion som bara går
-- att bedöma på ett ställe är en funktion som är bedömd till hälften.

insert into public.menus (id, restaurant_id, name, status)
values
  ('22222222-2222-2222-2222-2222222a0001', '11111111-1111-1111-1111-11111111a001', 'Meni', 'PUBLISHED'),
  ('22222222-2222-2222-2222-2222222a0002', '11111111-1111-1111-1111-11111111a002', 'Meni', 'PUBLISHED'),
  ('22222222-2222-2222-2222-2222222a0006', '11111111-1111-1111-1111-11111111a006', 'Meni', 'PUBLISHED'),
  ('22222222-2222-2222-2222-2222222a0007', '11111111-1111-1111-1111-11111111a007', 'Meni', 'PUBLISHED');

insert into public.menu_categories (id, menu_id, restaurant_id, name, sort_order, is_drinks)
values
  ('33333333-3333-3333-3333-3333333a0001', '22222222-2222-2222-2222-2222222a0001', '11111111-1111-1111-1111-11111111a001', 'Jela', 1, false),
  ('33333333-3333-3333-3333-3333333a0002', '22222222-2222-2222-2222-2222222a0002', '11111111-1111-1111-1111-11111111a002', 'Sa roštilja', 1, false),
  ('33333333-3333-3333-3333-3333333a0006', '22222222-2222-2222-2222-2222222a0006', '11111111-1111-1111-1111-11111111a006', 'Sa roštilja', 1, false),
  ('33333333-3333-3333-3333-3333333a0007', '22222222-2222-2222-2222-2222222a0007', '11111111-1111-1111-1111-11111111a007', 'Iz peći', 1, false);

insert into public.menu_items (
  id, category_id, restaurant_id, name, description,
  price_ore, vat_rate_bps, allergens, is_available, status, sort_order
)
values
  -- Mostar: båda har ćevapi, och Šadrvan har dolma.
  ('44444444-4444-4444-4444-44444444a001', '33333333-3333-3333-3333-3333333a0001',
   '11111111-1111-1111-1111-11111111a001', 'Ćevapi 10 kom', 'Sa lepinjom i lukom',
   1300, 1700, array['GLUTEN']::text[], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-44444444a002', '33333333-3333-3333-3333-3333333a0001',
   '11111111-1111-1111-1111-11111111a001', 'Japrak', 'Vinblad fyllda med kött och ris',
   1400, 1700, array[]::text[], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-44444444a003', '33333333-3333-3333-3333-3333333a0002',
   '11111111-1111-1111-1111-11111111a002', 'Ćevapi 10 kom', 'Sa kajmakom',
   1200, 1700, array['GLUTEN', 'MILK']::text[], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-44444444a004', '33333333-3333-3333-3333-3333333a0002',
   '11111111-1111-1111-1111-11111111a002', 'Pljeskavica', 'Punjena sirom',
   1400, 1700, array['GLUTEN', 'MILK']::text[], true, 'PUBLISHED', 2),

  -- Novi Sad: båda har burek.
  ('44444444-4444-4444-4444-44444444a006', '33333333-3333-3333-3333-3333333a0006',
   '11111111-1111-1111-1111-11111111a006', 'Pljeskavica', 'Sa kajmakom i ajvarom',
   65000, 2000, array['MILK']::text[], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-44444444a007', '33333333-3333-3333-3333-3333333a0006',
   '11111111-1111-1111-1111-11111111a006', 'Burek sa mesom', 'Iz peći, po komadu',
   28000, 2000, array['GLUTEN']::text[], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-44444444a008', '33333333-3333-3333-3333-3333333a0007',
   '11111111-1111-1111-1111-11111111a007', 'Burek sa mesom', 'Od pet ujutru',
   25000, 2000, array['GLUTEN']::text[], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-44444444a009', '33333333-3333-3333-3333-3333333a0007',
   '11111111-1111-1111-1111-11111111a007', 'Burek sa sirom', 'Sa mladim sirom',
   25000, 2000, array['GLUTEN', 'MILK']::text[], true, 'PUBLISHED', 2);
