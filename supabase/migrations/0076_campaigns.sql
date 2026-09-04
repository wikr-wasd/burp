-- 0076 — Utskick till gästerna, och paketen restaurangen betalar för.
--
-- Beställt 2026-09-01, formen avgjord 2026-09-04: "några mallar som jag kan
-- använda … och restaurangägare skall kunna betala mig för X antal utskick."
--
-- ── Vem ett utskick FÅR gå till ─────────────────────────────────────────────
--
-- Två villkor, båda nödvändiga, och de står i `campaign_audience()` nedan:
--
--   1. Gästen har SAGT JA. `profiles.marketing_opt_in`, migration 0002 och
--      0066. Standardvärdet är false och rutan är ett aktivt val.
--   2. Gästen har handlat HOS DEN HÄR RESTAURANGEN. Samtycket lämnades till
--      Burp, inte till varje restaurang på plattformen — ett utskick från ett
--      ställe gästen aldrig besökt är precis den spam som gör att nästa gäst
--      inte kryssar i rutan.
--
-- Villkor 2 är en produktregel och inte bara en juridisk. "Potentiella kunder"
-- går inte att nå den här vägen, och det är avsikten. Räckvidd mot nya gäster
-- är plattformens egen yta — placering, listor, notiser — inte andras inkorgar.
--
-- ── Saldot lagras aldrig ────────────────────────────────────────────────────
--
-- Samma regel som lojalitetspoängen (regel 7): saldot RÄKNAS ur sin logg.
-- `campaign_credits` är en summa över `campaign_credit_events`, aldrig en
-- kolumn någon skriver. Ett lagrat saldo kan hamna i otakt med sina
-- transaktioner; en summa över loggen kan det inte — och det här är pengar
-- restaurangen betalat för.

create type public.campaign_template as enum (
  'WELCOME',      -- till den som nyss blev gäst
  'WE_MISS_YOU',  -- ingen order på länge
  'OFFER',        -- ett erbjudande med ett slutdatum
  'NEWS'          -- nyheten: ny meny, nya öppettider, ny uteservering
);

create type public.campaign_status as enum ('DRAFT', 'SENDING', 'SENT', 'FAILED');

-- ── Utskicket ───────────────────────────────────────────────────────────────

create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  template       public.campaign_template not null,
  subject        text not null check (length(btrim(subject)) between 1 and 120),
  body           text not null check (length(btrim(body)) between 1 and 4000),

  status         public.campaign_status not null default 'DRAFT',

  -- Hur många brevet faktiskt gick till. Sätts när utskicket görs och ändras
  -- aldrig i efterhand — det är underlaget för vad restaurangen betalat.
  recipients     integer not null default 0 check (recipients >= 0),
  failed         integer not null default 0 check (failed >= 0),

  sent_at        timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index campaigns_restaurant_idx on public.campaigns (restaurant_id, created_at desc);

create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

-- Vem brevet gick till. Finns för att ett andra försök inte ska skicka om det
-- till samma gäst, och för att kunna svara på "fick jag det här?".
create table public.campaign_recipients (
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  delivered    boolean not null default true,
  created_at   timestamptz not null default now(),

  primary key (campaign_id, user_id)
);

-- ── Saldot, som en logg ─────────────────────────────────────────────────────

