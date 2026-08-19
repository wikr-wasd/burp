-- 0041 — GDPR: gästen får ut sina uppgifter, och får bort sig själv.
--
-- Artikel 15 och 20 ger rätt till en kopia i maskinläsbart format. Artikel 17
-- ger rätt till radering. Ingetdera fanns, och det andra var inte bara obyggt
-- utan **omöjligt**: fyra oberoende spärrar stoppade en radering, alla mätta mot
-- en riktig databas innan den här migrationen skrevs.
--
--   Gästen hade                Vad som stoppade raderingen
--   ─────────────────────────  ──────────────────────────────────────────────
--   ett omdöme                 `reviews_has_author` — FK:n sätter user_id till
--                              null, och checken kräver en avsändare
--   lojalitetspoäng            `loyalty_accounts` kaskaderar, och
--                              `loyalty_transactions` går inte att radera
--   ett uttaget klippkort      `punch_card_redemptions` kaskaderar, och den är
--                              append-only
--   en använd kupong           vakten på `coupon_redemptions` släpper bara
--                              igenom `released_at`
--
-- Var och en av spärrarna är rätt i sig. Det är kombinationen som är fel:
-- loggarna ska vara oföränderliga, men de ska inte kunna hålla en person kvar i
-- systemet mot hens vilja.
--
-- ── Radering betyder avidentifiering ────────────────────────────────────────
--
-- Order, betalningar, avgifter och moms är bokföring. De måste sparas i sju år,
-- och rätten till radering väger inte över en rättslig förpliktelse
-- (artikel 17.3 b). Det som ska bort är **personen**, inte affärshändelsen.
--
-- Efter en radering finns beställningen kvar utan köpare, avgiften kvar utan
-- gäst och omdömet kvar utan författare. Ingen kolumn i schemat pekar längre på
-- någon som gick att peka ut.
--
-- Vad som ska raderas och vad som ska avidentifieras är i sista hand ett
-- juridiskt beslut. Valen nedan är motiverade och står i
-- docs/OPEN-QUESTIONS.md fråga 13, med vad som krävs för att ändra dem.

-- ── Personen går att lossa från loggarna ────────────────────────────────────
--
-- Tre främmandenycklar kaskaderade, alltså försökte de RADERA rader ur loggar
-- som inte får raderas. De sätter i stället personen till null. Raden blir kvar,
-- händelsen står kvar, och gästen är borta ur den.

alter table public.loyalty_accounts
  alter column user_id drop not null;

alter table public.loyalty_accounts
  drop constraint loyalty_accounts_user_id_fkey;

alter table public.loyalty_accounts
  add constraint loyalty_accounts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

comment on column public.loyalty_accounts.user_id is
  'Null när gästen raderat sig. Kontot och dess händelselogg står kvar utan ägare — poängen går inte längre att nå, och loggen behöver inte skrivas om.';

alter table public.punch_card_redemptions
  alter column guest_id drop not null;

alter table public.punch_card_redemptions
  drop constraint punch_card_redemptions_guest_id_fkey;

alter table public.punch_card_redemptions
  add constraint punch_card_redemptions_guest_id_fkey
  foreign key (guest_id) references auth.users(id) on delete set null;

comment on column public.punch_card_redemptions.guest_id is
  'Null när gästen raderat sig. Uttaget står kvar — restaurangen bekostade en måltid och det är en affärshändelse — men det går inte längre att räkna det mot en person.';

-- ── Vakterna släpper igenom att personen lossas ─────────────────────────────
--
-- `guard_redemption_release` (0038) tillåter bara `released_at` att ändras och
-- `punch_card_redemptions_immutable` tillåter ingenting alls. Båda är rätt mot
-- den som vill skriva om en inlösen; ingen av dem ska stå i vägen för en
-- radering.
--
-- Det som öppnas är exakt ett steg, och bara åt ett håll: `guest_id` från ett
-- värde till null. Vägen tillbaka finns inte — en avidentifierad rad går inte
-- att knyta till en person igen, och det är hela poängen.

