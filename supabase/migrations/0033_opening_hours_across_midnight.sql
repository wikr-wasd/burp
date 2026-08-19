-- 0033 — Öppettider: restaurangens tidszon, och pass som går över midnatt.
--
-- Två fel i `is_restaurant_open()`, båda kända och båda uppskjutna. De hänger
-- ihop och rättas därför tillsammans.
--
-- **1. Tidszonen var hårdkodad till Europe/Stockholm.** Det bryter mot regel 9:
-- landet avgör, inte koden. Ofarligt så länge alla fyra marknader ligger i CET,
-- men "ofarligt idag" är inte samma sak som rätt — och den dag en restaurang i
-- en annan tidszon läggs upp är felet att kök tar emot order när de är stängda,
-- vilket ingen upptäcker förrän en gäst står utanför en låst dörr.
--
-- **2. Pass över midnatt hanterades inte.** En kafana i Sarajevo eller Beograd
-- stänger sällan före midnatt. Med den gamla funktionen var ett pass som
-- 22:00–02:00 antingen omöjligt att spara eller tyst verkningslöst — alltså
-- stängd i egna ögon under precis de timmar den har flest gäster.
--
-- Formatet är oförändrat. Ett pass där `closes` ligger FÖRE `opens` slutar
-- dagen efter. `{"opens": "22:00", "closes": "02:00"}` betyder tio på kvällen
-- till två på natten.

-- ── Landets tidszon ─────────────────────────────────────────────────────────
--
-- ⚠️ Speglar `COUNTRY_INFO[...].timeZone` i packages/core/src/country.ts.
-- Ändras den ena MÅSTE den andra följa med — samma krav som `allowed_vat_rates()`
-- i migration 0019, och av samma skäl: två svar på samma fråga glider isär.

create or replace function public.country_time_zone(p_country public.country_code)
returns text
language sql
immutable
as $$
  select case p_country
    when 'BA' then 'Europe/Sarajevo'
    when 'HR' then 'Europe/Zagreb'
    when 'RS' then 'Europe/Belgrade'
    when 'SE' then 'Europe/Stockholm'
  end;
$$;

comment on function public.country_time_zone is
  'Restaurangens tidszon, härledd ur landet. Speglar COUNTRY_INFO i @burp/core — ändra alltid båda.';

-- ── Öppettidskontrollen ─────────────────────────────────────────────────────

create or replace function public.is_restaurant_open(
  p_restaurant_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Nycklarna i JSONB-objektet, i ISO-veckans ordning: 1 = måndag.
  k_days constant text[] := array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  v_hours    jsonb;
  v_status   public.restaurant_status;
  v_country  public.country_code;
  v_zone     text;
  v_local    timestamp;
  v_dow      integer;
  v_today    text;
  v_yesterday text;
  v_time     time;
  v_slot     jsonb;
  v_opens    time;
  v_closes   time;
begin
  select opening_hours, status, country
  into v_hours, v_status, v_country
  from public.restaurants
  where id = p_restaurant_id;

  if not found or v_status <> 'ACTIVE' then
    return false;
  end if;

  -- Öppettider är alltid lokala, och "lokalt" betyder där restaurangen står.
  -- En restaurang i Zagreb öppnar 11:00 kroatisk tid oavsett var servern kör.
  v_zone := coalesce(public.country_time_zone(v_country), 'Europe/Sarajevo');
  v_local := p_at at time zone v_zone;

  -- `extract(isodow)` och inte `to_char(..., 'dy')`: det senare påverkas av
  -- lc_time, och på en server med svensk locale blir nyckeln 'mån' i stället
  -- för 'mon'. Då är varje restaurang stängd jämt, och ingenting i loggen
  -- säger varför.
  v_dow := extract(isodow from v_local)::integer;
  v_today := k_days[v_dow];
  v_yesterday := k_days[case when v_dow = 1 then 7 else v_dow - 1 end];

  v_time := v_local::time;

  -- Dagens egna pass.
  for v_slot in select * from jsonb_array_elements(coalesce(v_hours->v_today, '[]'::jsonb))
  loop
    v_opens := (v_slot->>'opens')::time;
    v_closes := (v_slot->>'closes')::time;

    if v_closes > v_opens then
      -- Vanligt pass inom dygnet.
      if v_opens <= v_time and v_closes > v_time then
        return true;
      end if;
    elsif v_closes < v_opens then
      -- Går över midnatt: resten av passet ligger på morgondagen.
      if v_time >= v_opens then
        return true;
      end if;
    end if;
  end loop;

  -- Gårdagens nattpass. Klockan ett på natten hör till gårdagens nyckel, och
  -- utan den här slingan är kafanan stängd i egna ögon efter midnatt.
  for v_slot in select * from jsonb_array_elements(coalesce(v_hours->v_yesterday, '[]'::jsonb))
  loop
    v_opens := (v_slot->>'opens')::time;
    v_closes := (v_slot->>'closes')::time;

    if v_closes < v_opens and v_time < v_closes then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

comment on function public.is_restaurant_open is
  'Är restaurangen öppen just nu? Räknar i restaurangens egen tidszon (regel 9) och hanterar pass som går över midnatt. Speglas av isOpenAt() i @burp/core.';