create table public.campaign_credit_events (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  -- Positivt när Burp lägger på ett paket, negativt när ett utskick förbrukar.
  delta          integer not null check (delta <> 0),

  -- "Paket 500 utskick, faktura 2026-1042" eller "Utskick: Ny meny".
  reason         text not null check (length(btrim(reason)) between 1 and 200),

  campaign_id    uuid references public.campaigns(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index campaign_credit_events_restaurant_idx
  on public.campaign_credit_events (restaurant_id, created_at desc);

-- Loggen är oföränderlig, som `order_events` och `loyalty_transactions`
-- (regel 6). Ett saldo som går att skriva om i efterhand är inget saldo.
create or replace function public.block_credit_log_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Kreditloggen är oföränderlig. Bokför en motpost i stället.'
    using errcode = 'restrict_violation';
end;
$$;

create trigger campaign_credit_events_immutable
  before update or delete on public.campaign_credit_events
  for each row execute function public.block_credit_log_change();

/**
 * Saldot: summan över loggen, aldrig en lagrad kolumn.
 *
 * Samma regel och samma skäl som `loyalty_balance()` (migration 0042).
 */
create or replace function public.campaign_credits(p_restaurant_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::integer
  from public.campaign_credit_events
  where restaurant_id = p_restaurant_id;
$$;

-- ── Mottagarna ──────────────────────────────────────────────────────────────

/**
 * Vilka som får ta emot ett utskick från den här restaurangen.
 *
 * Samtycke OCH en genomförd order hos just det här stället. Se modulens
 * inledning om varför båda krävs.
 *
 * SECURITY DEFINER därför att restaurangen inte får läsa `profiles` — den
 * policyn står fast (`restaurangen kan inte läsa sina gästers profiler` i
 * verify-schema-tests). Funktionen lämnar bara ut adresserna, och bara till
 * den som har en roll hos restaurangen.
 */
create or replace function public.campaign_audience(p_restaurant_id uuid)
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role_at(
    p_restaurant_id,
    array['owner', 'manager']::public.staff_role[]
  ) then
    raise exception 'Bara ägare och chef får se utskickslistan'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select distinct p.id, p.email
  from public.profiles p
  join public.orders o on o.guest_id = p.id
  where p.marketing_opt_in
    and p.email is not null
    and o.restaurant_id = p_restaurant_id
    and o.status = 'COMPLETED';
end;
$$;

-- ── Utskicket bokförs i EN transaktion ──────────────────────────────────────

/**
 * Skapar utskicket, bokför mottagarna och drar krediterna — allt eller inget.
 *
 * Att skriva delarna en och en hade betytt att ett avbrott mitt i lämnar
 * krediter dragna för brev som aldrig skickades, eller brev skickade utan att
 * något drogs. Det är pengar restaurangen betalat för.
 *
 * Returnerar utskickets id och adresserna att skicka till. SJÄLVA breven
 * skickas av appen efteråt: ett API-anrop per mottagare hör inte hemma i en
 * databastransaktion, och en leverantör som hänger hade hållit transaktionen
 * öppen. Misslyckade brev bokförs tillbaka med `refund_campaign_credits()`.
 */
create or replace function public.start_campaign(
  p_restaurant_id uuid,
  p_template      public.campaign_template,
  p_subject       text,
  p_body          text
)
returns table (campaign_id uuid, user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_ids      uuid[];
  v_emails   text[];
  v_count    integer;
  v_credits  integer;
begin
  if not public.has_role_at(
    p_restaurant_id,
    array['owner', 'manager']::public.staff_role[]
  ) then
    raise exception 'Bara ägare och chef får skicka utskick'
      using errcode = 'insufficient_privilege';
  end if;

  -- Två arrayer och ingen temporär tabell: en temptabell i en SECURITY
  -- DEFINER-funktion lever kvar i sessionen och gör andra anropet i samma
  -- session till ett annat fall än det första.
  select array_agg(a.user_id), array_agg(a.email)
  into v_ids, v_emails
  from public.campaign_audience(p_restaurant_id) a;

  v_count := coalesce(array_length(v_ids, 1), 0);

  if v_count = 0 then
    raise exception 'Ingen gäst har sagt ja till utskick från er än'
      using errcode = 'no_data_found';
  end if;

  v_credits := public.campaign_credits(p_restaurant_id);

  if v_credits < v_count then
    raise exception 'Saldot räcker inte: % utskick kvar, % mottagare',
      v_credits, v_count
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.campaigns
    (restaurant_id, template, subject, body, status, recipients, sent_at, created_by)
  values
    (p_restaurant_id, p_template, btrim(p_subject), btrim(p_body), 'SENDING', v_count, now(),
     auth.uid())
  returning id into v_campaign;

  insert into public.campaign_recipients (campaign_id, user_id)
  select v_campaign, id from unnest(v_ids) as id;

  insert into public.campaign_credit_events (restaurant_id, delta, reason, campaign_id, created_by)
  values (p_restaurant_id, -v_count, 'Utskick: ' || left(btrim(p_subject), 180), v_campaign,
          auth.uid());

  return query
  select v_campaign, u.id, u.email
  from unnest(v_ids, v_emails) as u(id, email);
end;
$$;

/**
 * Bokför tillbaka det som inte gick fram.
 *
 * En motpost, aldrig en ändring av den ursprungliga raden — loggen är
 * oföränderlig. Restaurangen ska inte betala för brev som leverantören
 * avvisade.
 */
create or replace function public.refund_campaign_credits(
  p_campaign_id uuid,
  p_failed      integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant uuid;
begin
  if p_failed <= 0 then
    return;
  end if;

  select restaurant_id into v_restaurant from public.campaigns where id = p_campaign_id;
  if v_restaurant is null then
    raise exception 'Okänt utskick %', p_campaign_id using errcode = 'no_data_found';
  end if;

  update public.campaigns
  set failed = p_failed,
      -- Casten är inte kosmetika: utan den ser Postgres ett CASE av typen
      -- text mot en enum-kolumn och avvisar hela uppdateringen.
      status = (case when p_failed >= recipients then 'FAILED' else 'SENT' end)::public.campaign_status
  where id = p_campaign_id;

  insert into public.campaign_credit_events (restaurant_id, delta, reason, campaign_id)
  values (v_restaurant, p_failed, 'Återbokat: brev som inte gick fram', p_campaign_id);
end;
$$;

create or replace function public.finish_campaign(p_campaign_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.campaigns set status = 'SENT' where id = p_campaign_id;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_credit_events enable row level security;

-- Ägare och chef ser sina egna utskick. Kocken och servitören har inget här
-- att göra, och en gäst än mindre.
create policy campaigns_management on public.campaigns
  for select to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy campaign_credits_management on public.campaign_credit_events
  for select to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

/*
 * Mottagarlistan är stängd även för restaurangen.
 *
 * Raden säger att en viss gäst tog emot ett visst brev, alltså att hon är
 * kund där. Restaurangen får veta HUR MÅNGA — det står på utskicket — men
 * inte vilka, av samma skäl som policyn "restaurangen kan inte läsa sina
 * gästers profiler" finns. Skrivningen sker i `start_campaign()`, som är
 * SECURITY DEFINER.
 */
create policy campaign_recipients_no_one on public.campaign_recipients
  for all to anon, authenticated
  using (false)
  with check (false);

grant select on public.campaigns to authenticated;
grant select on public.campaign_credit_events to authenticated;
grant all on public.campaigns to service_role;
grant all on public.campaign_recipients to service_role;
grant all on public.campaign_credit_events to service_role;

revoke execute on function public.start_campaign(uuid, public.campaign_template, text, text)
  from public, anon;
grant execute on function public.start_campaign(uuid, public.campaign_template, text, text)
  to authenticated, service_role;

revoke execute on function public.campaign_audience(uuid) from public, anon;
grant execute on function public.campaign_audience(uuid) to authenticated, service_role;

grant execute on function public.campaign_credits(uuid) to authenticated, service_role;
grant execute on function public.refund_campaign_credits(uuid, integer) to service_role;
grant execute on function public.finish_campaign(uuid) to service_role;

comment on table public.campaigns is
  'Ett utskick till restaurangens egna gäster. Går bara till den som sagt ja OCH handlat där.';
comment on table public.campaign_credit_events is
  'Loggen över köpta och förbrukade utskick. Saldot räknas ur den, lagras aldrig — samma regel som lojalitetspoängen.';
