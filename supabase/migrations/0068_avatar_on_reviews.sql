-- 0068 — Bilden på omdömet, om gästen väljer det.
--
-- ── Varför det inte räcker att slå på den ───────────────────────────────────
--
-- `lib/reviews.ts` bär ett beslut från 2026-08-22, skrivet där för att det inte
-- skulle gissas bort: omdömen är PSEUDONYMA. Skribentens namn visas inte,
-- eftersom gästen aldrig sagt ja till att publiceras på en indexerad sida — och
-- vägen dit går genom något hon själv väljer att publicera, inte genom att vi
-- läser hennes profil.
--
-- Bilden faller under exakt samma princip. Dessutom finns ett konkret löfte att
-- hålla: uppladdningen i migration 0067 stod under texten "Bara du ser den. Den
-- visas inte på dina omdömen." Att publicera de bilderna i efterhand vore att
-- bryta det löftet mot varje gäst som redan tryckt på knappen.
--
-- Därför tre saker, och inte en:
--
--   1. `avatar_public` — hennes eget val, som är NEJ tills hon säger något annat
--   2. `avatar_status` — Burp granskar innan bilden hamnar på en indexerad sida
--   3. en funktion som ger UT bara bildens sökväg, aldrig resten av profilen

alter table public.profiles
  add column avatar_public boolean not null default false,
  add column avatar_status public.media_status not null default 'PENDING',
  add column avatar_reviewed_at timestamptz,
  add column avatar_reviewed_by uuid references auth.users(id) on delete set null;

comment on column public.profiles.avatar_public is
  'Har gästen valt att visa sin bild på sina omdömen? Standard är NEJ. Bilden i 0067 laddades upp under löftet att bara hon ser den — den får inte publiceras av att en kolumn tillkom.';

comment on column public.profiles.avatar_status is
  'Granskning av bilden, samma enum som media. Gäller bara när avatar_public är sant; en privat bild granskas aldrig, eftersom Burp inte står som värd för något andra ser.';

-- ── Bucketen blir publik, och det är en verklig förändring ──────────────────
--
-- En signerad adress går ut. Restaurangsidan är ISR-cachad en timme, så en
-- signerad bild i den vore trasig innan sidan hunnit byggas om — och att
-- signera per visning hade betytt ett serveranrop per ansikte i en lista med
-- tjugo omdömen.
--
-- Priset: en bild som ligger i bucketen går att nå med sin adress även innan
-- den granskats, precis som en väntande restaurangbild i `menu-media` (0017).
-- Sökvägen bär ett slumpat uuid och går inte att gissa, men den som fått
-- adressen behåller den. Det är samma avvägning som redan är gjord en gång, nu
-- gjord medvetet en gång till för ett ansikte.

update storage.buckets set public = true where id = 'guest-avatars';

drop policy if exists "gästen ser sin egen bild" on storage.objects;

create policy "guest-avatars läsbar för alla"
  on storage.objects for select
  using (bucket_id = 'guest-avatars');

-- ── Granskningen är plattformens, aldrig gästens ────────────────────────────
--
-- Samma grind som bilderna fick i 0063 och dokumenten i 0064. RLS kan inte
-- uttrycka den: en policy ser bara den nya raden och kan inte se att statusen
-- ändrades.
--
-- Den gör dessutom en sak till: byter gästen bild går statusen tillbaka till
-- PENDING. Utan det räcker det att få EN bild godkänd för att sedan kunna lägga
-- vad som helst på en indexerad sida — samma hål som storage-UPDATE var för
-- restaurangerna (0065), fast genom framdörren.

create or replace function public.profile_avatar_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avatar_path is distinct from old.avatar_path then
    new.avatar_status      := 'PENDING';
    new.avatar_reviewed_at := null;
    new.avatar_reviewed_by := null;
    return new;
  end if;

  if new.avatar_status is distinct from old.avatar_status
     or new.avatar_reviewed_by is distinct from old.avatar_reviewed_by
     or new.avatar_reviewed_at is distinct from old.avatar_reviewed_at
  then
    if auth.uid() is not null and not public.is_platform_admin() then
      raise exception
        'Bildens granskning avgörs av Burp, inte av gästen.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.profile_avatar_guard is
  'Nollställer granskningen när bilden byts, och hindrar gästen från att godkänna sin egen. En ny bild på en godkänd rad hade annars publicerats osedd.';

