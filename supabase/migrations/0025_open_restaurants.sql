-- 0025 — Vilka restauranger som är öppna just nu, i ett enda anrop.
--
-- Kartsidan /upptack har ett "Öppet nu"-filter. Frågan "är den här
-- restaurangen öppen?" har redan ett svar — `is_restaurant_open()` i migration
-- 0004 — och det svaret ligger i databasen med flit: öppettider är lokala, och
-- gästens telefon får aldrig avgöra om ett kök tar emot order.
--
-- Utan den här funktionen fanns två dåliga vägar. Antingen ett RPC-anrop per
-- restaurang, vilket är sextio rundturer för en sida. Eller en kopia av
-- öppettidslogiken i TypeScript, vilket är samma fel som `discovery-format.ts`
-- redan varnar för i sin egen kommentar: två svar på samma fråga glider
-- garanterat isär, och den dagen visar listan öppet medan beställningen nekas.
--
-- Funktionen är alltså inte ny logik. Den är samma logik, en gång per rad.

create or replace function public.open_restaurant_ids(
  p_at timestamptz default now()
)
returns table (restaurant_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select r.id
  from public.restaurants r
  where r.status = 'ACTIVE'
    and public.is_restaurant_open(r.id, p_at);
$$;

comment on function public.open_restaurant_ids is
  'Id på varje aktiv restaurang som är öppen vid p_at. Samma regel som is_restaurant_open, en gång per restaurang — kartsidans "Öppet nu" ska aldrig svara något annat än beställningsflödet.';

-- RLS utan GRANT är verkningslös, och det gäller funktioner lika mycket som
-- tabeller: utan EXECUTE svarar PostgREST 404 på anropet. Migration 0012 finns
-- för att det felet redan begåtts en gång.
--
-- Anon får anropa den. Listan över öppna restauranger är exakt lika publik som
-- öppettiderna den härleds ur, och gästen på /upptack är inte inloggad.
grant execute on function public.open_restaurant_ids(timestamptz) to anon, authenticated;
