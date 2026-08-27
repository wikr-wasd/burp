-- 0061 — Vad man faktiskt äter där.
--
-- Korten på startsidan bär namn, kök, prisklass, betyg och en beskrivning som
-- restaurangen skrivit själv. Allt det säger vad stället ÄR. Ingenting säger
-- vad man äter där, eller vad det kostar — och det är de två frågorna en
-- hungrig gäst faktiskt ställer.
--
-- Bilden skulle ha svarat på den första. Den gör den inte: seed-datan ritar en
-- bokstav i en färgruta, och en riktig matbild kräver fotografier med rättigheter
-- som ingen ordnat än. Menyn finns däremot redan, och tre rader ur den säger
-- mer än en genererad gradient någonsin kommer att göra.
--
-- ── Varför en funktion och inte en join i appen ─────────────────────────────
--
-- "Tre rätter per restaurang, för dessa femton restauranger" är ett
-- topp-N-per-grupp, och det är en fönsterfunktion. Hämtat som en vanlig lista
-- blir det femton frågor eller en fråga som drar hem varje menyrad i systemet
-- för att kasta nästan allt.

create or replace function public.restaurant_highlights(
  p_restaurant_ids uuid[],
  p_per_restaurant integer default 3
)
returns table (
  restaurant_id uuid,
  name          text,
  price_ore     integer
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      mi.restaurant_id,
      mi.name,
      mi.price_ore,
      /*
       * Sorteringen är restaurangens egen, inte priset.
       *
       * `sort_order` är den ordning ägaren satt i menyn, och det som står
       * först står först för att hen vill det. Att i stället visa de billigaste
       * hade gjort varje kort till en lista över dryck och tillbehör.
       */
      row_number() over (
        partition by mi.restaurant_id
        order by mi.sort_order, mi.name
      ) as position
    from public.menu_items mi
    join public.menus m on m.id = (
      select mc.menu_id from public.menu_categories mc where mc.id = mi.category_id
    )
    where mi.restaurant_id = any(p_restaurant_ids)
      and mi.status = 'PUBLISHED'
      and mi.is_available
      and m.status = 'PUBLISHED'
  )
  select ranked.restaurant_id, ranked.name, ranked.price_ore
  from ranked
  where ranked.position <= greatest(1, least(p_per_restaurant, 6))
  order by ranked.restaurant_id, ranked.position;
$$;

comment on function public.restaurant_highlights is
  'Några rätter per restaurang, i menyns egen ordning. Svarar på "vad äter man där och vad kostar det" — den fråga korten inte kunde svara på utan bilder.';

revoke execute on function public.restaurant_highlights(uuid[], integer) from public;
grant execute on function public.restaurant_highlights(uuid[], integer)
  to anon, authenticated, service_role;