create trigger profiles_avatar_guard
  before update on public.profiles
  for each row execute function public.profile_avatar_guard();

-- ── Bara sökvägen lämnar profilen ───────────────────────────────────────────
--
-- ⚠️ Att i stället lägga en select-policy på `profiles` för anon vore ett
-- allvarligt fel. RLS är RADnivå, inte kolumnnivå: en policy som släpper
-- igenom raden släpper igenom `email`, `phone` och `birth_date` med den.
--
-- Funktionen ger ut ett enda fält, för de gäster som själva valt att visa det
-- och vars bild Burp har granskat. Samma mönster som `restaurant_highlights`
-- (0061) — security definer i stället för en bredare policy.

create or replace function public.public_avatar_paths(p_user_ids uuid[])
returns table (user_id uuid, avatar_path text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.avatar_path
  from public.profiles p
  where p.id = any(p_user_ids)
    and p.avatar_public
    and p.avatar_status = 'APPROVED'
    and p.avatar_path is not null;
$$;

comment on function public.public_avatar_paths is
  'Bildens sökväg för gäster som valt att visa den och fått den granskad. Ger ALDRIG ut något annat ur profilen — en RLS-policy hade släppt igenom hela raden, inklusive e-post och telefon.';

revoke execute on function public.public_avatar_paths(uuid[]) from public;
grant execute on function public.public_avatar_paths(uuid[]) to anon, authenticated, service_role;

-- Granskningskön i backoffice sorterar på ålder och filtrerar på status.
create index profiles_avatar_pending_idx
  on public.profiles (avatar_status)
  where avatar_public and avatar_path is not null;

-- ── Granskningskön, utan att blotta profilen ────────────────────────────────
--
-- Backoffice kan inte läsa andra gästers profiler, och det är med flit:
-- `profiles_select_own` släpper bara igenom den egna raden. Att lägga till en
-- policy för plattformsadmin hade gett Burps personal e-post, telefon och
-- födelsedatum för varenda gäst — för att kunna titta på en bild.
--
-- Kön får därför två funktioner som ger ut exakt det som behövs, och
-- godkännandet går genom en tredje som prövar rollen själv.

create or replace function public.pending_avatars()
returns table (user_id uuid, avatar_path text, since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.avatar_path, p.updated_at
  from public.profiles p
  where p.avatar_public
    and p.avatar_path is not null
    and p.avatar_status = 'PENDING'
    and public.is_platform_admin()
  order by p.updated_at;
$$;

comment on function public.pending_avatars is
  'Gästbilder som väntar på granskning. Ger ut sökväg och ålder, aldrig e-post, telefon eller namn — granskaren ska bedöma en bild, inte läsa en profil.';

create or replace function public.moderate_avatar(p_user_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Bara Burps personal granskar gästbilder.'
      using errcode = '42501';
  end if;

  update public.profiles
  set avatar_status      = case when p_approve then 'APPROVED' else 'REJECTED' end::public.media_status,
      avatar_reviewed_at = now(),
      avatar_reviewed_by = auth.uid()
  where id = p_user_id;
end;
$$;

comment on function public.moderate_avatar is
  'Godkänner eller avvisar en gästbild. Prövar rollen själv eftersom funktionen är security definer — utan den kontrollen hade vem som helst kunnat publicera vilket ansikte som helst.';

revoke execute on function public.pending_avatars() from public, anon;
revoke execute on function public.moderate_avatar(uuid, boolean) from public, anon;
grant execute on function public.pending_avatars() to authenticated, service_role;
grant execute on function public.moderate_avatar(uuid, boolean) to authenticated, service_role;
