-- 0060 — "Sök i det här området".
--
-- Kartan har hittills bara ritat ut det listan redan hittat. Den vanligaste
-- frågan en gäst ställer en karta är den omvända: "vad finns HÄR, där jag
-- tittar just nu" — och den gick inte att ställa.
--
-- ── Varför i databasen ──────────────────────────────────────────────────────
--
-- `location` är en `geography(point)` och ligger i PostGIS. Att hämta hem alla
-- restauranger och jämföra koordinater i TypeScript hade fungerat med sju rader
-- och slutat fungera vid tusen — och jämförelsen är dessutom inte trivial:
-- longitud 179 och −179 ligger bredvid varandra, inte 358 grader isär.
--
-- ── Varför ett id-uppslag och inte hela raden ───────────────────────────────
--
-- Samma skäl som `restaurant_ids_matching_dish` (migration 0059): korten ska
-- ritas av `searchRestaurants` så att en restaurang ser likadan ut var man än
-- möter den. Funktionen svarar på "vilka", listan hämtar "hur de ser ut".

create or replace function public.restaurant_ids_in_bounds(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision
)
returns table (restaurant_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select r.id
  from public.restaurants r
  where r.status = 'ACTIVE'
    and r.location is not null
    /*
     * `&&` mot en envelope, inte en avståndsberäkning.
     *
     * Rutan är det gästen faktiskt ser, och operatorn använder det spatiala
     * indexet. En radie hade krävt en mittpunkt och ett avstånd som ingen
     * bett om — och kartan är rektangulär, inte rund.
     */
    and r.location::geometry && st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
  limit 200;
$$;

comment on function public.restaurant_ids_in_bounds is
  'Id på aktiva restauranger inom kartans nuvarande ruta. Envelope och inte radie: rutan är det gästen ser, och kartan är rektangulär.';

revoke execute on function public.restaurant_ids_in_bounds(
  double precision, double precision, double precision, double precision
) from public;

grant execute on function public.restaurant_ids_in_bounds(
  double precision, double precision, double precision, double precision
) to anon, authenticated, service_role;

-- Uppslaget går på punkten. Utan index blir varje panorering en full scan.
create index if not exists restaurants_location_gix
  on public.restaurants using gist (location);