create or replace function public.guard_redemption_release()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Rader i % raderas aldrig. En inlösen som går att radera är ingen gräns.',
      tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * En redan återlämnad rad är färdig, med ETT undantag: gästen får lossas.
   *
   * En kupong som lämnades tillbaka när ordern avbröts bär fortfarande sitt
   * `guest_id`, och en radering måste komma åt det. Allt annat på en färdig rad
   * är stängt — och villkoret ställs på vad som FAKTISKT ändras, inte på om
   * `released_at` står i SET-listan. `now()` är samma tidpunkt i hela
   * transaktionen, så en andra återlämning ser identisk ut och hade annars
   * sluppit igenom.
   */
  if old.released_at is not null then
    if new.guest_id is null
       and old.guest_id is not null
       and (to_jsonb(new) - 'guest_id') is not distinct from (to_jsonb(old) - 'guest_id')
    then
      return new;
    end if;

    raise exception 'Rader i % kan bara lämnas tillbaka en gång', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  -- Avidentifiering: gästen får lossas, aldrig bytas ut.
  if new.guest_id is distinct from old.guest_id and new.guest_id is not null then
    raise exception 'Gästen på en rad i % kan bara tas bort, aldrig ändras', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * Allt utom `released_at` och `guest_id` måste vara oförändrat.
   *
   * Jämförelsen görs på hela raden och inte kolumn för kolumn. En uppräkning
   * skyddar bara de fält någon kom ihåg att skriva ned — och nästa kolumn som
   * läggs till blir oskyddad utan att någon märker det. Den här varianten
   * skyddar den automatiskt.
   */
  if (to_jsonb(new) - 'released_at' - 'guest_id')
     is distinct from (to_jsonb(old) - 'released_at' - 'guest_id') then
    raise exception 'Rader i % kan bara märkas som återlämnade eller avidentifieras',
      tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- Båda tabellerna delar vakten sedan 0038, så en `create or replace` räcker —
-- ingen trigger behöver röras.

-- ── Ett omdöme utan författare ──────────────────────────────────────────────
--
-- `reviews_has_author` (0028) finns för att ett omdöme utan avsändare inte är
-- en källa. Regeln står kvar; det som läggs till är en tredje sorts härkomst.
--
-- Omdömet HADE en författare, som sedan raderat sig. Att det byggde på ett
-- riktigt köp bevisas fortfarande av `order_id` med sitt unika index — och det
-- är den kopplingen som stoppar falska omdömen, inte namnet.
--
-- Fritexten och bilden försvinner. Betyget står kvar. Ett omdöme i fritext är
-- gästens egna ord och kan bära vad som helst om hen själv; en siffra mellan
-- ett och fem kan det inte.

alter table public.reviews
  add column anonymised_at timestamptz;

comment on column public.reviews.anonymised_at is
  'Satt när författaren raderat sig. Betyget står kvar, fritexten och bilden är borta.';

alter table public.reviews
  drop constraint reviews_has_author;

alter table public.reviews
  add constraint reviews_has_author
  check (user_id is not null or table_session_id is not null or anonymised_at is not null)
  not valid;

-- ── Kopia på allt vi har ────────────────────────────────────────────────────
--
-- Artikel 20 kräver ett "strukturerat, allmänt använt och maskinläsbart"
-- format. Alltså JSON, och **nycklarna är på engelska**: filen ska gå att läsa
-- av ett program hos nästa tjänst, och en nyckel som byter namn med gästens
-- språkval är inte maskinläsbar. Texten gästen själv skrivit står förstås som
-- hon skrev den.
--
-- SECURITY DEFINER och bara service role. Funktionen filtrerar hårt på
-- p_user_id och anropas av servern med den inloggades eget id — aldrig med ett
-- id som kommit in från klienten. Alternativet, SECURITY INVOKER med RLS som
-- garant, hade gett en OFULLSTÄNDIG export: gästen saknar select-policy på
-- flera av tabellerna nedan, och en export som tyst utelämnar hälften är sämre
-- än ingen.

