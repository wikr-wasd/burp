-- 0059 — Sökrutan ser menyerna.
--
-- Fältet på startsidan lovade "Sök restaurang, rätt eller kök" medan
-- hjälptexten under det sa "Söker i restaurangnamn och beskrivningar". Båda
-- stämde: rutan hittade inte en enda rätt. Den som skrev "punjene paprike" fick
-- noll träffar fastän två restauranger har den på menyn.
--
-- ── Varför en funktion och inte en fritextfråga från appen ──────────────────
--
-- Sökningen ska ge samma svar som rättsidan (migration 0058) — samma tröskel,
-- samma slugifiering. Ligger regeln på två ställen hittar sökningen en rätt
-- vars sida sedan svarar 404, vilket är sämre än att inte hitta den alls.
--
-- ── Varför tröskeln finns kvar ──────────────────────────────────────────────
--
-- `find_dishes` returnerar bara rätter minst två restauranger har. Träffen
-- leder till en sida, och en sida som listar ett enda ställe är en sämre kopia
-- av det ställets egen sida. Rätter hos EN restaurang hittas ändå — men som
-- restaurangträff, genom `restaurant_ids_matching_dish` nedan.

/**
 * Rätter som matchar en söksträng, eller de vanligaste när strängen är tom.
 *
 * En funktion och inte två: chipsen under sökrutan och sökträffarna är samma
 * fråga med och utan filter, och två funktioner hade betytt två trösklar att
 * hålla i takt.
 */
create or replace function public.find_dishes(
  p_query      text default null,
  p_city_slug  text default null,
  p_limit      integer default 8
)
returns table (
  dish_slug   text,
  dish_name   text,
  city_slug   text,
  city        text,
  restaurants bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.slugify(mi.name) as dish_slug,
    (array_agg(mi.name order by mi.name))[1] as dish_name,
    r.city_slug,
    (array_agg(r.city order by r.city))[1] as city,
    count(distinct r.id) as restaurants
  from public.menu_items mi
  join public.restaurants r on r.id = mi.restaurant_id
  where r.status = 'ACTIVE'
    and mi.status = 'PUBLISHED'
    and length(public.slugify(mi.name)) >= 3
    and (p_city_slug is null or r.city_slug = p_city_slug)
    /*
     * Sökningen viker bort diakriterna åt BÅDA håll.
     *
     * Den som skriver "cevapi" på ett tangentbord utan Ć ska hitta "Ćevapi",
     * och den som klistrar in "Ćevapi" ska hitta samma rad. `slugify()` gör
     * exakt den vikningen och används redan för adresserna — en egen
     * jämförelse här hade kunnat säga något annat än sidan gör.
     */
    and (
      p_query is null
      or btrim(p_query) = ''
      or public.slugify(mi.name) like '%' || public.slugify(p_query) || '%'
    )
  group by public.slugify(mi.name), r.city_slug
  having count(distinct r.id) >= 2
  order by count(distinct r.id) desc, 1
  limit greatest(1, least(p_limit, 50));
$$;

comment on function public.find_dishes is
  'Rätter som matchar en söksträng, eller stadens vanligaste när strängen är tom. Samma tröskel som dishes_in_city — en träff ska alltid leda till en sida som finns.';

/**
 * Restaurangerna vars MENY matchar söksträngen.
 *
 * Skild från `find_dishes` med flit: den här har ingen tröskel. En rätt hos ett
 * enda ställe ska hitta det stället — det som inte får hända är att den får en
 * egen sida.
 */
create or replace function public.restaurant_ids_matching_dish(p_query text)
returns table (restaurant_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct r.id
  from public.menu_items mi
  join public.restaurants r on r.id = mi.restaurant_id
  where r.status = 'ACTIVE'
    and mi.status = 'PUBLISHED'
    and btrim(coalesce(p_query, '')) <> ''
    and public.slugify(mi.name) like '%' || public.slugify(p_query) || '%'
  limit 200;
$$;

comment on function public.restaurant_ids_matching_dish is
  'Id på aktiva restauranger som har en publicerad menyrad som matchar söksträngen. Ingen tröskel: en rätt hos ETT ställe ska hitta det stället, den ska bara inte få en egen sida.';

revoke execute on function public.find_dishes(text, text, integer) from public;
revoke execute on function public.restaurant_ids_matching_dish(text) from public;
grant execute on function public.find_dishes(text, text, integer) to anon, authenticated, service_role;
grant execute on function public.restaurant_ids_matching_dish(text) to anon, authenticated, service_role;
