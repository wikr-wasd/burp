-- Testdata för lokal utveckling. Körs automatiskt av `supabase db reset`.
--
-- ⚠️ Kör ALDRIG mot produktionsdatabasen.

-- ── Restaurang ──────────────────────────────────────────────────────────────

insert into public.restaurants (
  id, name, slug, description, org_number,
  street_address, postal_code, city, location,
  phone, cuisines, price_tier, status,
  opening_hours
)
values (
  '11111111-1111-1111-1111-111111111111',
  'Pizzeria Roma',
  'pizzeria-roma',
  'Vedugnsbakad pizza på Möllevången sedan 1987. Deg jäst i 48 timmar.',
  '5566778899',
  'Bergsgatan 12', '21422', 'Malmö',
  st_point(13.0007, 55.5906)::geography,
  '+46401234567',
  array['Pizza', 'Italienskt'],
  2,
  'ACTIVE',
  -- Lunch och kväll som separata pass, samma struktur som is_restaurant_open läser.
  '{
    "mon": [{"opens": "11:00", "closes": "14:00"}, {"opens": "17:00", "closes": "22:00"}],
    "tue": [{"opens": "11:00", "closes": "14:00"}, {"opens": "17:00", "closes": "22:00"}],
    "wed": [{"opens": "11:00", "closes": "14:00"}, {"opens": "17:00", "closes": "22:00"}],
    "thu": [{"opens": "11:00", "closes": "14:00"}, {"opens": "17:00", "closes": "22:00"}],
    "fri": [{"opens": "11:00", "closes": "23:00"}],
    "sat": [{"opens": "13:00", "closes": "23:00"}],
    "sun": [{"opens": "13:00", "closes": "21:00"}]
  }'::jsonb
);

-- ── Fler restauranger, för marknadsplatsvyn ─────────────────────────────────
--
-- Startsidan går inte att bedöma med en enda restaurang — filtrering, sortering
-- och tomma träfflistor syns först när det finns något att sålla bland. De här
-- har varken meny eller bord; de finns för att fylla upptäcktsytan.
--
-- `city_slug` sätts inte här. Den är en genererad kolumn (migration 0002).
--
-- `rating_average` och `rating_count` skrivs normalt av en trigger när ett
-- omdöme läggs. Här sätts de för hand så att betygen syns i listan innan
-- omdömesytan finns. Riktiga betyg kan bara komma från en genomförd order.

