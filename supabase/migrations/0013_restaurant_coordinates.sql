-- 0013 — latitude och longitude som genererade kolumner.
--
-- `restaurants.location` är en PostGIS-punkt, vilket är rätt för geosökning
-- ("restauranger inom 2 km"). Men schema.org-markupen och kartlänkar behöver
-- två vanliga tal, och en klient ska inte behöva förstå WKB för att läsa dem.
--
-- Genererade kolumner i stället för en vy: de går att indexera, de går att
-- välja direkt i en PostgREST-fråga, och de kan aldrig komma i otakt med
-- punkten de härleds ur.
--
-- Bakgrund: SEO-sidan /r/{stad}/{slug} valde latitude och longitude innan de
-- fanns. PostgREST svarar då med ett fel, Supabase-klienten ger data = null,
-- och sidan blev en 404 utan att något i loggen sa varför.

alter table public.restaurants
  add column latitude double precision
    generated always as (st_y(location::geometry)) stored,
  add column longitude double precision
    generated always as (st_x(location::geometry)) stored;

comment on column public.restaurants.latitude is
  'Härledd ur location. Skriv aldrig hit — uppdatera punkten i stället.';

alter table public.locations
  add column latitude double precision
    generated always as (st_y(location::geometry)) stored,
  add column longitude double precision
    generated always as (st_x(location::geometry)) stored;

-- Nya kolumner ärver inte grants från tabellen i alla lägen. Kör om dem så att
-- anon och authenticated ser kolumnerna direkt.
grant select on public.restaurants, public.locations to anon, authenticated;
