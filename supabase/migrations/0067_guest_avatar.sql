-- 0067 — Gästens egen bild.
--
-- Kontot var en orderlista med ett saldo. Bilden är den enklaste personliga
-- detaljen som finns, och den enda som gästen själv styr helt.
--
-- ── Privat bucket, till skillnad från menybilderna ──────────────────────────
--
-- `menu-media` och `restaurant-docs` är PUBLIKA med flit: modereringen avgör
-- vad som visas på Burp, inte vad som går att nå med en gissad URL, och en
-- signering per bild i varje meny hade kostat i varje laddning.
--
-- Den avvägningen gäller inte här. Det här är ett ansikte, inte en tallrik.
-- Bilden visas bara för gästen själv, laddas en gång per sidvisning, och en
-- publik bucket hade betytt att URL:en fungerar för vem som helst för alltid —
-- också efter att gästen bytt bild. Kostnaden för en signering är en
-- försumlig sak att betala för det.
--
-- Sökvägen är `{user_id}/{uuid}.{ext}`. Första mappnivån är gästens eget id,
-- och det är den policyerna jämför mot `auth.uid()`.

alter table public.profiles
  add column avatar_path text;

comment on column public.profiles.avatar_path is
  'Sökväg i den PRIVATA bucketen guest-avatars, inte en URL. Adressen signeras vid visning och går ut — en publik pekare hade fungerat för vem som helst för alltid. NULL = ingen bild.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guest-avatars',
  'guest-avatars',
  false,
  5242880,  -- 5 MB. En profilbild behöver inte mer, och en telefonbild ryms.
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Var och en når bara sin egen mapp ───────────────────────────────────────
--
-- Fyra policyer och inte en `for all`: det var precis den genvägen som gjorde
-- att en restaurang kunde godkänna sin egen bild (migration 0063). Här spelar
-- det mindre roll — det finns ingen status att sätta — men mönstret ska vara
-- detsamma överallt, annars är det ingen regel.

create policy "gästen ser sin egen bild"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'guest-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gästen laddar upp sin egen bild"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'guest-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gästen raderar sin egen bild"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'guest-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

/*
 * Ingen UPDATE-policy, av samma skäl som dokumenten i 0064 saknar en: en bild
 * byts genom att den gamla tas bort och en ny laddas upp på en ny sökväg. Det
 * gör dessutom den gamla signerade adressen värdelös direkt, vilket är precis
 * vad man vill när någon byter sitt ansikte mot ett annat.
 */
