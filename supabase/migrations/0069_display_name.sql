-- 0069 — Namnet gästen väljer att publicera.
--
-- Bilden syns på omdömet sedan 0068, men skribenten står som "Gäst". Ett
-- ansikte utan namn är halvfärdigt.
--
-- ── Ett eget namn, aldrig profilnamnet ──────────────────────────────────────
--
-- `lib/reviews.ts` bär regeln sedan 2026-08-22, och den är skriven där för att
-- inte gissas bort:
--
--   "Ska namnet visas är vägen ett eget visningsnamn gästen själv väljer att
--    publicera — inte hennes profilnamn."
--
-- Skälet står i samma kommentar: uppslaget mot `profiles` gjordes en gång via
-- RLS-klienten och returnerade alltid tomt, eftersom `profiles_select_own` bara
-- släpper igenom den egna raden. Utfallet var rätt men koden såg ut att mena
-- motsatsen, och nästa person som undrade varför namnet aldrig syns hade en
-- uppenbar "fix": byt till service role. Då publiceras varje recensents
-- riktiga namn på en indexerad sida, och ingen policy stoppar det.
--
-- Därför en EGEN kolumn. `full_name` är vad hon heter; `display_name` är vad
-- hon valt att kalla sig offentligt. NULL betyder att hon inte valt något, och
-- då står det "Gäst" som förut.

alter table public.profiles
  add column display_name text
    check (display_name is null or length(btrim(display_name)) between 1 and 40);

comment on column public.profiles.display_name is
  'Namnet gästen valt att visa vid sina omdömen. ALDRIG härlett ur full_name — det är vad hon heter, inte vad hon valt att publicera. NULL = hon har inte valt något, och omdömet står som Gäst.';

-- ── Ingen egen granskningskö, och det är ett resonemang ─────────────────────
--
-- Bilden granskas därför att Burp står som värd för ett ansikte. Ett namn är
-- text, och gästens fritext publiceras redan: `reviews.comment` går ut osedd
-- och döljs i efterhand av restaurangen eller backoffice. Ett namn är en
-- mindre yta än en hel kommentar, och en andra kö för den hade betytt att
-- kommentaren — den större risken — fortfarande går osedd igenom.
--
-- Går namnet över styr döljs omdömet, som i dag. Vägen finns redan.

create or replace function public.public_display_names(p_user_ids uuid[])
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, btrim(p.display_name)
  from public.profiles p
  where p.id = any(p_user_ids)
    and p.display_name is not null
    and btrim(p.display_name) <> '';
$$;

comment on function public.public_display_names is
  'Visningsnamnet för gäster som valt ett. Ger ALDRIG ut något annat ur profilen — en RLS-policy hade släppt igenom hela raden, inklusive e-post och telefon. Samma skäl som public_avatar_paths.';

revoke execute on function public.public_display_names(uuid[]) from public;
grant execute on function public.public_display_names(uuid[]) to anon, authenticated, service_role;
