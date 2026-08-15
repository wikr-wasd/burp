-- 0019 — Land och valuta per restaurang.
--
-- Burp byggdes som en svensk produkt och hade Sverige inbakat: SEK i
-- prisformateringen, 12 och 25 procents moms, tio siffror i
-- organisationsnumret. Marknaden är Bosnien, Serbien och Kroatien — tre
-- valutor och tre momssystem.
--
-- Landet blir en egenskap hos restaurangen och avgör resten. Alternativet,
-- att varje formulär bär sitt eget antagande om var i världen det körs, är
-- hur den här sortens fel uppstår från början.

create type public.country_code as enum ('BA', 'HR', 'RS', 'SE');
create type public.currency_code as enum ('BAM', 'EUR', 'RSD', 'SEK');

-- Befintliga rader är svenska. Defaulten gäller bara dem; nya restauranger
-- måste ange land, annars smyger Sverige tillbaka in som antagande.
alter table public.restaurants
  add column country  public.country_code  not null default 'SE',
  add column currency public.currency_code not null default 'SEK';

comment on column public.restaurants.currency is
  'Valutan restaurangen prissätter i. Alla belopp lagras som heltal i valutans hundradelar — öre, cent, fening, para.';

/*
 * Momssatser per land, i baspunkter.
 *
 * Bosnien har EN sats på 17 procent; att reduced och standard är lika där är
 * avsiktligt. Speglar allowedVatRates() i packages/core/src/country.ts —
 * ändras den ena måste den andra följa med.
 */
create or replace function public.allowed_vat_rates(p_country public.country_code)
returns integer[]
language sql
immutable
as $$
  select case p_country
    when 'BA' then array[1700]
    when 'HR' then array[1300, 2500]
    when 'RS' then array[1000, 2000]
    when 'SE' then array[1200, 2500]
  end;
$$;

/*
 * Organisationsnumrets format per land.
 *
 * Ett kroatiskt OIB har elva siffror, ett serbiskt PIB nio, ett bosniskt JIB
 * tretton och ett svenskt organisationsnummer tio. Utan landet går de inte att
 * skilja åt, och den gamla kontrollen `^\d{10}$` hade avvisat samtliga utom de
 * svenska.
 */
alter table public.restaurants drop constraint if exists restaurants_org_number_format;

alter table public.restaurants
  add constraint restaurants_org_number_format check (
    case country
      when 'BA' then org_number ~ '^\d{13}$'
      when 'HR' then org_number ~ '^\d{11}$'
      when 'RS' then org_number ~ '^\d{9}$'
      when 'SE' then org_number ~ '^\d{10}$'
    end
  );

/*
 * Menyradens momssats måste finnas i restaurangens land.
 *
 * En check-constraint kan inte slå upp en annan tabell, så det blir en
 * trigger. Utan den går det att sätta svensk matmoms på en kroatisk pizza —
 * felet syns inte i gränssnittet och landar i bokföringen.
 */
create or replace function public.enforce_vat_rate_for_country()
returns trigger
language plpgsql
as $$
declare
  v_country public.country_code;
  v_allowed integer[];
begin
  select country into v_country from public.restaurants where id = new.restaurant_id;
  if v_country is null then
    return new;
  end if;

  v_allowed := public.allowed_vat_rates(v_country);

  if not (new.vat_rate_bps = any(v_allowed)) then
    raise exception 'Momssatsen % gäller inte i %. Tillåtna satser: %',
      new.vat_rate_bps, v_country, array_to_string(v_allowed, ', ')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger menu_items_vat_for_country
  before insert or update of vat_rate_bps on public.menu_items
  for each row execute function public.enforce_vat_rate_for_country();

-- Statistiken och restauranglistan filtrerar på land så fort mer än ett finns.
create index if not exists restaurants_country_idx on public.restaurants (country);

grant execute on function public.allowed_vat_rates(public.country_code)
  to anon, authenticated, service_role;
