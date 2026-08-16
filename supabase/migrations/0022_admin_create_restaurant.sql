-- 0022 — Burp kan lägga upp en restaurang direkt.
--
-- `apply_for_restaurant` (0021) är sökandens väg in: den skapar alltid PENDING
-- och gör den inloggade till ägare. Den duger inte när Burp själv lägger upp
-- ett ställe — vid mässor, vid uppsökande försäljning, eller när ägaren inte
-- har något konto ännu och Burp fyller i åt hen.
--
-- Två skillnader mot ansökan, och båda är skälet till att det behövs en egen
-- funktion i stället för ett extra fält i den befintliga:
--
--   1. Statusen får anges. En sökande ska aldrig kunna ansöka sig själv till
--      ACTIVE; Burp ska kunna lägga upp en restaurang som redan är godkänd.
--   2. Ägaren är någon annan än anroparen — eller ingen alls tills vidare.
--
-- Ett fält som bara vissa roller får sätta är svårare att granska än två
-- funktioner med varsin behörighetskontroll överst.

create or replace function public.admin_create_restaurant(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country public.country_code;
  v_status  public.restaurant_status;
  v_owner   uuid;
  v_id      uuid;
begin
  -- Behörigheten kontrolleras FÖRST och i funktionen, inte i anropande kod.
  -- En SECURITY DEFINER-funktion kör med ägarens rättigheter; glöms kontrollen
  -- är den ett hål som kringgår hela RLS-modellen.
  if not public.is_platform_admin() then
    raise exception 'Kräver Burp-behörighet'
      using errcode = 'insufficient_privilege';
  end if;

  v_country := (p_input->>'country')::public.country_code;
  v_status  := coalesce((p_input->>'status')::public.restaurant_status, 'PENDING');

  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city,
    country, currency, phone, email, description, status
  )
  values (
    p_input->>'name',
    public.unique_restaurant_slug(p_input->>'name', p_input->>'city'),
    p_input->>'org_number',
    p_input->>'street_address',
    p_input->>'postal_code',
    p_input->>'city',
    v_country,
    public.currency_for_country(v_country),
    nullif(p_input->>'phone', ''),
    nullif(p_input->>'email', ''),
    nullif(p_input->>'description', ''),
    v_status
  )
  returning id into v_id;

  /*
   * Ägaren är valfri.
   *
   * Burp lägger ofta upp stället innan ägaren skapat konto. Restaurangen är
   * fullt användbar utan personal — den syns bara inte för någon som kan
   * sköta den, vilket är exakt vad "upplagd men inte överlämnad" betyder.
   * Ägaren knyts senare via personalfliken.
   *
   * Anges ett användar-id måste det finnas. Ett id som pekar i tomma intet
   * hade fallit på främmande nyckel ändå, men med ett obegripligt felmeddelande.
   */
  v_owner := nullif(p_input->>'owner_user_id', '')::uuid;

  if v_owner is not null then
    if not exists (select 1 from auth.users where id = v_owner) then
      raise exception 'Användaren finns inte'
        using errcode = 'foreign_key_violation';
    end if;

    insert into public.staff (restaurant_id, user_id, role, is_active)
    values (v_id, v_owner, 'owner', true);
  end if;

  return v_id;
end;
$$;

comment on function public.admin_create_restaurant is
  'Lägger upp en restaurang som Burp-personal. Till skillnad från apply_for_restaurant får statusen anges och ägaren vara någon annan — eller ingen.';

revoke execute on function public.admin_create_restaurant(jsonb) from public, anon;
grant execute on function public.admin_create_restaurant(jsonb) to authenticated, service_role;