create or replace function public.export_guest_data(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'format', 'burp-guest-export-1',

    'account', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'name', p.full_name,
        'phone', p.phone,
        'birth_date', p.birth_date,
        'marketing_opt_in', p.marketing_opt_in,
        'created_at', p.created_at
      )
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.id = p_user_id
    ),

    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', a.label,
        'street_address', a.street_address,
        'postal_code', a.postal_code,
        'city', a.city,
        'door_code', a.door_code,
        'instructions', a.instructions,
        'created_at', a.created_at
      ) order by a.created_at)
      from public.addresses a where a.user_id = p_user_id
    ), '[]'::jsonb),

    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'restaurant', r.name,
        'placed_at', o.placed_at,
        'completed_at', o.completed_at,
        'status', o.status,
        'type', o.type,
        'currency', o.currency,
        'items_gross_ore', o.items_gross_ore,
        'items_vat_ore', o.items_vat_ore,
        'discount_ore', o.discount_ore,
        'tip_ore', o.tip_ore,
        'total_ore', o.total_ore,
        'note', o.note,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', oi.name_snapshot,
            'quantity', oi.quantity,
            'unit_price_ore', oi.unit_price_ore,
            'line_gross_ore', oi.line_gross_ore,
            'note', oi.note
          ) order by oi.created_at)
          from public.order_items oi where oi.order_id = o.id
        ), '[]'::jsonb)
      ) order by o.created_at)
      from public.orders o
      join public.restaurants r on r.id = o.restaurant_id
      where o.guest_id = p_user_id
    ), '[]'::jsonb),

    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurant', r.name,
        'created_at', rv.created_at,
        'rating_food', rv.rating_food,
        'rating_service', rv.rating_service,
        'rating_delivery', rv.rating_delivery,
        'comment', rv.comment,
        'published', rv.is_published,
        'restaurant_response', rv.response
      ) order by rv.created_at)
      from public.reviews rv
      join public.restaurants r on r.id = rv.restaurant_id
      where rv.user_id = p_user_id
    ), '[]'::jsonb),

    'favourites', coalesce((
      select jsonb_agg(jsonb_build_object('restaurant', r.name, 'since', f.created_at)
                       order by f.created_at)
      from public.favorites f
      join public.restaurants r on r.id = f.restaurant_id
      where f.user_id = p_user_id
    ), '[]'::jsonb),

    'loyalty', coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurant', r.name,
        'balance_points', (
          select coalesce(sum(lt.points), 0)
          from public.loyalty_transactions lt where lt.account_id = la.id
        ),
        'transactions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'at', lt.created_at,
            'kind', lt.kind,
            'points', lt.points,
            'expires_at', lt.expires_at,
            'description', lt.description
          ) order by lt.created_at)
          from public.loyalty_transactions lt where lt.account_id = la.id
        ), '[]'::jsonb)
      ))
      from public.loyalty_accounts la
      left join public.restaurants r on r.id = la.restaurant_id
      where la.user_id = p_user_id
    ), '[]'::jsonb),

    'coupons_used', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', c.code,
        'restaurant', r.name,
        'at', cr.redeemed_at,
        'discount_ore', cr.discount_ore,
        'returned_at', cr.released_at
      ) order by cr.redeemed_at)
      from public.coupon_redemptions cr
      join public.coupons c on c.id = cr.coupon_id
      join public.restaurants r on r.id = c.restaurant_id
      where cr.guest_id = p_user_id
    ), '[]'::jsonb),

    'punch_card_rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurant', r.name,
        'at', pcr.redeemed_at,
        'card_size', pcr.size,
        'reward_ore', pcr.reward_ore,
        'returned_at', pcr.released_at
      ) order by pcr.redeemed_at)
      from public.punch_card_redemptions pcr
      join public.restaurants r on r.id = pcr.restaurant_id
      where pcr.guest_id = p_user_id
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.export_guest_data(uuid) from public, anon, authenticated;
grant execute on function public.export_guest_data(uuid) to service_role;

