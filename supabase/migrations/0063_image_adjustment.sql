-- 0063 — Bildjustering, och grinden som skulle ha funnits sedan 0017.
--
-- Två saker i samma migration därför att de rör samma rad och samma trigger.
-- Den andra hittades när den första skulle byggas.
--
-- ══ DEL 1: RESTAURANGEN KUNDE GODKÄNNA SIN EGEN BILD ════════════════════════
--
-- Kommentaren i 0017 säger:
--
--   "Statusen sätts av kolumnens default (PENDING) och kan inte ändras av
--    restaurangen själv — media_moderate_platform i migration 0015 är den
--    enda vägen till APPROVED."
--
-- Det stämde inte. `media_write_staff` (0009_rls.sql) är `for all` och prövar
-- bara rollen, aldrig VAD som ändras. Policyer är dessutom tillåtande och OR:as
-- ihop, så plattformens egen policy begränsar ingenting. En ägare kunde alltså
-- skriva `status = 'APPROVED'` på sin egen rad, och `media_publish_on_approval`
-- publicerade lydigt bilden på en indexerad sida.
--
-- Bevisat i den lokala stacken 2026-09-01 som `agare@burp.test`, aal1:
--
--   insert … status 'PENDING'          → PENDING
--   update … set status = 'APPROVED'   → APPROVED          (skulle ha nekats)
--   select hero_image_url …            → /storage/v1/…/rls-prov.jpg
--
-- Hela granskningskön var alltså frivillig för den som anropar PostgREST
-- direkt. Menyvyn är klientkod; den som går förbi den har aldrig sett knappen.
--
-- ── Varför en trigger och inte en policy ────────────────────────────────────
--
-- RLS kan inte jämföra gammalt och nytt värde. `with check` ser bara den nya
-- raden, och en ny rad med status APPROVED är omöjlig att skilja från en rad
-- som redan var godkänd. Regeln är "status FÅR INTE ÄNDRAS av restaurangen",
-- och den frågan kan bara en trigger svara på.

create or replace function public.media_status_is_platforms_alone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
  then
    -- `auth.uid()` är null när ingen session finns: service role, ett
    -- bakgrundsjobb eller en migration. Rollen `anon` kommer inte hit —
    -- den har bara SELECT på tabellen (0012).
    if auth.uid() is not null and not public.is_platform_admin() then
      raise exception
        'Bildens status avgörs av Burps granskning, inte av restaurangen.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.media_status_is_platforms_alone is
  'Hindrar en restaurang från att godkänna sin egen media. RLS räcker inte: en policy ser bara den nya raden och kan inte se att status ändrades.';

create trigger media_status_guard
  before update on public.media
  for each row execute function public.media_status_is_platforms_alone();

-- ══ DEL 2: BILDJUSTERING ════════════════════════════════════════════════════
--
-- Restaurangen fotograferar med telefon. Bilderna blir mörka, sneda och
-- ojämna, och `object-cover` centrerad kapar toppen av en hög tallrik.
--
-- Det som INTE byggs, med flit: namngivna filter. Ett filter konkurrerar med
-- maten, och femton restauranger med var sitt filter gör startsidans rutnät
-- spretigt — det rutnätet är Burps yta, inte restaurangens. Det som byggs är
-- de justeringar som gör en dålig bild rättvis, inte annorlunda:
--
--   fokuspunkt   vad i bilden som ska överleva beskärningen
--   ljusstyrka   en mörk bild blir läsbar
--   kontrast     en platt bild får djup
--   mättnad      en blek bild får färg tillbaka
--
-- Gränserna 85–115 är inte kosmetik. Inom dem kan en bild inte bli en annan
-- bild, och därför behöver en ändrad justering inte gå genom granskningen igen.
-- Det är hela skälet till att de är snäva.
--
-- Mättnad och inte värme: värme förskjuter färgen, och en gäst som får mat som
-- inte ser ut som bilden är ett riktigt problem, inte ett estetiskt. Mättnad
-- kan göra en blek bild rättvis utan att flytta en enda nyans.

alter table public.media
  add column focal_x    smallint not null default 50
    check (focal_x between 0 and 100),
  add column focal_y    smallint not null default 50
    check (focal_y between 0 and 100),
  add column brightness smallint not null default 100
    check (brightness between 85 and 115),
  add column contrast   smallint not null default 100
    check (contrast between 85 and 115),
  add column saturation smallint not null default 100
    check (saturation between 85 and 115);

comment on column public.media.focal_x is
  'Vågrät fokuspunkt i procent av bildbredden. 50 = mitten. Blir object-position vid beskärning.';
comment on column public.media.brightness is
  'Ljusstyrka i procent, 85–115. Gränserna gör att en justerad bild inte kan bli en annan bild — därför krävs ingen ny granskning när den ändras.';

-- ── Justeringen måste följa med pekaren ─────────────────────────────────────
--
-- Gästytorna läser aldrig `media`. De läser `menu_items.image_url` och
-- `restaurants.hero_image_url` — en ren textpekare som triggern i 0017 skriver
-- vid godkännandet. Sex läsställen gör det så: menyn, upptäcktslistan,
-- rutterna, restaurangsidan och två dashboardsidor.
--
-- Justeringen läggs därför bredvid pekaren, av samma trigger, som en kopia med
-- exakt samma livslängd. Det är samma avvägning som redan gjordes för själva
-- pekaren: sanningen står i `media`, kopian är det gästen läser. Alternativet
-- vore en join mot `media` i alla sex läsvägarna, för fem heltal.

