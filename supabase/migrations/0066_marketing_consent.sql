-- 0066 — Samtycket går att lämna, och att ta tillbaka.
--
-- `profiles.marketing_opt_in` finns sedan migration 0002 med `false` som
-- standard. Kolumnen har legat som ett skal sedan dess: den skrivs aldrig av
-- någon, den går inte att ändra någonstans i produkten, och det enda som läser
-- den är GDPR-exporten — som troget rapporterar `false` för varenda gäst.
--
-- Följden är att utskickslistan med säkerhet är TOM, och att ett
-- utskicksverktyg byggt ovanpå den hade varit en yta utan mottagare.
--
-- ── Varför triggern och inte en uppdatering efter registreringen ────────────
--
-- Med e-postbekräftelse påslagen finns ingen session förrän länken klickats.
-- En klient som försöker skriva profilen direkt efter `signUp()` har alltså
-- ingenting att skriva med, och rutan gästen kryssade i tappas tyst — i
-- produktion, men inte lokalt där bekräftelse är avstängd. Precis den sortens
-- fel som passerar varje test och bara syns i skarp drift.
--
-- Metadatan följer med användaren in och läses av triggern, som redan gör
-- samma sak med `full_name`.
--
-- ── Samtycket måste gå att ta tillbaka ──────────────────────────────────────
--
-- GDPR kräver att ett samtycke går att återkalla lika enkelt som det lämnades.
-- Rutan vid registreringen räcker alltså inte ensam; växeln på /konto/uppgifter
-- är en del av samma krav. Den skriver genom gästens egen session och behöver
-- ingen ny policy — `profiles` har redan en som säger att var och en råder över
-- sin egen rad.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, marketing_opt_in)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    -- Frånvaro är NEJ. Ett samtycke som uppstår för att fältet saknas är
    -- inget samtycke, och standardvärdet i kolumnen säger redan samma sak.
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user is
  'Skapar profilraden när ett konto registreras. Läser namn och marknadsföringssamtycke ur användarens metadata — samtycket kan inte skrivas av klienten efteråt, eftersom det med e-postbekräftelse påslagen inte finns någon session att skriva med.';

comment on column public.profiles.marketing_opt_in is
  'Samtycke till utskick. Sätts vid registreringen och kan tas tillbaka på /konto/uppgifter. Frånvaro av kryss är NEJ — ett utskick till den som inte kryssat är olagligt.';
