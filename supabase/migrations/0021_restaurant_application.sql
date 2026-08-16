-- 0021 — En restaurang kan ansöka om att ansluta sig.
--
-- Backoffice har hela tiden kunnat godkänna restauranger med status PENDING,
-- men ingenting har kunnat skapa dem. Enda vägen in i marknadsplatsen har
-- varit SQL — vilket betyder att det inte varit en marknadsplats, utan en
-- demo med sju påhittade ställen.
--
-- Ansökan skapar två rader som måste bli till samtidigt: restaurangen, och
-- personalraden som gör sökanden till ägare. Blir bara den ena till står
-- antingen en restaurang utan någon som kan sköta den, eller en personalrad
-- som pekar i tomma intet.
--
-- Därför en SECURITY DEFINER-funktion, av samma skäl som `place_order`:
-- RLS-policyerna för `staff` kräver att man redan är ägare vid restaurangen,
-- och vid ansökan finns ingen sådan ägare ännu. Att lösa det med en policy
-- hade krävt ett hål som gäller i alla lägen; funktionen är ett hål som gäller
-- exakt här och som går att läsa i sin helhet.

create or replace function public.currency_for_country(p_country public.country_code)
returns public.currency_code
language sql
immutable
as $$
  select case p_country
    when 'BA' then 'BAM'
    when 'HR' then 'EUR'
    when 'RS' then 'RSD'
    when 'SE' then 'SEK'
  end::public.currency_code;
$$;

comment on function public.currency_for_country is
  'Valutan följer av landet. Speglar COUNTRY_INFO i packages/core/src/country.ts.';

/*
 * Unik slug inom staden.
 *
 * Två restauranger som heter "Pekara" i samma stad är inte ovanligt, och
 * `restaurants_city_slug_key` tillåter inte båda. Numrera i stället för att
 * avvisa ansökan: den som söker har inte gjort något fel, och ett felmeddelande
 * om att namnet är upptaget är svårt att förstå när man ser sitt eget namn.
 */
create or replace function public.unique_restaurant_slug(p_name text, p_city text)
returns text
language plpgsql
stable
as $$
declare
  v_base   text := public.slugify(p_name);
  v_slug   text := v_base;
  v_city   text := public.slugify(p_city);
  v_suffix integer := 1;
begin
  if v_base = '' then
    raise exception 'Namnet ger ingen giltig adress'
      using errcode = 'check_violation';
  end if;

  while exists (
    select 1 from public.restaurants
    where city_slug = v_city and slug = v_slug
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix;
  end loop;

  return v_slug;
end;
$$;

create or replace function public.apply_for_restaurant(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_country public.country_code;
  v_id      uuid;
begin
  -- Ansökan kräver ett konto. Utan det finns ingen att göra till ägare, och
  -- ingen att kontakta när Burp granskat.
  if v_user_id is null then
    raise exception 'Ansökan kräver inloggning'
      using errcode = 'insufficient_privilege';
  end if;

  v_country := (p_input->>'country')::public.country_code;

  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city,
    country, currency, phone, email, description,
    -- PENDING sätts här och kan inte skickas med. En sökande ska aldrig kunna
    -- ansöka sig själv till ACTIVE.
    status
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
    'PENDING'
  )
  returning id into v_id;

  -- Sökanden blir ägare direkt. Restaurangen är ändå osynlig för gäster tills
  -- Burp godkänt den, så hen kan förbereda meny och öppettider under tiden —
  -- vilket är hela poängen med att godkännandet inte blockerar förberedelsen.
  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_id, v_user_id, 'owner', true);

  return v_id;
end;
$$;

comment on function public.apply_for_restaurant is
  'Skapar en restaurang med status PENDING och gör den inloggade till ägare. Statusen kan inte anges av anroparen.';

revoke execute on function public.apply_for_restaurant(jsonb) from public, anon;
grant execute on function public.apply_for_restaurant(jsonb) to authenticated, service_role;

grant execute on function public.currency_for_country(public.country_code)
  to anon, authenticated, service_role;
grant execute on function public.unique_restaurant_slug(text, text)
  to authenticated, service_role;
