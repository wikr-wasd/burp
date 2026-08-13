-- 0011 — Realtid för köksskärmen och gästens statusvy (avsnitt 2, 11).
--
-- Supabase Realtime skickar bara ändringar för tabeller som ligger i
-- publikationen `supabase_realtime`. Utan det här steget prenumererar
-- köksskärmen på en kanal som aldrig säger något, och felet syns inte —
-- den bara står tyst medan orderna trillar in.

do $$
begin
  -- Publikationen skapas av Supabase. Kör schemat mot en vanlig PostgreSQL
  -- (scripts/verify-schema.sh) finns den inte, och då ska migrationen inte
  -- krascha — realtid är en Supabase-funktion, inte en del av datamodellen.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- OBS: mot en vanlig PostgreSQL varnar detta med
--   WARNING: "wal_level" is insufficient to publish logical changes
-- Det är förväntat och inte ett fel. Supabase kör wal_level = logical;
-- scripts/verify-schema.sh gör det inte, och behöver inte göra det —
-- publikationen skapas ändå och migrationen går igenom.

-- Köksskärmen lyssnar på statusändringar. `order_items` behövs för att en ny
-- order ska kunna visas med sitt innehåll utan en extra rundtur.
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;

-- Bordssessioner: dashboarden visar vilka bord som är aktiva just nu.
alter publication supabase_realtime add table public.table_sessions;

/*
 * REPLICA IDENTITY FULL på orders.
 *
 * Standard är att bara primärnyckeln följer med i en UPDATE-händelse. Köket
 * behöver veta vad statusen ändrades FRÅN för att kunna avgöra om en order är
 * ny eller bara flyttad ett steg — och gästens vy behöver hela raden.
 *
 * Kostar mer WAL per uppdatering. På ordertabellen är det försumbart; gör det
 * inte på en tabell med hög skrivvolym.
 */
alter table public.orders replica identity full;

comment on publication supabase_realtime is
  'Tabeller som skickar ändringar via Supabase Realtime. Ny tabell här = ny lyssnare någonstans i klienten, aldrig tvärtom.';
