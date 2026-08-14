-- 0012 — Tabellrättigheter för anon och authenticated.
--
-- RLS RÄCKER INTE ENSAMT. En policy kan bara begränsa det en roll redan har
-- rätt att göra. Utan GRANT får rollen `permission denied for table ...` och
-- policyn hinner aldrig ens utvärderas.
--
-- Det här är lätt att missa eftersom Supabase sätter grants automatiskt på
-- tabeller som skapas via Studio, men INTE på tabeller som skapas av en
-- migration. Resultatet blir ett schema som ser komplett ut — RLS på, policies
-- på plats — men där varje fråga från klienten avvisas.
--
--   Symptom: {"code":"42501","message":"permission denied for table restaurants"}
--
-- Modellen nedan:
--
--   anon           SELECT. Gästen läser publika restauranger och menyer. Allt
--                  skrivande i QR-flödet går via service role efter att
--                  servern verifierat bordstokenet, aldrig direkt från anon.
--
--   authenticated  SELECT, INSERT, UPDATE, DELETE. Vad som faktiskt går igenom
--                  avgörs av RLS. Tabeller utan INSERT-policy — till exempel
--                  `orders`, som bara får skapas av place_order() — förblir
--                  stängda även med GRANT INSERT, eftersom policyn saknas.
--
--   service_role   Allt, och kringgår ändå RLS.

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- Identitetskolumner (`generated always as identity` i order_events och
-- loyalty_transactions) hämtar sitt värde ur en sekvens. INSERT kräver USAGE
-- på den, annars faller skrivningen på ett fel som inte nämner sekvensen.
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

grant execute on all functions in schema public to anon, authenticated, service_role;

-- place_order() ska bara kunna anropas av route handlern med service role.
-- Raden ovan gav execute till alla; ta tillbaka den här.
revoke execute on function public.place_order(jsonb) from public, anon, authenticated;

-- Framtida tabeller får samma rättigheter automatiskt. Utan det här måste
-- varje ny migration komma ihåg att sätta grants — och den som glömmer får
-- felet först när en klient testar funktionen.
alter default privileges in schema public
  grant select on tables to anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
