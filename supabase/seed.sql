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
   '11111111-1111-1111-1111-111111111111', 'Sa roštilja', 'Från kolgrillen', 2),
  ('33333333-3333-3333-3333-333333333332',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Pića', 'Dryck', 5),

  -- Resten av menyn. En ćevabdžinica i Sarajevo har inte tre rätter, och en
  -- meny med tre rätter går inte att bedöma: kategorinavigeringen har inget
  -- att navigera i, sökrutan visas inte alls och ingen ser hur menyn beter sig
  -- när den är längre än skärmen. Det är i den vyn QR-gästen bor.
  --
  -- Ingen fläskrätt. En ćevabdžinica i Baščaršija är halal, och en meny som
  -- inte stämmer med verkligheten är sämre testdata än ingen alls.
  ('33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Predjela', 'Förrätter', 1),
  ('33333333-3333-3333-3333-333333333334',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Pite', 'Bakat i vedugn', 3),
  ('33333333-3333-3333-3333-333333333335',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Prilozi', 'Tillbehör', 4),
  ('33333333-3333-3333-3333-333333333336',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Deserti', 'Efterrätt', 6);

/*
 * Priser i minsta enhet, inklusive moms. Bosnien har EN momssats: 17 % på
 * allt, även dryck. Det är därför alla rader nedan har 1700 och inte två
 * olika satser som i Sverige eller Kroatien.
 *
 * 1200 fening = 12,00 KM.
 */
insert into public.menu_items (
  id, category_id, restaurant_id, name, description,
  price_ore, vat_rate_bps, allergens, is_available, status, sort_order
)
values
  ('44444444-4444-4444-4444-444444444441',
   '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Ćevapi 10 kom', 'Tio ćevapi i lepinja, med lök och kajmak',
   1200, 1700, array['gluten', 'mjölk'], true, 'PUBLISHED', 1),

  ('44444444-4444-4444-4444-444444444442',
   '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Pljeskavica', 'Grillad köttfärsbiff i lepinja med ajvar',
   1400, 1700, array['gluten'], true, 'PUBLISHED', 2),

  ('44444444-4444-4444-4444-444444444443',
   '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Bosanska kafa', 'Kokt i džezva, serverad med rahat lokum',
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
   'Kajmak', 'Saltat mjölkfett från Vlašić, skuret ur kaggen',
   400, 1700, array['mjölk'], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-4444444444a2', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Ajvar domaći', 'Hemgjord, av rostad paprika och aubergine',
   350, 1700, array[]::text[], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444a3', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Uštipci', 'Friterade degkulor, serveras med kajmak',
   600, 1700, array['gluten', 'mjölk'], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444a4', '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Suho meso', 'Rökt och lufttorkat nötkött, tunt skivat',
   900, 1700, array[]::text[], true, 'PUBLISHED', 4),

  -- Sa roštilja
  ('44444444-4444-4444-4444-4444444444b1', '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Ćevapi 5 kom', 'Fem ćevapi i halv lepinja — den lilla portionen',
   800, 1700, array['gluten'], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444b2', '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Ćevapi 15 kom', 'Femton ćevapi i hel lepinja, lök och kajmak',
   1700, 1700, array['gluten', 'mjölk'], true, 'PUBLISHED', 4),
  ('44444444-4444-4444-4444-4444444444b3', '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Ražnjići', 'Spett av kalv och lamm, grillat över kol',
   1600, 1700, array[]::text[], true, 'PUBLISHED', 5),
  ('44444444-4444-4444-4444-4444444444b4', '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Pileći ćevapi', 'Ćevapi på kyckling, för den som vill ha lättare',
   1300, 1700, array['gluten'], true, 'PUBLISHED', 6),

  -- Pite
  ('44444444-4444-4444-4444-4444444444c1', '33333333-3333-3333-3333-333333333334',
   '11111111-1111-1111-1111-111111111111',
   'Burek', 'Rullad för hand, fylld med nötfärs och lök',
   700, 1700, array['gluten'], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-4444444444c2', '33333333-3333-3333-3333-333333333334',
   '11111111-1111-1111-1111-111111111111',
   'Sirnica', 'Med ung ost',
   700, 1700, array['gluten', 'mjölk'], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444c3', '33333333-3333-3333-3333-333333333334',
   '11111111-1111-1111-1111-111111111111',
   'Zeljanica', 'Med spenat och ost',
   700, 1700, array['gluten', 'mjölk'], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444c4', '33333333-3333-3333-3333-333333333334',
   '11111111-1111-1111-1111-111111111111',
   'Krompiruša', 'Med potatis och lök',
   650, 1700, array['gluten'], true, 'PUBLISHED', 4),

  -- Prilozi
  ('44444444-4444-4444-4444-4444444444d1', '33333333-3333-3333-3333-333333333335',
   '11111111-1111-1111-1111-111111111111',
   'Lepinja', 'Nybakad, direkt ur vedugnen',
   200, 1700, array['gluten'], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-4444444444d2', '33333333-3333-3333-3333-333333333335',
   '11111111-1111-1111-1111-111111111111',
   'Kiseli kupus', 'Syrad vitkål',
   300, 1700, array[]::text[], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444d3', '33333333-3333-3333-3333-333333333335',
   '11111111-1111-1111-1111-111111111111',
   'Pomfrit', 'Pommes frites',
   400, 1700, array[]::text[], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444d4', '33333333-3333-3333-3333-333333333335',
   '11111111-1111-1111-1111-111111111111',
   'Zelena salata', 'Grönsallad med tomat och rödlök',
   350, 1700, array[]::text[], true, 'PUBLISHED', 4),

  -- Pića
  ('44444444-4444-4444-4444-4444444444e1', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Čaj od nane', 'Myntate, bryggt på färska blad',
   300, 1700, array[]::text[], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444e2', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Kiseljak 0,5 l', 'Sarajevskt mineralvatten',
   250, 1700, array[]::text[], true, 'PUBLISHED', 3),
  ('44444444-4444-4444-4444-4444444444e3', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Coca-Cola 0,33 l', null,
   350, 1700, array[]::text[], true, 'PUBLISHED', 4),
  ('44444444-4444-4444-4444-4444444444e4', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Sok od jabuke', 'Grumlig äppeljuice',
   350, 1700, array[]::text[], true, 'PUBLISHED', 5),
  -- Slut för dagen. Menyn ska kunna granskas med ett slutsålt kort i sig —
  -- det tillståndet syns annars aldrig i utvecklingsmiljön.
  ('44444444-4444-4444-4444-4444444444e5', '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Kefir 0,33 l', 'Syrad mjölkdryck',
   300, 1700, array['mjölk'], false, 'PUBLISHED', 6),

  -- Deserti
  ('44444444-4444-4444-4444-4444444444f1', '33333333-3333-3333-3333-333333333336',
   '11111111-1111-1111-1111-111111111111',
   'Tufahija', 'Kokt äpple fyllt med valnötter, med vispad grädde',
   600, 1700, array['nötter', 'mjölk'], true, 'PUBLISHED', 1),
  ('44444444-4444-4444-4444-4444444444f2', '33333333-3333-3333-3333-333333333336',
   '11111111-1111-1111-1111-111111111111',
   'Baklava', 'Med valnöt och sirap',
   500, 1700, array['gluten', 'nötter'], true, 'PUBLISHED', 2),
  ('44444444-4444-4444-4444-4444444444f3', '33333333-3333-3333-3333-333333333336',
   '11111111-1111-1111-1111-111111111111',
   'Hurmašice', 'Doppade i sockerlag',
   450, 1700, array['gluten'], true, 'PUBLISHED', 3);

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
insert into public.tables (restaurant_id, table_number, zone, capacity, qr_public_id, status)
values
  ('11111111-1111-1111-1111-111111111111', '1', 'Bašta',   2, 'R7K2M9', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '2', 'Bašta',   4, 'B3H8N5', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '3', 'Unutra',  6, 'X9V4T2', 'ACTIVE');
