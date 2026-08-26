-- 0054 — Bordsbokning.
--
-- Restaurangsidan har redan öppettider, borden har zon, platsantal och
-- koordinater i planritningen, och `country_time_zone()` finns sedan migration
-- 0033. Det som saknades var tiden.
--
-- ── Dubbelbokningen får inte lösas i applikationskoden ──────────────────────
--
-- "Är tiden ledig?" följt av "boka den" är två frågor, och mellan dem hinner en
-- andra gäst ställa samma första fråga och få samma svar. Klockan sju en fredag
-- är det inte ett sällsynt sammanträffande utan det normala fallet.
--
-- Postgres löser det med ett `exclude`-villkor över `tstzrange`: två
-- överlappande bokningar på samma bord är omöjliga att SKRIVA, oavsett vem som
-- försöker och genom vilken väg. Samma sorts regel som triggern på
-- `order_events`, och av samma skäl — den hör till datan och inte till den som
-- råkar skriva.
--
-- Villkoret är partiellt: avbokade och uteblivna bokningar blockerar
-- ingenting. Utan `where` hade en avbokad tid varit upptagen för alltid.
--
-- ── Lediga tider räknas på ett enda ställe ──────────────────────────────────
--
-- `reservation_slots()` nedan är den enda uträkningen av vad som är ledigt. Två
-- uträkningar glider isär, och då visar sidan en tid som bokningen sedan nekar.
-- Öppettiderna har redan gjort den resan en gång: `open_restaurant_ids`
-- (migration 0025) finns just därför att listan och beställningen inte fick
-- svara olika på om restaurangen var öppen.
--
-- ── Karensen är räknad, inte skriven ────────────────────────────────────────
--
-- Ett bord som bokats till 19:00 och står tomt 19:15 ska gå att sätta någon
-- annan vid. Regeln är RÄKNAD i `reservation_slots()` och inte satt av ett
-- bakgrundsjobb: ett jobb som ligger nere lämnar bord låsta hela kvällen, och
-- ett jobb som körs för ofta är en kostnad utan motsvarande nytta. Raden står
-- kvar som BOOKED tills personalen säger något annat — den är historik, och
-- historik skrivs inte om av en klocka.

create extension if not exists "btree_gist";  -- exclude-villkor över uuid + range

create type public.reservation_status as enum (
  'BOOKED',      -- bekräftad, gästen har inte kommit än
  'SEATED',      -- gästen sitter vid bordet
  'COMPLETED',   -- besöket är slut
  'CANCELLED',   -- avbokad, av gästen eller restaurangen
  'NO_SHOW'      -- kom aldrig, och personalen har registrerat det
);

-- ── Bordens egenskaper ──────────────────────────────────────────────────────
--
-- "Ett bord med utsikt" är det gästen vill boka, och det är också det som får
-- kosta något. Egenskaperna är en fast lista och inte fritext: de ÖVERSÄTTS i
-- gränssnittet, till skillnad från restaurangens egna texter, och en fritext
-- hade betytt att "prozor", "Fenster" och "fönster" är tre olika bord.
--
-- Tillägget fryses på bokningen när den skapas. Restaurangen ska kunna höja
-- priset utan att en bokning från i förra veckan ändrar sig.

alter table public.tables
  add column attributes text[] not null default '{}',
  add column surcharge_ore integer not null default 0 check (surcharge_ore >= 0),
  add constraint tables_attributes_known check (
    attributes <@ array['VIEW', 'WINDOW', 'OUTDOOR', 'QUIET', 'BOOTH', 'ACCESSIBLE']::text[]
  );

comment on column public.tables.attributes is
  'Bordets egenskaper ur en fast lista. Översätts i gränssnittet — därför en lista och inte fritext.';

comment on column public.tables.surcharge_ore is
  'Vad bordet kostar extra att boka, i valutans minsta enhet. Läggs på NOTAN i restaurangen; Burp tar aldrig emot beloppet, och det ingår inte i avgiftsunderlaget.';

-- Sammansatt nyckel så att en bokning kan bindas till både bord och restaurang
-- i samma främmande nyckel. `id` är redan primärnyckel, så den kostar inget.
alter table public.tables
  add constraint tables_id_restaurant_key unique (id, restaurant_id);

-- ── Restaurangens bokningsregler ────────────────────────────────────────────
--
-- Samma form som `order_policy` (migration 0002): en jsonb med snake_case, läst
-- och skriven av `parseReservationPolicy()` i @burp/core.
--
-- `enabled` är FALSKT som standard. En restaurang som inte bett om bokning ska
-- inte plötsligt ta emot den, och tomma bord klockan sju för gäster som aldrig
-- dök upp är ett dyrare misstag än en knapp som saknas.

