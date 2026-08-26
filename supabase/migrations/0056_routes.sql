-- 0056 — Gästens egen matrunda.
--
-- "Vi äter förrätt i Baščaršija, huvudrätt vid Miljacka och baklava på vägen
-- hem." Det är en rutt, och den finns i dag bara i huvudet på den som planerar
-- den — eller i en anteckning som inte vet något om öppettider eller var
-- ställena ligger.
--
-- ── Vad detta INTE är ───────────────────────────────────────────────────────
--
-- Det här är gästens egen lista. Det är inte ett paket som Burp säljer.
-- Skillnaden är juridisk och inte teknisk: mat och upplevelse som säljs ihop av
-- en tredje part gränsar till paketreselagstiftning, och Kroatien är EU. Den
-- dagen någon vill sälja en rutt är det ett beslut för en jurist, inte en
-- kolumn till här. Se docs/BUSINESS.md.
--
-- ── Varför en egen tabell och inte favoriter med ordning ────────────────────
--
-- `favorites` svarar på "vilka ställen gillar jag". En rutt svarar på "vad ska
-- vi göra på lördag", och samma restaurang kan finnas i tre rutter utan att
-- vara favorit i någon av dem. Att lägga en ordningskolumn på favoriter hade
-- gjort båda frågorna sämre besvarade.

create table public.routes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  note        text check (note is null or length(note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index routes_user_idx on public.routes (user_id, updated_at desc);

comment on table public.routes is
  'Gästens egen matrunda: en ordnad lista över ställen. Kräver konto — till skillnad från QR-beställning och bokning, som aldrig gör det, är en sparad lista meningslös utan någon att spara den åt.';

create table public.route_stops (
  id             uuid primary key default gen_random_uuid(),
  route_id       uuid not null references public.routes(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  /*
   * Ordningen är gästens, inte en uträkning.
   *
   * Kortaste vägen mellan fem ställen är ett problem med en lösning; kvällen
   * gästen vill ha är det inte. Den som vill äta efterrätt sist ska få göra
   * det även när bageriet ligger närmast.
   */
  position       smallint not null check (position between 0 and 50),

  -- "Boka bord här" eller "bara kaffe". Gästens egen anteckning per stopp.
  note           text check (note is null or length(note) <= 300),

  created_at     timestamptz not null default now(),

  -- Samma ställe två gånger i samma rutt är nästan alltid ett dubbeltryck.
  constraint route_stops_unique unique (route_id, restaurant_id)
);

create index route_stops_route_idx on public.route_stops (route_id, position);

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Ny tabell = ny policy, alltid (regel 4).
--
-- Rutten är privat. Ingen restaurang ser att den ligger i någons planer, och
-- ingen annan gäst ser den heller — det finns ingen delningsfunktion, och en
-- policy som förberedde för en hade öppnat något som ingen bett om.

alter table public.routes enable row level security;
alter table public.route_stops enable row level security;

create policy routes_own on public.routes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/*
 * Stoppen ärver rättigheten från rutten.
 *
 * `exists`-frågan mot `routes` är det som binder dem. Utan den hade en policy
 * på `route_stops` behövt sitt eget `user_id`, vilket är samma uppgift lagrad
 * två gånger — och den dagen de två inte stämmer överens är det stoppet som
 * vinner.
 */
create policy route_stops_own on public.route_stops
  for all to authenticated
  using (
    exists (
      select 1 from public.routes r
      where r.id = route_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.routes r
      where r.id = route_id and r.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.routes to authenticated;
grant select, insert, update, delete on public.route_stops to authenticated;
grant all on public.routes to service_role;
grant all on public.route_stops to service_role;

-- Rutten ska visa när den senast ändrades, och ett stopp som läggs till är en
-- ändring av rutten även om raden ligger i en annan tabell.
create or replace function public.touch_route()
returns trigger
language plpgsql
as $$
begin
  update public.routes
  set updated_at = now()
  where id = coalesce(new.route_id, old.route_id);

  return coalesce(new, old);
end;
$$;

create trigger route_stops_touch_route
  after insert or update or delete on public.route_stops
  for each row execute function public.touch_route();