insert into public.restaurants (
  id, name, slug, description, org_number,
  street_address, postal_code, city, location,
  phone, cuisines, price_tier, status,
  rating_average, rating_count, opening_hours
)
values
  ('11111111-1111-1111-1111-111111111112',
   'Sushi Sakura', 'sushi-sakura',
   'Nigiri och maki rullade på beställning. Fisk från Feskekôrka varje morgon.',
   '5566778801', 'Andra Långgatan 18', '41303', 'Göteborg',
   st_point(11.9525, 57.6989)::geography, '+46311234567',
   array['Sushi', 'Japanskt'], 3, 'ACTIVE', 4.6, 128,
   '{"mon": [{"opens": "11:00", "closes": "21:00"}],
     "tue": [{"opens": "11:00", "closes": "21:00"}],
     "wed": [{"opens": "11:00", "closes": "21:00"}],
     "thu": [{"opens": "11:00", "closes": "22:00"}],
     "fri": [{"opens": "11:00", "closes": "23:00"}],
     "sat": [{"opens": "12:00", "closes": "23:00"}],
     "sun": [{"opens": "12:00", "closes": "20:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111113',
   'Falafelbaren', 'falafelbaren',
   'Nymalen kikärtsröra, friterad när du beställer. Allt utom kycklingen är veganskt.',
   '5566778802', 'Södra Förstadsgatan 40', '21143', 'Malmö',
   st_point(13.0021, 55.5942)::geography, '+46401234568',
   array['Mellanöstern', 'Vegetariskt'], 1, 'ACTIVE', 4.4, 312,
   '{"mon": [{"opens": "10:30", "closes": "20:00"}],
     "tue": [{"opens": "10:30", "closes": "20:00"}],
     "wed": [{"opens": "10:30", "closes": "20:00"}],
     "thu": [{"opens": "10:30", "closes": "20:00"}],
     "fri": [{"opens": "10:30", "closes": "21:00"}],
     "sat": [{"opens": "11:00", "closes": "21:00"}],
     "sun": [{"opens": "12:00", "closes": "19:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111114',
   'Bistro Nord', 'bistro-nord',
   'Nordisk husmanskost med råvaror från Roslagen. Menyn byts efter säsong.',
   '5566778803', 'Rörstrandsgatan 9', '11340', 'Stockholm',
   st_point(18.0364, 59.3407)::geography, '+46812345678',
   array['Svenskt', 'Husmanskost'], 3, 'ACTIVE', 4.2, 87,
   '{"tue": [{"opens": "17:00", "closes": "23:00"}],
     "wed": [{"opens": "17:00", "closes": "23:00"}],
     "thu": [{"opens": "17:00", "closes": "23:00"}],
     "fri": [{"opens": "16:00", "closes": "00:00"}],
     "sat": [{"opens": "16:00", "closes": "00:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111115',
   'Pho Hanoi', 'pho-hanoi',
   'Buljong som kokat i tolv timmar. Familjen driver stället i andra generationen.',
   '5566778804', 'Hornsgatan 92', '11821', 'Stockholm',
   st_point(18.0505, 59.3168)::geography, '+46812345679',
   array['Vietnamesiskt', 'Soppa'], 2, 'ACTIVE', 4.7, 204,
   '{"mon": [{"opens": "11:00", "closes": "21:00"}],
     "tue": [{"opens": "11:00", "closes": "21:00"}],
     "wed": [{"opens": "11:00", "closes": "21:00"}],
     "thu": [{"opens": "11:00", "closes": "21:00"}],
     "fri": [{"opens": "11:00", "closes": "22:00"}],
     "sat": [{"opens": "12:00", "closes": "22:00"}],
     "sun": [{"opens": "12:00", "closes": "20:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111116',
   'Kafé Klara', 'kafe-klara',
   'Surdegsbageri och lunchsallader. Allt bakas på plats från fyra på morgonen.',
   '5566778805', 'Klarabergsgatan 23', '11121', 'Stockholm',
   st_point(18.0616, 59.3320)::geography, '+46812345680',
   array['Café', 'Bageri'], 1, 'ACTIVE', 4.1, 56,
   '{"mon": [{"opens": "07:00", "closes": "17:00"}],
     "tue": [{"opens": "07:00", "closes": "17:00"}],
     "wed": [{"opens": "07:00", "closes": "17:00"}],
     "thu": [{"opens": "07:00", "closes": "17:00"}],
     "fri": [{"opens": "07:00", "closes": "17:00"}],
     "sat": [{"opens": "09:00", "closes": "16:00"}]}'::jsonb),

  ('11111111-1111-1111-1111-111111111117',
   'Taquería Malmö', 'taqueria-malmo',
   'Tacos på nixtamaliserad majs, malda för hand. Salsan görs om varje dag.',
   '5566778806', 'Friisgatan 15', '21421', 'Malmö',
   st_point(13.0068, 55.5928)::geography, '+46401234569',
   array['Mexikanskt', 'Tacos'], 2, 'ACTIVE', 4.5, 173,
   '{"wed": [{"opens": "16:00", "closes": "22:00"}],
     "thu": [{"opens": "16:00", "closes": "22:00"}],
     "fri": [{"opens": "16:00", "closes": "23:00"}],
     "sat": [{"opens": "14:00", "closes": "23:00"}],
     "sun": [{"opens": "14:00", "closes": "20:00"}]}'::jsonb);

-- ── Meny ────────────────────────────────────────────────────────────────────

insert into public.menus (id, restaurant_id, name, status)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Ordinarie meny',
  'PUBLISHED'
);

insert into public.menu_categories (id, menu_id, restaurant_id, name, sort_order)
values
  ('33333333-3333-3333-3333-333333333331',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Pizza', 1),
  ('33333333-3333-3333-3333-333333333332',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Dryck', 2);

-- Priser i ÖRE, inklusive moms. 12 % på mat, 25 % på alkohol.
insert into public.menu_items (
  id, category_id, restaurant_id, name, description,
  price_ore, vat_rate_bps, allergens, is_available, status, sort_order
)
values
  ('44444444-4444-4444-4444-444444444441',
   '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Margherita', 'San Marzano, fior di latte, basilika',
   12900, 1200, array['gluten', 'mjölk'], true, 'PUBLISHED', 1),

  ('44444444-4444-4444-4444-444444444442',
   '33333333-3333-3333-3333-333333333331',
   '11111111-1111-1111-1111-111111111111',
   'Diavola', 'Salsiccia piccante, mozzarella, chili',
   14900, 1200, array['gluten', 'mjölk'], true, 'PUBLISHED', 2),

  ('44444444-4444-4444-4444-444444444443',
   '33333333-3333-3333-3333-333333333332',
   '11111111-1111-1111-1111-111111111111',
   'Öl 40 cl', 'Fatöl',
   8900, 2500, array[]::text[], true, 'PUBLISHED', 1);

insert into public.option_groups (id, menu_item_id, restaurant_id, name, min_select, max_select)
values (
  '55555555-5555-5555-5555-555555555551',
  '44444444-4444-4444-4444-444444444441',
  '11111111-1111-1111-1111-111111111111',
  'Extra tillbehör', 0, 3
);

insert into public.options (option_group_id, restaurant_id, name, price_ore, sort_order)
values
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'Extra ost', 1500, 1),
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'Rucola', 1000, 2),
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'Utan ost', -1000, 3);

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
  ('11111111-1111-1111-1111-111111111111', '1', 'Fönstret',      2, 'R7K2M9', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '2', 'Fönstret',      4, 'B3H8N5', 'ACTIVE'),
  ('11111111-1111-1111-1111-111111111111', '3', 'Uteservering',  6, 'X9V4T2', 'ACTIVE');