alter table public.restaurants
  add column reservation_policy jsonb not null default jsonb_build_object(
    'enabled', false,
    'duration_minutes', 90,
    'grace_minutes', 15,
    'lead_minutes', 60,
    'horizon_days', 30,
    'max_party_size', 12
  );

comment on column public.restaurants.reservation_policy is
  'Bokningsreglerna. Tvillingen till parseReservationPolicy() i @burp/core — ändras formen här måste den ändras där.';

-- ── Bokningarna ─────────────────────────────────────────────────────────────

create table public.reservations (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  table_id       uuid not null,

  /*
   * Gästen behöver inget konto.
   *
   * Samma löfte som QR-beställningen: utan app, utan konto. `guest_id` sätts
   * när en inloggad gäst bokar, så att bokningen syns under /konto — men den
   * är null för de flesta, och namnet och telefonnumret är det restaurangen
   * faktiskt behöver.
   */
  guest_id       uuid references auth.users(id) on delete set null,
  guest_name     text not null check (length(btrim(guest_name)) between 1 and 120),
  guest_phone    text,
  guest_email    text,

  party_size     smallint not null check (party_size between 1 and 50),

  /*
   * Tiden som ett intervall och inte som två kolumner.
   *
   * `exclude`-villkoret nedan behöver ett range att jämföra med `&&`, och två
   * kolumner hade krävt en check som räknar ut samma sak en gång till. Starten
   * läses med `lower(during)`.
   */
  during         tstzrange not null,

  status         public.reservation_status not null default 'BOOKED',

  -- Fryst vid bokningen. Restaurangen får höja priset utan att gamla bokningar
  -- ändrar sig — samma princip som valutan på en order (migration 0020).
  surcharge_ore  integer not null default 0 check (surcharge_ore >= 0),

  -- Gästens egen anteckning: "barnstol", "allergi", "födelsedag".
  note           text check (note is null or length(note) <= 500),

  /*
   * Avbokningsnyckeln.
   *
   * En gäst utan konto måste kunna avboka, och det får inte gå att avboka
   * någon ANNANS bord genom att gissa ett id. Nyckeln skickas i länken och är
   * det enda som bevisar att bokningen är gästens.
   */
  cancel_token   uuid not null default gen_random_uuid(),

  seated_at      timestamptz,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint reservations_table_fk
    foreign key (table_id, restaurant_id)
    references public.tables(id, restaurant_id) on delete cascade,

  -- Ett intervall som slutar innan det börjar är inte en bokning.
  constraint reservations_during_valid check (not isempty(during) and lower(during) < upper(during))
);

-- HÄR ligger spärren. Två överlappande bokningar på samma bord går inte att
-- skriva, oavsett vem som försöker eller genom vilken väg.
alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (table_id with =, during with &&)
  where (status in ('BOOKED', 'SEATED'));

create index reservations_restaurant_time_idx
  on public.reservations (restaurant_id, during);

create index reservations_guest_idx on public.reservations (guest_id)
  where guest_id is not null;

comment on table public.reservations is
  'Bordsbokningar. Dubbelbokning spärras av exclude-villkoret reservations_no_overlap och aldrig av applikationskoden — "är tiden ledig?" och "boka den" är två frågor, och mellan dem hinner en andra gäst.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Ny tabell = ny policy, alltid (regel 4).
--
-- INGEN insert-policy. Bokningen skapas av `create_reservation()` som service
-- role, av exakt samma skäl som QR-ordern: gästen är anonym och har ingen
-- `auth.uid()` att skriva en policy mot. En insert-policy hade dessutom låtit
-- vem som helst skriva vilken tid som helst förbi alla kontroller i funktionen.

alter table public.reservations enable row level security;

-- Personalen ser och sköter sin egen restaurangs bokningar. Köket också: en
-- kock som ser att det kommer tolv personer 19:00 kan förbereda därefter.
create policy reservations_select_staff on public.reservations
  for select to authenticated using (public.is_staff_of(restaurant_id));

create policy reservations_update_staff on public.reservations
  for update to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager', 'staff']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager', 'staff']::public.staff_role[]));

-- Den inloggade gästen ser sina egna bokningar under /konto.
create policy reservations_select_own on public.reservations
  for select to authenticated using (guest_id = auth.uid());

grant select on public.reservations to authenticated;
grant update on public.reservations to authenticated;
grant all on public.reservations to service_role;

-- ── Lediga tider ────────────────────────────────────────────────────────────
--
-- Den enda uträkningen av vad som är ledigt. Både bokningssidan och
-- `create_reservation()` går genom den; en andra uträkning i TypeScript hade
-- garanterat glidit isär.
--
-- Kvartar, som resten av produkten (`ceilToSlot` i @burp/core).

