-- 0053 — Restaurangens egen identitet: logotyp, banner och en accentfärg.
--
-- Restaurangen ska känna att sidan är dess egen. Den har hittills haft namn,
-- text och en huvudbild; det som saknas är märket och färgen.
--
-- ── En färg, inte ett tema ──────────────────────────────────────────────────
--
-- Burp följer 123Connect Design System och byggstenarna definieras EN gång i
-- globals.css. En restaurang som fick skriva egen CSS hade brutit det inom en
-- vecka, och nästa uppdatering av knappen hade slagit sönder femton sidor.
--
-- Därför en enda färg, som bär identitet och aldrig funktion: band, märken och
-- rubrikdetaljer. Handlingsrött förblir handlingsfärgen — primärknappen byter
-- inte färg för att någon valt turkos, av samma skäl som ingenting får
-- konkurrera med maten.
--
-- Kontrasten prövas i `checkAccentColor()` (@burp/core) innan färgen sparas,
-- mot BÅDA lägenas ytor. En färg som bara provats mot vitt kan vara osynlig i
-- mörkt läge, och det upptäcker ingen förrän en gäst med mörkt läge i
-- telefonen står vid bordet.
--
-- Kolumnen kontrollerar formen, inte läsbarheten: en check-constraint kan inte
-- räkna WCAG-luminans, och att lägga en halv beräkning i schemat hade gett två
-- svar på samma fråga. Formen hör hit, bedömningen till core.

alter table public.restaurants
  add column accent_hex text
    check (accent_hex is null or accent_hex ~ '^#[0-9a-f]{6}$'),
  add column logo_url   text,
  add column banner_url text;

comment on column public.restaurants.accent_hex is
  'Restaurangens accentfärg som #rrggbb i gemener. Läsbarheten prövas av checkAccentColor() i @burp/core innan den sparas — schemat kontrollerar bara formen. NULL = Burps egen palett gäller.';

comment on column public.restaurants.logo_url is
  'Publik pekare till godkänd logotyp. Sätts av publish_approved_media(), aldrig direkt — samma väg som hero_image_url.';

-- ── Logotyp och banner går genom granskningen ───────────────────────────────
--
-- En logotyp ligger på en indexerad sida. Att låta en restaurang publicera en
-- bild direkt hade gjort Burp till värd för vad som helst, utan att någon sett
-- det först — och media-granskningen finns redan (avsnitt 8.3).
--
-- `media` bär redan `restaurant_id` och `menu_item_id`. Det som saknas är VAD
-- en restaurangbild är: huvudbild, märke eller banner. `is_primary` räckte när
-- det bara fanns ett slag.

create type public.media_purpose as enum ('HERO', 'LOGO', 'BANNER');

alter table public.media
  add column purpose public.media_purpose not null default 'HERO';

comment on column public.media.purpose is
  'Vad restaurangbilden är. HERO är standard och behåller is_primary-regeln; LOGO och BANNER publiceras på sin egen kolumn i restaurants. Saknar betydelse för bilder som hör till en menyrad.';

-- Kön i backoffice ska kunna visa märken och banners för sig.
create index media_purpose_idx on public.media (restaurant_id, purpose)
  where menu_item_id is null;

-- ── Publiceringen får två fall till ─────────────────────────────────────────
--
-- Funktionen är i övrigt oförändrad från 0017. HERO-grenen behåller kravet på
-- `is_primary` med flit: den regeln gäller redan för befintliga rader, och att
-- ändra den här hade tyst publicerat bilder som en gång valts bort.

create or replace function public.publish_approved_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  if new.status = old.status then
    return new;
  end if;

  v_url := case
    when new.kind = 'VIDEO' then new.playback_url
    else '/storage/v1/object/public/menu-media/' || new.storage_path
  end;

  if new.status = 'APPROVED' then
    if new.menu_item_id is not null then
      update public.menu_items set image_url = v_url where id = new.menu_item_id;
    elsif new.purpose = 'LOGO' then
      update public.restaurants set logo_url = v_url where id = new.restaurant_id;
    elsif new.purpose = 'BANNER' then
      update public.restaurants set banner_url = v_url where id = new.restaurant_id;
    elsif new.is_primary then
      update public.restaurants set hero_image_url = v_url where id = new.restaurant_id;
    end if;

  elsif old.status = 'APPROVED' then
    -- Drogs tillbaka. Rensa bara om pekaren fortfarande är just den här bilden;
    -- en nyare godkänd bild ska inte raderas av att en äldre avvisas.
    if new.menu_item_id is not null then
      update public.menu_items set image_url = null
      where id = new.menu_item_id and image_url = v_url;
    elsif new.purpose = 'LOGO' then
      update public.restaurants set logo_url = null
      where id = new.restaurant_id and logo_url = v_url;
    elsif new.purpose = 'BANNER' then
      update public.restaurants set banner_url = null
      where id = new.restaurant_id and banner_url = v_url;
    elsif new.is_primary then
      update public.restaurants set hero_image_url = null
      where id = new.restaurant_id and hero_image_url = v_url;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.publish_approved_media is
  'Skriver den publika bildpekaren när media godkänns och rensar den om godkännandet dras tillbaka. Menyrad, logotyp, banner eller huvudbild — purpose avgör vilken kolumn. Utan den vore moderering en handling utan effekt.';
