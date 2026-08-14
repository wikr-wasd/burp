-- 0017 — Lagring för menybilder och moderering som faktiskt publicerar (avsnitt 8).
--
-- Granskningskön i backoffice fanns sedan migration 0015, men ingenting matade
-- den: det gick inte att ladda upp en bild alls. Och ett godkännande hade inte
-- gjort någon skillnad, eftersom det som visas för gästen läses ur
-- `menu_items.image_url` och `restaurants.hero_image_url` — inte ur `media`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-media',
  'menu-media',
  -- Publik läsning. Modereringen avgör vad som VISAS på Burp, inte vad som går
  -- att nå med en gissad URL — och sökvägarna innehåller ett slumpat uuid, så
  -- de går inte att gissa. En privat bucket med signerade URL:er hade varit
  -- strängare men kostat en signering per bild i varje meny, varje laddning.
  true,
  10485760,  -- 10 MB. En telefonbild ryms; en oredigerad systemkamerabild gör det inte.
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
 * Sökvägskonvention: {restaurant_id}/{uuid}.{ext}
 *
 * Första mappnivån är restaurangens id. Policyerna nedan jämför den mot
 * `staff`, vilket är det som hindrar en restaurang från att skriva i en annans
 * mapp — eller att skriva över en annans bild.
 */

create policy "menu-media läsbar för alla"
  on storage.objects for select
  using (bucket_id = 'menu-media');

create policy "personal laddar upp till sin egen restaurang"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-media'
    and public.has_role_at(
      (storage.foldername(name))[1]::uuid,
      array['owner', 'manager']::public.staff_role[]
    )
  );

create policy "personal ersätter sina egna bilder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'menu-media'
    and public.has_role_at(
      (storage.foldername(name))[1]::uuid,
      array['owner', 'manager']::public.staff_role[]
    )
  );

create policy "personal raderar sina egna bilder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-media'
    and public.has_role_at(
      (storage.foldername(name))[1]::uuid,
      array['owner', 'manager']::public.staff_role[]
    )
  );

-- Personal får skapa medieposter för sin egen restaurang. Statusen sätts av
-- kolumnens default (PENDING) och kan inte ändras av restaurangen själv —
-- media_moderate_platform i migration 0015 är den enda vägen till APPROVED.
create policy media_insert_staff on public.media
  for insert to authenticated
  with check (
    public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
    and status = 'PENDING'
  );

/*
 * Ett godkännande ska synas.
 *
 * Utan den här triggern är moderering en administrativ handling utan effekt:
 * knappen sätter status till APPROVED och gästen ser fortfarande ingen bild.
 * Nu skrivs den publika pekaren när — och bara när — media godkänns.
 *
 * Vid avvisande nollställs pekaren igen. En bild som först godkänts och sedan
 * dragits tillbaka ska försvinna från menyn, inte ligga kvar för att den råkade
 * hinna publiceras.
 */
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

  -- Bygger den publika URL:en ur lagringsvägen. Bucketen är publik, så formen
  -- är stabil och behöver ingen signering.
  v_url := case
    when new.kind = 'VIDEO' then new.playback_url
    else '/storage/v1/object/public/menu-media/' || new.storage_path
  end;

  if new.status = 'APPROVED' then
    if new.menu_item_id is not null then
      update public.menu_items set image_url = v_url where id = new.menu_item_id;
    elsif new.is_primary then
      update public.restaurants set hero_image_url = v_url where id = new.restaurant_id;
    end if;

  elsif old.status = 'APPROVED' then
    -- Drogs tillbaka. Rensa bara om pekaren fortfarande är just den här bilden;
    -- en nyare godkänd bild ska inte raderas av att en äldre avvisas.
    if new.menu_item_id is not null then
      update public.menu_items set image_url = null
      where id = new.menu_item_id and image_url = v_url;
    elsif new.is_primary then
      update public.restaurants set hero_image_url = null
      where id = new.restaurant_id and hero_image_url = v_url;
    end if;
  end if;

  return new;
end;
$$;

create trigger media_publish_on_approval
  after update of status on public.media
  for each row execute function public.publish_approved_media();

comment on function public.publish_approved_media is
  'Skriver den publika bildpekaren när media godkänns och rensar den om godkännandet dras tillbaka. Utan den vore moderering en handling utan effekt.';

-- Backoffice sorterar kön på ålder och filtrerar på status. Utan index blir
-- det en full scan varje gång någon öppnar granskningsvyn.
create index if not exists media_status_created_idx
  on public.media (status, created_at);