create or replace function public.reservation_slots(
  p_restaurant_id uuid,
  p_date          date,
  p_party_size    smallint
)
returns table (
  slot_at        timestamptz,
  table_id       uuid,
  table_number   text,
  zone           text,
  capacity       smallint,
  attributes     text[],
  surcharge_ore  integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_zone      text;
  v_policy    jsonb;
  v_duration  integer;
  v_grace     integer;
  v_lead      integer;
  v_horizon   integer;
  v_max_party integer;
begin
  select public.country_time_zone(r.country), r.reservation_policy
    into v_zone, v_policy
  from public.restaurants r
  where r.id = p_restaurant_id and r.status = 'ACTIVE';

  if v_zone is null or coalesce((v_policy->>'enabled')::boolean, false) = false then
    return;
  end if;

  v_duration  := coalesce((v_policy->>'duration_minutes')::integer, 90);
  v_grace     := coalesce((v_policy->>'grace_minutes')::integer, 15);
  v_lead      := coalesce((v_policy->>'lead_minutes')::integer, 60);
  v_horizon   := coalesce((v_policy->>'horizon_days')::integer, 30);
  v_max_party := coalesce((v_policy->>'max_party_size')::integer, 12);

  if p_party_size < 1 or p_party_size > v_max_party then
    return;
  end if;

  -- Utanför horisonten finns inga tider. Att erbjuda ett bord i mars är att
  -- lova något ingen kan hålla.
  if p_date > (now() at time zone v_zone)::date + v_horizon then
    return;
  end if;

  return query
  with candidates as (
    /*
     * Dagens kvartar, uttryckta i RESTAURANGENS tidszon.
     *
     * `at time zone` går från lokal väggklocka till en absolut tidpunkt, och
     * det är hela skälet att uträkningen ligger här och inte i JavaScript:
     * sommartid, vintertid och den timme som inte finns sköter Postgres.
     */
    select (((p_date + time '00:00') + (n || ' minutes')::interval) at time zone v_zone) as at
    from generate_series(0, 24 * 60 - 15, 15) as n
  ),
  open_slots as (
    select c.at
    from candidates c
    where
      -- Framförhållningen. En bokning om tio minuter är ett telefonsamtal.
      c.at >= now() + (v_lead || ' minutes')::interval
      -- Restaurangen måste vara öppen både när gästen kommer och när hen går.
      and public.is_restaurant_open(p_restaurant_id, c.at)
      and public.is_restaurant_open(p_restaurant_id, c.at + (v_duration || ' minutes')::interval - interval '1 minute')
  )
  select
    o.at,
    t.id,
    t.table_number,
    t.zone,
    t.capacity,
    t.attributes,
    t.surcharge_ore
  from open_slots o
  join public.tables t
    on t.restaurant_id = p_restaurant_id
   and t.status = 'ACTIVE'
   and coalesce(t.capacity, 0) >= p_party_size
  where not exists (
    select 1
    from public.reservations res
    where res.table_id = t.id
      and res.status in ('BOOKED', 'SEATED')
      and res.during && tstzrange(o.at, o.at + (v_duration || ' minutes')::interval)
      /*
       * Karensen.
       *
       * En bokning som passerat sin karens utan att gästen satt sig håller
       * inte bordet längre. Raden står kvar — den är historik — men den
       * blockerar ingen ny gäst.
       */
      and not (
        res.status = 'BOOKED'
        and res.seated_at is null
        and now() > lower(res.during) + (v_grace || ' minutes')::interval
      )
  )
  -- Minsta bord som räcker först. Ett sällskap på två ska inte få långbordet
  -- så länge tvåbordet står ledigt — det är vad som gör att fredagen går ihop.
  order by o.at, t.capacity asc, t.surcharge_ore asc, t.table_number;
end;
$$;

comment on function public.reservation_slots is
  'Lediga bokningstider för ett datum. Den ENDA uträkningen av vad som är ledigt — bokningssidan och create_reservation() går genom samma funktion, annars visar sidan en tid som bokningen sedan nekar.';

-- Publik: gästen som bokar är inte inloggad. Funktionen lämnar inte ut något
-- som inte redan står på restaurangsidan, och särskilt inte `qr_public_id` —
-- det är den kolumnen som gör att `tables` aldrig får läsas av anon.
revoke execute on function public.reservation_slots(uuid, date, smallint) from public;
grant execute on function public.reservation_slots(uuid, date, smallint) to anon, authenticated, service_role;

-- ── Skapa en bokning ────────────────────────────────────────────────────────
--
-- Alla kontroller ligger här, i EN funktion, som service role anropar efter att
-- ha tagit emot formuläret. Klienten föreslår, servern avgör — samma modell som
-- `place_order`.

create or replace function public.create_reservation(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant uuid := (p_payload->>'restaurant_id')::uuid;
  v_table      uuid := (p_payload->>'table_id')::uuid;
  v_at         timestamptz := (p_payload->>'at')::timestamptz;
  v_party      smallint := (p_payload->>'party_size')::smallint;
  v_duration   integer;
  v_surcharge  integer;
  v_id         uuid;
  v_token      uuid;
begin
  /*
   * Tiden och bordet prövas mot samma funktion som visade dem.
   *
   * Det är hela poängen med att `reservation_slots()` finns: kontrollen här är
   * inte en andra uppsättning regler utan samma. Har tiden tagits av någon
   * annan sedan sidan laddades finns raden inte längre, och gästen får ett
   * begripligt fel i stället för ett constraint-brott.
   */
  select s.surcharge_ore into v_surcharge
  from public.reservation_slots(v_restaurant, (v_at at time zone public.country_time_zone(
         (select country from public.restaurants where id = v_restaurant)))::date, v_party) s
  where s.slot_at = v_at and s.table_id = v_table;

  if v_surcharge is null then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'check_violation';
  end if;

  select coalesce((reservation_policy->>'duration_minutes')::integer, 90)
    into v_duration
  from public.restaurants where id = v_restaurant;

  insert into public.reservations (
    restaurant_id, table_id, guest_id, guest_name, guest_phone, guest_email,
    party_size, during, surcharge_ore, note
  )
  values (
    v_restaurant,
    v_table,
    nullif(p_payload->>'guest_id', '')::uuid,
    p_payload->>'guest_name',
    nullif(p_payload->>'guest_phone', ''),
    nullif(p_payload->>'guest_email', ''),
    v_party,
    tstzrange(v_at, v_at + (v_duration || ' minutes')::interval),
    v_surcharge,
    nullif(p_payload->>'note', '')
  )
  returning id, cancel_token into v_id, v_token;

  return jsonb_build_object('reservation_id', v_id, 'cancel_token', v_token);

exception
  -- Kapplöpningen. Två gäster tryckte på samma tid inom samma sekund, och
  -- exclude-villkoret släppte igenom en av dem. Den andra ska få veta det.
  when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'check_violation';
end;
$$;

comment on function public.create_reservation is
  'Skapar en bokning efter att ha prövat tiden mot reservation_slots(). Anropas bara av service role — gästen är anonym och har ingen auth.uid() att skriva en policy mot, precis som i QR-flödet.';

-- Bara servern. En gäst som kunde anropa den direkt hade kunnat boka förbi
-- rate limitern och med vilket namn som helst.
revoke execute on function public.create_reservation(jsonb) from public, anon, authenticated;
grant execute on function public.create_reservation(jsonb) to service_role;

-- ── Avboka ──────────────────────────────────────────────────────────────────

create or replace function public.cancel_reservation(
  p_id    uuid,
  p_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.reservations
  set status = 'CANCELLED',
      cancelled_at = now(),
      updated_at = now()
  where id = p_id
    and cancel_token = p_token
    and status = 'BOOKED';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

comment on function public.cancel_reservation is
  'Avbokar med gästens egen nyckel. Nyckeln är det enda som bevisar att bokningen är hens — id:t ensamt hade låtit vem som helst avboka någon annans bord.';

revoke execute on function public.cancel_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_reservation(uuid, uuid) to service_role;

-- ── Bokningar rör aldrig historiken ─────────────────────────────────────────
--
-- Personalen får ändra status, sätta gästen vid bordet och registrera att hen
-- inte kom. Den får INTE flytta tiden eller byta bord i efterhand: en bokning
-- som ändrar sig efter att gästen fått sin bekräftelse är en bokning gästen
-- inte längre har. Ombokning görs som en ny bokning och en avbokning.

create or replace function public.restrict_reservation_update()
returns trigger
language plpgsql
as $$
begin
  if new.during <> old.during
     or new.table_id <> old.table_id
     or new.restaurant_id <> old.restaurant_id
     or new.cancel_token <> old.cancel_token
     or new.surcharge_ore <> old.surcharge_ore then
    raise exception 'En bokning bokas om genom en ny bokning, inte genom att skriva om den gamla';
  end if;

  new.updated_at := now();

  -- Tidpunkten sätts av triggern och inte av den som skriver, av samma skäl som
  -- svaret på ett omdöme: raden ska bära rätt tid även när den skrivs på något
  -- annat sätt.
  if new.status = 'SEATED' and old.status <> 'SEATED' then
    new.seated_at := coalesce(new.seated_at, now());
  end if;

  if new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  return new;
end;
$$;

create trigger reservations_restrict_update
  before update on public.reservations
  for each row execute function public.restrict_reservation_update();
