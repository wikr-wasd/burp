-- 0004 — Bord, QR-koder och bordssessioner (avsnitt 4).
--
-- Det här är den del som skiljer Burp från en vanlig matapp: en gäst ska kunna
-- skanna en dekal och beställa utan app, utan konto och utan att tänka på
-- tekniken.

create table public.tables (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  location_id    uuid references public.locations(id) on delete set null,

  table_number   text not null,
  zone           text,                 -- "Uteservering", "Baren", "Övervåningen"
  capacity       smallint check (capacity > 0),

  -- Den publika delen av QR-tokenet: 6 tecken ur Crockford Base32 utan I/L/O/U.
  -- Signaturen som följer med i URL:en lagras ALDRIG — den räknas fram med
  -- HMAC vid varje verifiering (packages/core/src/qr.ts). Skulle databasen
  -- läcka går det därför inte att tillverka giltiga koder ur innehållet.
  qr_public_id   text not null,

  status         public.table_status not null default 'ACTIVE',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint tables_qr_public_id_format check (qr_public_id ~ '^[0-9A-HJKMNP-TV-Z]{6}$')
);

-- Globalt unikt, inte per restaurang. Uppslaget sker enbart på tokenet —
-- URL:en innehåller ingen restaurangidentitet (avsnitt 4.1).
create unique index tables_qr_public_id_key on public.tables (qr_public_id);
create unique index tables_number_key on public.tables (restaurant_id, table_number)
  where status <> 'ARCHIVED';
create index tables_restaurant_idx on public.tables (restaurant_id, status);

create trigger tables_touch before update on public.tables
  for each row execute function public.touch_updated_at();

comment on column public.tables.qr_public_id is
  'Publik del av QR-tokenet. Statisk — koden trycks på en dekal och byts aldrig. Signaturen lagras inte, den härleds med HMAC ur QR_TOKEN_SECRET.';

-- ── table_sessions ──────────────────────────────────────────────────────────
-- En pågående nota vid ett bord. Flera gäster kan lägga till på samma nota
-- genom att skanna samma kod (avsnitt 4.3).

create table public.table_sessions (
  id             uuid primary key default gen_random_uuid(),
  table_id       uuid not null references public.tables(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  status         public.table_session_status not null default 'OPEN',
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  closed_by      uuid references auth.users(id) on delete set null,

  -- Antal gäster, om personalen registrerar det. Ger omsättning per gäst.
  guest_count    smallint check (guest_count > 0),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Ett bord kan bara ha EN öppen nota åt gången. Utan detta index skulle två
-- gäster som skannar samtidigt kunna skapa var sin session och dela upp notan
-- utan att någon märkte det.
create unique index table_sessions_one_open_per_table
  on public.table_sessions (table_id)
  where status = 'OPEN';

create index table_sessions_restaurant_idx
  on public.table_sessions (restaurant_id, status, opened_at desc);

create trigger table_sessions_touch before update on public.table_sessions
  for each row execute function public.touch_updated_at();

-- ── Öppettidskontroll ───────────────────────────────────────────────────────
-- Ett bord får bara ta emot order när restaurangen är öppen (avsnitt 4.4).
-- Kontrollen ligger i databasen därför att den måste utgå från serverns klocka.
-- Gästens telefon får aldrig avgöra om restaurangen är öppen.

create or replace function public.is_restaurant_open(
  p_restaurant_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hours   jsonb;
  v_status  public.restaurant_status;
  v_local   timestamp;
  v_day     text;
  v_slot    jsonb;
begin
  select opening_hours, status into v_hours, v_status
  from public.restaurants
  where id = p_restaurant_id;

  if not found or v_status <> 'ACTIVE' then
    return false;
  end if;

  -- Öppettider är alltid lokala. En restaurang i Malmö öppnar 11:00 svensk tid,
  -- oavsett i vilken tidszon servern råkar stå.
  v_local := p_at at time zone 'Europe/Stockholm';

  v_day := lower(to_char(v_local, 'dy'));  -- 'mon', 'tue', ...

  for v_slot in select * from jsonb_array_elements(coalesce(v_hours->v_day, '[]'::jsonb))
  loop
    -- Pass som går över midnatt (22:00–02:00) hanteras inte här. De kräver att
    -- gårdagens pass också vägs in — läggs till när nattöppet blir aktuellt.
    if (v_slot->>'opens')::time <= v_local::time
       and (v_slot->>'closes')::time > v_local::time then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

comment on function public.is_restaurant_open is
  'Är restaurangen öppen just nu? Utgår från serverns klocka i Europe/Stockholm. Pass över midnatt stöds ännu inte.';
