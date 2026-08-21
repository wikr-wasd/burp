-- 0047 — Personalens språk.
--
-- Gästytorna talar fem språk sedan 2026-08-20. Personalytorna talar svenska,
-- och det har varit medvetet så länge det bara fanns ett steg i taget: gästen
-- först, personalen sedan. Nu är personalen på tur.
--
-- ── Ett val per anställd, inte per restaurang och inte per webbläsare ───────
--
-- Språket ligger på `staff` och inte på `restaurants`, därför att det är en
-- egenskap hos människan och inte hos verksamheten. En restaurang i Sarajevo
-- kan ha en kock som läser bosniska och en chef som läser tyska, och den som
-- bestämmer åt båda har fel om en av dem.
--
-- Det läses INTE ur `Accept-Language`. Köket ska inte byta språk för att en
-- gäst gjorde det, och en surfplatta på en disk delas av flera — den som
-- ställer in sitt språk ska hitta det kvar nästa pass, oavsett vilken
-- webbläsare hen råkar stå framför.
--
-- ── NULL betyder "har inte valt", inte "svenska" ────────────────────────────
--
-- Kolumnen har med flit inget default. En ny anställd i Sarajevo ska inte
-- mötas av svenska bara för att Burp började i Sverige, och ett default i
-- schemat hade fryst svaret vid raden skapades. Med NULL avgör appen i stället
-- ur restaurangens land — `DEFAULT_LOCALE_BY_COUNTRY` i i18n-konfigurationen —
-- och en restaurang som byter land får rätt språk utan att någon rad skrivs om.
--
-- Det gör också "valde svenska" skiljbart från "har inte valt". Skillnaden
-- syns den dag Burp öppnar i ett land till.

alter table public.staff
  add column locale text,
  add constraint staff_locale_supported
    check (locale is null or locale in ('bs', 'en', 'de', 'no', 'sv'));

comment on column public.staff.locale is
  'Personalytornas språk för den här personen. NULL = inte valt; appen härleder då språket ur restaurangens land. Tvillingen till LOCALES i apps/web/src/lib/i18n/config.ts — läggs ett språk till måste båda ändras, precis som country_time_zone() och COUNTRY_INFO.';

-- ── Varför en funktion och inte en policy ───────────────────────────────────
--
-- Bara ägaren får skriva i `staff` (policy `staff_write_owner` i 0009), och
-- det ska det förbli: en chef som kunde skriva där skulle kunna ge sig själv
-- ägarrollen. Men varje anställd måste kunna sätta SITT eget språk, också
-- kocken som bara har köksskärmen.
--
-- En andra policy — "får uppdatera sin egen rad" — hade varit fel, och det är
-- värt att förstå exakt varför. Policyer är tillåtande och OR:as ihop, och
-- `authenticated` har `grant update` på HELA tabellen sedan 0012. En policy som
-- släpper igenom den egna raden släpper därför igenom alla dess kolumner, och
-- kocken hade kunnat sätta `role = 'owner'` på sig själv med ett anrop.
--
-- Kolumnrättigheter (`grant update (locale)`) hjälper inte heller: tabellnivån
-- är redan given och rättigheter är additiva, så en snävare kolumngrant tar
-- inte tillbaka något.
--
-- Kvar blir en funktion som bara kan skriva en enda kolumn. SECURITY DEFINER
-- kringgår ägarpolicyn, men funktionen tar inget användar-id — den skriver på
-- `auth.uid()` och kan alltså inte fås att röra någon annans rad.

create or replace function public.set_staff_locale(p_locale text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Ingen inloggad användare' using errcode = '28000';
  end if;

  -- Ingen egen lista över giltiga språk här. `staff_locale_supported` är den
  -- listan, och en andra kopia i den här funktionen hade blivit den som glöms
  -- den dag ett sjätte språk läggs till. Ett okänt värde faller på villkoret
  -- med 23514, vilket är ett ärligt fel och inte ett tyst.
  update public.staff
     set locale = p_locale
   where user_id = auth.uid();
end;
$$;

revoke execute on function public.set_staff_locale(text) from public, anon;
grant execute on function public.set_staff_locale(text) to authenticated, service_role;

comment on function public.set_staff_locale is
  'Sätter den inloggades personalspråk på alla restauranger hen arbetar på. SECURITY DEFINER därför att staff bara får skrivas av ägaren — funktionen är den enda vägen runt det, och den kan bara skriva kolumnen locale på auth.uid():s egna rader.';
