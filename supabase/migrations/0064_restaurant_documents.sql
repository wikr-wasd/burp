-- 0064 — Dokument: allergenintyg, vinlista, cateringblad.
--
-- ── Vad det här INTE är ─────────────────────────────────────────────────────
--
-- Menyn blir aldrig en PDF. En PDF går inte att beställa ur, den är inte
-- sökbar, den översätts inte till de fem språken, och den skalar inte i en hand
-- vid ett bord. Hela QR-flödet bygger på att menyn är riktig data — det är
-- skillnaden mot en katalogsajt.
--
-- Det som saknas är något annat: de dokument en restaurang faktiskt har och som
-- inte är en meny. Allergenintyget från leverantören. Vinlistan som inte säljs
-- i appen. Cateringbladet. I dag finns ingen plats för dem alls.
--
-- ── Egen tabell och inte `media` ────────────────────────────────────────────
--
-- `media` bär `kind`, `is_primary`, `purpose`, `width`, `height`, `alt_text`
-- och en check-constraint som kräver en spelbar källa. Ingenting av det gäller
-- ett dokument, och att lägga till 'DOCUMENT' i `media_kind` hade betytt att
-- varje fråga mot media därefter måste komma ihåg att filtrera bort dem —
-- inklusive publiceringstriggern, som skriver bildpekare.
--
-- Det som DELAS är granskningen. Ett dokument ligger på en indexerad sida och
-- Burp står som värd, precis som för en bild. Samma enum, samma regel, samma
-- grind som migration 0063 satte på media.

create table public.restaurant_documents (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  -- Gästen ser titeln, inte filnamnet. "Vinlista 2026" läser bättre än
  -- "vinlista-final-v3-ny.pdf", och restaurangen väljer själv.
  title         text not null check (length(btrim(title)) between 1 and 120),

  -- Sökvägskonvention som för bilder: {restaurant_id}/{uuid}.pdf. Första
  -- mappnivån är det som storage-policyn jämför mot `staff`.
  storage_path  text not null unique,

  -- Storleken visas för gästen. En länk som tyst hämtar 18 MB på mobildata är
  -- inte en tjänst, och siffran kostar ingenting att spara vid uppladdningen.
  size_bytes    integer not null check (size_bytes > 0),

  status        public.media_status not null default 'PENDING',
  reviewed_at   timestamptz,
  reviewed_by   uuid references auth.users(id) on delete set null,
  rejection_reason text,

  sort_order    integer not null default 0,
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index restaurant_documents_restaurant_idx
  on public.restaurant_documents (restaurant_id, status, sort_order);

-- Granskningskön i backoffice sorterar på ålder, precis som media_status_created_idx.
create index restaurant_documents_pending_idx
  on public.restaurant_documents (created_at) where status = 'PENDING';

comment on table public.restaurant_documents is
  'Restaurangens egna dokument som PDF. Menyn är INTE ett dokument — den är data, och det är hela skillnaden mot en katalogsajt.';

create trigger restaurant_documents_touch
  before update on public.restaurant_documents
  for each row execute function public.touch_updated_at();

-- ── Samma grind som bilderna fick i 0063 ────────────────────────────────────
--
-- Utan den kan en restaurang godkänna sitt eget dokument och publicera vad som
-- helst på en indexerad sida under Burps domän. Det felet fanns i media från
-- 0017 till 0063; att bygga in det igen i en ny tabell hade varit att lära sig
-- ingenting.

create or replace function public.document_status_is_platforms_alone()
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
    if auth.uid() is not null and not public.is_platform_admin() then
      raise exception
        'Dokumentets status avgörs av Burps granskning, inte av restaurangen.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger restaurant_documents_status_guard
  before update on public.restaurant_documents
  for each row execute function public.document_status_is_platforms_alone();

-- ── RLS och GRANT. Regel 4: aldrig det ena utan det andra ───────────────────

alter table public.restaurant_documents enable row level security;

-- Gästen ser bara det som granskats.
create policy restaurant_documents_select_public on public.restaurant_documents
  for select to anon, authenticated using (status = 'APPROVED');

-- Personalen ser sina egna, även de som väntar. Annars ser en uppladdning ut
-- att ha försvunnit.
create policy restaurant_documents_select_staff on public.restaurant_documents
  for select to authenticated using (public.is_staff_of(restaurant_id));

create policy restaurant_documents_write_staff on public.restaurant_documents
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (
    public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

-- Plattformen granskar.
create policy restaurant_documents_platform on public.restaurant_documents
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

grant select on public.restaurant_documents to anon;
grant select, insert, update, delete on public.restaurant_documents to authenticated;
grant all on public.restaurant_documents to service_role;

-- ── Lagringen ───────────────────────────────────────────────────────────────
--
-- Egen bucket och inte `menu-media`: den bucketen släpper bara igenom
-- bildformat, och att öppna den för application/pdf hade betytt att en PDF kan
-- laddas upp där en bild förväntas.
--
-- Publik läsning, samma avvägning som 0017 gjorde för bilder: modereringen
-- avgör vad som VISAS på Burp, inte vad som går att nå med en gissad URL, och
-- sökvägen innehåller ett slumpat uuid.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-docs',
  'restaurant-docs',
  true,
  10485760,  -- 10 MB. Ett allergenintyg är några hundra kilobyte.
  array['application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "restaurant-docs läsbar för alla"
  on storage.objects for select
  using (bucket_id = 'restaurant-docs');

create policy "personal laddar upp dokument till sin egen restaurang"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'restaurant-docs'
    and public.has_role_at(
      (storage.foldername(name))[1]::uuid,
      array['owner', 'manager']::public.staff_role[]
    )
  );

create policy "personal raderar sina egna dokument"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'restaurant-docs'
    and public.has_role_at(
      (storage.foldername(name))[1]::uuid,
      array['owner', 'manager']::public.staff_role[]
    )
  );
