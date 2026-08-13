-- 0008 — Media: bilder och video (avsnitt 8).

create table public.media (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  -- Media hänger antingen på restaurangen eller på en enskild rätt, aldrig båda.
  menu_item_id   uuid references public.menu_items(id) on delete cascade,

  kind           public.media_kind not null,

  -- Bilder ligger i Supabase Storage. Video gör det INTE (avsnitt 8.2) —
  -- den ska till en videotjänst (Mux, Cloudflare Stream) som transkodar och
  -- strömmar adaptivt. `provider` + `provider_asset_id` pekar dit.
  storage_path      text,
  provider          text,
  provider_asset_id text,
  playback_url      text,

  -- Första bildrutan används som fallback medan videon laddar.
  poster_url     text,
  width          integer,
  height         integer,
  duration_ms    integer check (duration_ms is null or duration_ms > 0),
  alt_text       text,

  -- All media börjar som PENDING och syns inte förrän den godkänts
  -- (avsnitt 8.3). Automatisk kontroll först, manuell granskning i backoffice
  -- vid tveksamheter.
  status         public.media_status not null default 'PENDING',
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users(id) on delete set null,
  rejection_reason text,

  -- Restaurangen kan sätta en video som huvudbild för en rätt.
  is_primary     boolean not null default false,
  sort_order     integer not null default 0,

  uploaded_by    uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Video utan spelbar källa är meningslös; bild utan lagringsväg likaså.
  constraint media_source_present check (
    (kind = 'IMAGE' and storage_path is not null)
    or (kind = 'VIDEO' and (playback_url is not null or provider_asset_id is not null))
  )
);

create index media_restaurant_idx on public.media (restaurant_id, status);
create index media_menu_item_idx on public.media (menu_item_id, sort_order)
  where menu_item_id is not null;
create index media_pending_idx on public.media (created_at) where status = 'PENDING';

-- Bara en huvudbild per rätt.
create unique index media_one_primary_per_item on public.media (menu_item_id)
  where is_primary and menu_item_id is not null;

create trigger media_touch before update on public.media
  for each row execute function public.touch_updated_at();

comment on table public.media is
  'Bilder ligger i Supabase Storage. Video ska INTE göra det — den hör hemma i en videotjänst som transkodar och strömmar adaptivt (avsnitt 8.2).';
