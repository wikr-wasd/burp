-- 0058 — Rätten som egen sida: "punjene paprike sarajevo".
--
-- ── Varför den här och inte mer schema-märkning ─────────────────────────────
--
-- Restaurangsidorna bär redan `Restaurant`, `Menu`, `MenuItem` och `Offer` i
-- JSON-LD. Det som saknas är inte märkning utan YTOR: Google indexerar en URL,
-- och Burp har ingen adress som svarar på "punjene paprike Sarajevo".
--
-- Det är också den enda sökning Burp realistiskt kan vinna. På "restaurang
-- Sarajevo" står Googles egen karta först och restaurangernas egna profiler
-- därefter; på en rätt i en stad finns oftast ingen sida alls. Long-tail är
-- inte en nödlösning här, det är hela strategin — se docs/BUSINESS.md.
--
-- ── Varför slug och inte fritext i adressen ─────────────────────────────────
--
-- `slugify()` (migration 0023) viker bort č, ć, š, ž och đ. "Ćevapi" och
-- "cevapi" blir samma adress, vilket är precis vad någon som söker skriver —
-- och vad restaurangen skrivit i sin meny får styra hur rubriken ser ut, inte
-- vilken sida som finns.

-- Uppslaget går på den slugifierade rätten. Utan index blir varje sidvisning
-- en full scan över alla menyrader i systemet.
create index menu_items_slug_idx
  on public.menu_items (public.slugify(name))
  where status = 'PUBLISHED';

/**
 * Rätterna som är värda en egen sida i en stad.
 *
 * Tröskeln är TVÅ restauranger. En sida som listar ett enda ställe är en sämre
 * kopia av det ställets egen sida — dubblerat innehåll för Google och en
 * återvändsgränd för den som klickar. Först när det finns något att jämföra
 * blir listan en egen sak.
 */
create or replace function public.dishes_in_city(p_city_slug text)
returns table (
  dish_slug   text,
  dish_name   text,
  restaurants bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.slugify(mi.name) as dish_slug,
    -- Namnet som flest restauranger skrivit det. Rubriken ska se ut som menyn
    -- gör, inte som en normaliserad sträng.
    (array_agg(mi.name order by mi.name))[1] as dish_name,
    count(distinct r.id) as restaurants
  from public.menu_items mi
  join public.restaurants r on r.id = mi.restaurant_id
  where r.city_slug = p_city_slug
    and r.status = 'ACTIVE'
    and mi.status = 'PUBLISHED'
    and length(public.slugify(mi.name)) >= 3
  group by public.slugify(mi.name)
  having count(distinct r.id) >= 2
  order by count(distinct r.id) desc, 1;
$$;

comment on function public.dishes_in_city is
  'Rätter som minst två aktiva restauranger i staden har på menyn. Tröskeln finns för att en sida som listar ett enda ställe är en sämre kopia av det ställets egen sida — dubblerat innehåll för Google och en återvändsgränd för gästen.';

/**
 * Restaurangerna i staden som har rätten på sin publicerade meny.
 *
 * Priset följer med: det är det som gör listan värd att läsa. Lägsta priset
 * per restaurang, eftersom en rätt kan finnas i flera storlekar.
 */
create or replace function public.restaurants_with_dish(
  p_city_slug  text,
  p_dish_slug  text
)
returns table (
  restaurant_id  uuid,
  name           text,
  slug           text,
  description    text,
  hero_image_url text,
  cuisines       text[],
  rating_average numeric,
  rating_count   integer,
  price_tier     smallint,
  currency       text,
  dish_name      text,
  price_ore      integer
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (r.id)
    r.id,
    r.name,
    r.slug,
    r.description,
    r.hero_image_url,
    r.cuisines,
    r.rating_average,
    r.rating_count,
    r.price_tier,
    r.currency::text,
    mi.name,
    mi.price_ore
  from public.menu_items mi
  join public.restaurants r on r.id = mi.restaurant_id
  where r.city_slug = p_city_slug
    and r.status = 'ACTIVE'
    and mi.status = 'PUBLISHED'
    and public.slugify(mi.name) = p_dish_slug
  order by r.id, mi.price_ore asc;
$$;

comment on function public.restaurants_with_dish is
  'Aktiva restauranger i staden som har rätten på sin publicerade meny, med lägsta pris. Sorteringen på pris inuti distinct on är vad som gör "från 12,00 KM" sann när rätten finns i flera storlekar.';

-- Publika sidor, publika funktioner. De lämnar inte ut något som inte redan
-- står på restaurangsidan.
revoke execute on function public.dishes_in_city(text) from public;
revoke execute on function public.restaurants_with_dish(text, text) from public;
grant execute on function public.dishes_in_city(text) to anon, authenticated, service_role;
grant execute on function public.restaurants_with_dish(text, text) to anon, authenticated, service_role;