comment on function public.export_guest_data is
  'Allt Burp har om en gäst, som JSON med engelska nycklar (artikel 15 och 20). Bara service role — servern skickar den inloggades eget id och aldrig ett som kommit från klienten.';

-- ── Radering ────────────────────────────────────────────────────────────────
--
-- Hela raderingen ligger i EN funktion och en transaktion. Alternativet — att
-- avidentifiera här och låta appen ta bort kontot i ett andra steg genom
-- Supabase auth-API — hade lämnat ett läge där omdömet är tömt men kontot finns
-- kvar, om något gick fel emellan. Radering är inte en åtgärd som får bli
-- halvfärdig.

create or replace function public.erase_guest(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary jsonb;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Okänt konto %', p_user_id using errcode = 'no_data_found';
  end if;

  /*
   * Personal och Burp-anställda raderas inte här.
   *
   * `staff` och `platform_admins` kaskaderar från kontot, så en radering hade
   * tyst tagit bort någons anställning — och med den restaurangens sista ägare.
   * Rätten gäller dem också, men vägen dit går genom att först avsluta
   * anställningen, och det är ett beslut någon annan ska fatta medvetet.
   */
  if exists (select 1 from public.staff where user_id = p_user_id)
     or exists (select 1 from public.platform_admins where user_id = p_user_id) then
    raise exception 'Kontot är knutet till en restaurang eller till Burp. Avsluta anställningen först.'
      using errcode = 'check_violation';
  end if;

  -- Vad som fanns, innan det försvinner. Kvittot på att raderingen skedde är
  -- det enda som blir kvar, och det får inte innehålla något om personen.
  select jsonb_build_object(
    'orders_anonymised',    (select count(*) from public.orders where guest_id = p_user_id),
    'reviews_anonymised',   (select count(*) from public.reviews where user_id = p_user_id),
    'addresses_deleted',    (select count(*) from public.addresses where user_id = p_user_id),
    'favourites_deleted',   (select count(*) from public.favorites where user_id = p_user_id),
    'loyalty_detached',     (select count(*) from public.loyalty_accounts where user_id = p_user_id),
    'coupons_anonymised',   (select count(*) from public.coupon_redemptions where guest_id = p_user_id),
    'punch_cards_anonymised', (select count(*) from public.punch_card_redemptions where guest_id = p_user_id)
  ) into v_summary;

  -- Omdömena först. `user_id` nollas av främmandenyckeln när kontot går, men
  -- checken kräver att härkomsten redan är satt — annars faller raderingen på
  -- `reviews_has_author`, vilket är precis vad den gjorde före den här
  -- migrationen.
  update public.reviews
  set anonymised_at = now(),
      comment       = null,
      image_url     = null
  where user_id = p_user_id;

  /*
   * Kontot tas bort, och främmandenycklarna gör resten.
   *
   * Kaskad: profil, adresser, favoriter, notisprenumerationer.
   * Null: order, omdömen, lojalitetskonto, kuponginlösen, klippkortsuttag,
   *       orderhändelser.
   *
   * Ingenting räknas upp här med flit. En lista i koden hade glömt nästa tabell
   * någon lägger till; schemat glömmer den inte.
   */
  delete from auth.users where id = p_user_id;

  return v_summary;
end;
$$;

revoke execute on function public.erase_guest(uuid) from public, anon, authenticated;
grant execute on function public.erase_guest(uuid) to service_role;

comment on function public.erase_guest is
  'Raderar en gäst enligt artikel 17. Bokföringen står kvar utan person: order, avgifter och omdömesbetyg finns kvar, allt som pekar ut någon är borta. Vägrar för personal — avsluta anställningen först.';