alter table public.menu_items  add column image_adjust  jsonb;
alter table public.restaurants add column hero_adjust   jsonb,
                               add column banner_adjust jsonb;

-- Logotypen får ingen justeringskolumn. Den är en designad tillgång, inte ett
-- telefonfoto: att dra i ljusstyrkan på ett märke är meningslöst, och en
-- kolumn som skrivs men aldrig läses är precis den sortens skal som den här
-- migrationen i övrigt tar bort.

comment on column public.menu_items.image_adjust is
  'Kopia av bildjusteringen från media-raden, skriven av publish_approved_media(). NULL = orörd bild. Sanningen står i media; det här är vad gästytorna läser.';

-- NULL när ingenting är justerat. Det gör "orörd" till frånvaro av data
-- i stället för fem värden som råkar vara standard.
create or replace function public.media_adjust_json(m public.media)
returns jsonb
language sql
immutable
as $$
  select case
    when m.focal_x = 50 and m.focal_y = 50
     and m.brightness = 100 and m.contrast = 100 and m.saturation = 100
    then null
    else jsonb_build_object(
      'focal_x', m.focal_x, 'focal_y', m.focal_y,
      'brightness', m.brightness, 'contrast', m.contrast, 'saturation', m.saturation
    )
  end;
$$;

comment on function public.media_adjust_json is
  'Bildjusteringen som jsonb, eller NULL när ingenting avviker från standard.';

-- ── Publiceringen bär nu två värden i stället för ett ───────────────────────
--
-- I övrigt oförändrad från 0053. Varje gren som skriver en pekare skriver
-- justeringen bredvid, och varje gren som nollställer nollställer båda — en
-- justering kvar efter en tillbakadragen bild vore ett spöke som ingen ser
-- förrän nästa bild godkänns och ser fel ut.

create or replace function public.publish_approved_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_adjust jsonb;
begin
  if new.status = old.status then
    return new;
  end if;

  v_url := case
    when new.kind = 'VIDEO' then new.playback_url
    else '/storage/v1/object/public/menu-media/' || new.storage_path
  end;

  v_adjust := public.media_adjust_json(new);

  if new.status = 'APPROVED' then
    if new.menu_item_id is not null then
      update public.menu_items
        set image_url = v_url, image_adjust = v_adjust
      where id = new.menu_item_id;
    elsif new.purpose = 'LOGO' then
      update public.restaurants
        set logo_url = v_url
      where id = new.restaurant_id;
    elsif new.purpose = 'BANNER' then
      update public.restaurants
        set banner_url = v_url, banner_adjust = v_adjust
      where id = new.restaurant_id;
    elsif new.is_primary then
      update public.restaurants
        set hero_image_url = v_url, hero_adjust = v_adjust
      where id = new.restaurant_id;
    end if;

  elsif old.status = 'APPROVED' then
    if new.menu_item_id is not null then
      update public.menu_items set image_url = null, image_adjust = null
      where id = new.menu_item_id and image_url = v_url;
    elsif new.purpose = 'LOGO' then
      update public.restaurants set logo_url = null
      where id = new.restaurant_id and logo_url = v_url;
    elsif new.purpose = 'BANNER' then
      update public.restaurants set banner_url = null, banner_adjust = null
      where id = new.restaurant_id and banner_url = v_url;
    elsif new.is_primary then
      update public.restaurants set hero_image_url = null, hero_adjust = null
      where id = new.restaurant_id and hero_image_url = v_url;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.publish_approved_media is
  'Skriver den publika bildpekaren OCH bildjusteringen när media godkänns, och rensar båda om godkännandet dras tillbaka. Menyrad, logotyp, banner eller huvudbild — purpose avgör vilken kolumn.';

-- ── En justering som ändras efter godkännandet ──────────────────────────────
--
-- Publiceringstriggern lyssnar bara på `status`. Utan den här skulle en ägare
-- kunna dra i reglaget hur mycket som helst efter att bilden godkänts, och
-- ingenting hända på sidan — reglaget hade sett trasigt ut trots att värdet
-- sparades. Det är precis den sortens halva koppling som gör en tabell till
-- ett skal.
--
-- Villkoret `image_url = v_url` är samma som vid tillbakadragning: en äldre
-- bilds justering får inte skriva över den nyare bild som faktiskt visas.

create or replace function public.sync_media_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_adjust jsonb;
begin
  if new.status <> 'APPROVED' then
    return new;
  end if;

  v_url := case
    when new.kind = 'VIDEO' then new.playback_url
    else '/storage/v1/object/public/menu-media/' || new.storage_path
  end;

  v_adjust := public.media_adjust_json(new);

  if new.menu_item_id is not null then
    update public.menu_items set image_adjust = v_adjust
    where id = new.menu_item_id and image_url = v_url;
  elsif new.purpose = 'LOGO' then
    -- Logotypen har ingen justering att synka.
    return new;
  elsif new.purpose = 'BANNER' then
    update public.restaurants set banner_adjust = v_adjust
    where id = new.restaurant_id and banner_url = v_url;
  elsif new.is_primary then
    update public.restaurants set hero_adjust = v_adjust
    where id = new.restaurant_id and hero_image_url = v_url;
  end if;

  return new;
end;
$$;

comment on function public.sync_media_adjustment is
  'Låter en ändrad bildjustering slå igenom på en redan godkänd bild, utan ny granskning. Gränserna 85–115 är det som gör att den inte behövs.';

create trigger media_adjustment_sync
  after update of focal_x, focal_y, brightness, contrast, saturation
  on public.media
  for each row execute function public.sync_media_adjustment();
