-- 0039 — Avräkning: vad restaurangen är skyldig Burp för en period.
--
-- `payouts` fanns sedan 0006 och ingen kod har någonsin skrivit eller läst den.
-- Det är precis den halvfärdiga skalen grundregeln förbjuder, och den bar
-- dessutom fel modell.
--
-- ── Varför tabellen byter namn och form ─────────────────────────────────────
--
-- `payouts` beskrev en UTBETALNING FRÅN BURP: gästen betalar plattformen,
-- plattformen behåller sin avgift och betalar ut resten till restaurangen. Det
-- är marknadsplatsmodellen — väg B i öppen fråga 5.
--
-- Svaret på fråga 5 blev väg A: **restaurangen äger sitt eget inlösenavtal och
-- Burp rör aldrig gästens pengar.** Då finns ingen utbetalning att göra. Pengarna
-- är redan hos restaurangen i samma stund gästen betalat, och det som återstår
-- går åt andra hållet — Burp har en fordran på sin avgift. Fråga 5 säger det
-- rakt ut: avgiften "faktureras i efterhand ur `fees`".
--
-- En tabell som heter `payouts` och innehåller en skuld åt motsatt håll är
-- värre än ingen tabell alls. Den läses fel av nästa person som öppnar schemat,
-- och `net_ore` — brutto minus avgift — hade blivit ett belopp ingen ska betala
-- till någon.
--
-- Ingen rad går förlorad: tabellen har aldrig haft någon.
--
-- ── Vad en avräkning är ─────────────────────────────────────────────────────
--
--   gross_ore       vad gästerna betalade restaurangen. Upplysning, inte skuld
--   tips_ore        dricksen. Personalens pengar, aldrig i avgiftsunderlaget
--   cash_ore        hur mycket som kom in som sedlar
--   fees_ore        Burps avgift på periodens måltider
--   refunds_ore     vad som gick tillbaka till gästerna i perioden
--   fee_credit_ore  avgift som krediteras för helt återbetalda order
--   amount_due_ore  fees_ore − fee_credit_ore. Det Burp fakturerar
--
-- `amount_due_ore` kan bli negativt. En period där fler order återbetalades än
-- såldes är en kreditnota, och att klämma den till noll hade betytt att
-- krediten tyst försvann.

create extension if not exists "btree_gist";   -- exclusion constraint på period

-- ── Avräkningens livscykel ──────────────────────────────────────────────────
--
--   DRAFT → INVOICED → PAID
--     │         │
--     └─────────┴──→ VOID
--
-- `payout_status` var 'SCHEDULED', 'PAID', 'FAILED' — en utbetalning som
-- planeras, går igenom eller studsar hos banken. En faktura studsar inte; den
-- skickas, betalas eller makuleras.

create type public.settlement_status as enum ('DRAFT', 'INVOICED', 'PAID', 'VOID');

drop table public.payouts;
drop type public.payout_status;

create table public.settlements (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete restrict,

  -- Båda dagarna ingår. En period skriven "1 aug – 31 aug" ska betyda just det,
  -- och en exklusiv slutdag hade gjort varje gränsfall till en diskussion.
  -- Dygnen räknas i RESTAURANGENS tidszon, inte i UTC — se
  -- `restaurant_period_range()` nedan.
  period_start        date not null,
  period_end          date not null,

  -- Fryst på raden, som på ordern (0020). Byter restaurangen valuta ska en
  -- gammal avräkning stå kvar i den valuta den räknades i.
  currency            public.currency_code not null,

  orders_count        integer not null default 0 check (orders_count >= 0),
  gross_ore           integer not null default 0 check (gross_ore >= 0),
  tips_ore            integer not null default 0 check (tips_ore >= 0),
  cash_ore            integer not null default 0 check (cash_ore >= 0),
  fees_ore            integer not null default 0 check (fees_ore >= 0),
  refunds_ore         integer not null default 0 check (refunds_ore >= 0),
  fee_credit_ore      integer not null default 0 check (fee_credit_ore >= 0),

  -- Genererad och inte skriven. Två kolumner som ska stämma överens glider isär
  -- första gången någon uppdaterar den ena.
  amount_due_ore      integer generated always as (fees_ore - fee_credit_ore) stored,

  status              public.settlement_status not null default 'DRAFT',

  -- Fakturanumret kommer ur Burps bokföring, inte härifrån. Kolumnen finns för
  -- att kunna gå från en rad här till ett verifikat där.
  invoice_number      text,
  note                text,

  invoiced_at         timestamptz,
  paid_at             timestamptz,
  voided_at           timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint settlements_period_order check (period_start <= period_end)
);

create index settlements_restaurant_idx
  on public.settlements (restaurant_id, period_end desc);

create index settlements_status_idx
  on public.settlements (status)
  where status in ('DRAFT', 'INVOICED');

/*
 * Två perioder får aldrig överlappa för samma restaurang.
 *
 * `payouts` hade ett unikt index på (restaurant_id, period_start, period_end).
 * Det stoppar samma period två gånger men inte 1–31 augusti bredvid 15–20
 * augusti — och då faktureras sex dagar två gånger. Ett unikt index kan inte se
 * det; en exclusion constraint kan.
 */
alter table public.settlements
  add constraint settlements_no_overlap
  exclude using gist (
    restaurant_id with =,
    daterange(period_start, period_end, '[]') with &&
  );

create trigger settlements_touch before update on public.settlements
  for each row execute function public.touch_updated_at();

-- ── Perioden i restaurangens egen tid ───────────────────────────────────────
--
-- Samma skäl som `is_restaurant_open()` fick sin tidszon ur landet (0033): en
-- period som räknas i UTC börjar och slutar två timmar fel för en restaurang i
-- Sarajevo på sommaren. Kvällspasset sista dagen i månaden hade då hamnat i
-- nästa månads faktura.
--
-- Slutdagen ingår, alltså sträcker sig intervallet till midnatt DAGEN EFTER
-- period_end, exklusivt.

create or replace function public.restaurant_period_range(
  p_restaurant_id uuid,
  p_period_start  date,
  p_period_end    date
)
returns tstzrange
language sql
stable
as $$
  select tstzrange(
    (p_period_start::timestamp)      at time zone public.country_time_zone(r.country),
    ((p_period_end + 1)::timestamp)  at time zone public.country_time_zone(r.country),
    '[)'
  )
  from public.restaurants r
  where r.id = p_restaurant_id;
$$;

comment on function public.restaurant_period_range is
  'Perioden som ett tidsintervall i restaurangens egen tidszon. Slutdagen ingår. Ändras country_time_zone() måste COUNTRY_INFO i @burp/core följa med.';

-- ── Underlaget ──────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER, som statistiken i 0014. RLS på `orders`, `fees`, `payments`
-- och `refunds` avgör vad som räknas med. En SECURITY DEFINER-funktion här hade
-- läckt en annan restaurangs omsättning till den som gissar rätt uuid.
--
-- ── Vad som räknas, och varför ──────────────────────────────────────────────
--
-- **Måltiden avgör perioden, inte betalningen.** Ordern räknas i den period den
-- slutfördes. En nota som kvitteras dagen efter hör till kvällen den åts.
--
-- **REFUNDED räknas med i bruttot.** En helt återbetald order byter status från
-- COMPLETED till REFUNDED och hade annars fallit ur underlaget helt — samtidigt
-- som återbetalningen drogs av. Samma order hade då räknats bort två gånger.
--
-- **Bara HELT återbetalda order krediterar avgiften.** En delåterbetalning —
-- en kall rätt som kompenseras — upphäver inte att måltiden såldes; gästen satt
-- kvar och åt resten. En hel återbetalning gör det.
--
-- Det är ett beslut och inte en lucka, och det är fattat därför att alternativet
-- kräver ett svar Burp inte har: en proportionell kreditering måste veta hur
-- mycket av avgiften som redan krediterats i en TIDIGARE period, annars kan
-- summan över tid överstiga avgiften. Se docs/OPEN-QUESTIONS.md fråga 12.
--
-- **Krediten hamnar i den period återbetalningen avslutades**, inte i den då
-- ordern såldes. En redan fakturerad period skrivs aldrig om.

create or replace function public.settlement_preview(
  p_restaurant_id uuid,
  p_period_start  date,
  p_period_end    date
)
returns table (
  currency        public.currency_code,
  orders_count    bigint,
  gross_ore       bigint,
  tips_ore        bigint,
  cash_ore        bigint,
  fees_ore        bigint,
  refunds_ore     bigint,
  fee_credit_ore  bigint,
  amount_due_ore  bigint
)
language sql
stable
as $$
  with span as (
    select public.restaurant_period_range(p_restaurant_id, p_period_start, p_period_end) as at
  ),
  sold as (
    select
      count(*)                                     as orders_count,
      coalesce(sum(o.items_gross_ore), 0)::bigint  as gross_ore,
      coalesce(sum(o.tip_ore), 0)::bigint          as tips_ore,
      -- Avgiften LÄSES ur `fees`, den räknas aldrig om. Procentsatsen kan ha
      -- ändrats sedan ordern lades, och fakturan ska visa vad som faktiskt togs
      -- ut då. Samma regel som statistiken följer.
      coalesce(sum(f.fee_ore), 0)::bigint          as fees_ore,
      -- En restaurang har en valuta, men ordern bär sin egen frusna. Byter
      -- restaurangen land mitt i en period blandas två valutor, och då finns
      -- ingen giltig summa — `close_settlement_period` vägrar i stället för att
      -- lägga ihop fening och dinarer.
      count(distinct o.currency)                   as currencies,
      min(o.currency)                              as currency
    from public.orders o
    left join public.fees f on f.order_id = o.id
    cross join span
    where o.restaurant_id = p_restaurant_id
      and o.status in ('COMPLETED', 'REFUNDED')
      and span.at @> o.completed_at
  ),
  cash as (
    select coalesce(sum(p.amount_ore), 0)::bigint as cash_ore
    from public.payments p
    cross join span
    where p.restaurant_id = p_restaurant_id
      and p.provider = 'CASH'
      -- En återbetald kontantnota togs ändå emot i kassan. Avdraget står på
      -- `refunds_ore`; att stryka raden här hade dolt att sedlarna funnits.
      and p.status in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      and span.at @> p.captured_at
  ),
  given_back as (
    select coalesce(sum(rf.amount_ore), 0)::bigint as refunds_ore
    from public.refunds rf
    cross join span
    where rf.restaurant_id = p_restaurant_id
      and rf.status = 'SUCCEEDED'
      and span.at @> rf.settled_at
  ),
  credited as (
    select coalesce(sum(f.fee_ore), 0)::bigint as fee_credit_ore
    from public.orders o
    join public.fees f on f.order_id = o.id
    cross join span
    where o.restaurant_id = p_restaurant_id
      and o.status = 'REFUNDED'
      -- Den sista lyckade motbokningen är den som gjorde ordern helt
      -- återbetald. Krediten hör till den perioden.
      and span.at @> (
        select max(rf.settled_at)
        from public.refunds rf
        where rf.order_id = o.id and rf.status = 'SUCCEEDED'
      )
  )
  select
    case
      when sold.currencies > 1 then null
      else coalesce(
        sold.currency,
        (select r.currency from public.restaurants r where r.id = p_restaurant_id)
      )
    end,
    sold.orders_count,
    sold.gross_ore,
    sold.tips_ore,
    cash.cash_ore,
    sold.fees_ore,
    given_back.refunds_ore,
    credited.fee_credit_ore,
    sold.fees_ore - credited.fee_credit_ore
  from sold, cash, given_back, credited;
$$;

-- Underlaget är personalens och Burps, aldrig gästens. Nya funktioner är
-- körbara av PUBLIC som standard i Postgres, så det räcker inte att låta bli
-- att GRANTa — rättigheten måste tas tillbaka.
revoke execute on function
  public.settlement_preview(uuid, date, date),
  public.restaurant_period_range(uuid, date, date)
  from public, anon;

grant execute on function
  public.settlement_preview(uuid, date, date),
  public.restaurant_period_range(uuid, date, date)
  to authenticated, service_role;

comment on function public.settlement_preview is
  'Räknar en avräkningsperiod utan att skriva något. Samma uträkning som close_settlement_period använder — två kopior hade glidit isär och visat en summa fakturan inte håller.';

/*
 * Samma underlag för hela plattformen, i ett anrop.
 *
 * Backoffice behöver alla restauranger samtidigt för att kunna stänga en månad.
 * En rundtur per restaurang hade fungerat med tio och blivit en sidladdning på
 * flera sekunder med hundra — och varje rad räknar dessutom i SIN restaurangs
 * tidszon, vilket en gemensam WHERE-sats i applikationen inte kan göra.
 *
 * `is_platform_admin()` står i villkoret och inte bara i RLS. Restaurangnamnen
 * är publika, och utan spärren hade vem som helst kunnat hämta listan över
 * samtliga restauranger med nollor i beloppen — en katalog över Burps kunder.
 */
create or replace function public.platform_settlement_preview(
  p_period_start date,
  p_period_end   date
)
returns table (
  restaurant_id     uuid,
  restaurant_name   text,
  currency          public.currency_code,
  orders_count      bigint,
  gross_ore         bigint,
  tips_ore          bigint,
  cash_ore          bigint,
  fees_ore          bigint,
  refunds_ore       bigint,
  fee_credit_ore    bigint,
  amount_due_ore    bigint,
  settlement_id     uuid,
  settlement_status public.settlement_status
)
language sql
stable
as $$
  select
    r.id,
    r.name,
    p.currency,
    p.orders_count,
    p.gross_ore,
    p.tips_ore,
    p.cash_ore,
    p.fees_ore,
    p.refunds_ore,
    p.fee_credit_ore,
    p.amount_due_ore,
    s.id,
    s.status
  from public.restaurants r
  cross join lateral public.settlement_preview(r.id, p_period_start, p_period_end) p
  left join public.settlements s
    on s.restaurant_id = r.id
   and s.period_start  = p_period_start
   and s.period_end    = p_period_end
  where public.is_platform_admin()
    and r.status <> 'PENDING'
  order by p.amount_due_ore desc, r.name;
$$;

revoke execute on function public.platform_settlement_preview(date, date) from public, anon;
grant execute on function public.platform_settlement_preview(date, date)
  to authenticated, service_role;

comment on function public.platform_settlement_preview is
  'Avräkningsunderlag för samtliga restauranger i en period, var och en räknad i sin egen tidszon. Bara plattformsadmin.';

-- ── Att stänga en period ────────────────────────────────────────────────────
--
-- SECURITY DEFINER och bara service role. Avräkningen är Burps faktura, inte
-- restaurangens: hade `authenticated` kunnat skriva raden hade en ägare kunnat
-- stänga sin egen period på noll kronor.

create or replace function public.close_settlement_period(
  p_restaurant_id uuid,
  p_period_start  date,
  p_period_end    date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_id  uuid;
begin
  if p_period_start is null or p_period_end is null or p_period_start > p_period_end then
    raise exception 'Perioden måste börja senast när den slutar'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.restaurants where id = p_restaurant_id) then
    raise exception 'Okänd restaurang %', p_restaurant_id using errcode = 'no_data_found';
  end if;

  -- En period som inte är slut går inte att fakturera. Order som läggs efter
  -- att raden skrivits hade annars aldrig hamnat i någon avräkning alls —
  -- överlappsspärren gör att perioden inte kan köras om.
  if upper(public.restaurant_period_range(p_restaurant_id, p_period_start, p_period_end)) > now() then
    raise exception 'Perioden är inte slut än'
      using errcode = 'check_violation';
  end if;

  select * into v_row
  from public.settlement_preview(p_restaurant_id, p_period_start, p_period_end);

  if v_row.currency is null then
    raise exception 'Perioden innehåller order i fler än en valuta och kan inte summeras'
      using errcode = 'check_violation';
  end if;

  insert into public.settlements (
    restaurant_id, period_start, period_end, currency,
    orders_count, gross_ore, tips_ore, cash_ore, fees_ore, refunds_ore, fee_credit_ore
  )
  values (
    p_restaurant_id, p_period_start, p_period_end, v_row.currency,
    v_row.orders_count, v_row.gross_ore, v_row.tips_ore, v_row.cash_ore,
    v_row.fees_ore, v_row.refunds_ore, v_row.fee_credit_ore
  )
  returning id into v_id;

  return v_id;
exception
  when exclusion_violation then
    raise exception 'Perioden överlappar en avräkning som redan finns'
      using errcode = 'exclusion_violation';
end;
$$;

revoke execute on function public.close_settlement_period(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.close_settlement_period(uuid, date, date) to service_role;

comment on function public.close_settlement_period is
  'Stänger en period och skriver ett utkast till avräkning. Bara service role — avräkningen är Burps faktura, inte restaurangens.';

-- ── Statusmaskinen och frysningen ───────────────────────────────────────────
--
-- Ett utkast får räknas om och kastas. Så fort avräkningen skickats är den ett
-- underlag någon fått i handen, och då gäller samma princip som för `payments`
-- och `order_events`: siffran skrivs inte om. Blev den fel makuleras den och en
-- ny period stängs.

create or replace function public.enforce_settlement_transition()
returns trigger
language plpgsql
as $$
declare
  allowed public.settlement_status[];
begin
  if old.status <> 'DRAFT' then
    if (new.restaurant_id, new.period_start, new.period_end, new.currency,
        new.orders_count, new.gross_ore, new.tips_ore, new.cash_ore,
        new.fees_ore, new.refunds_ore, new.fee_credit_ore)
       is distinct from
       (old.restaurant_id, old.period_start, old.period_end, old.currency,
        old.orders_count, old.gross_ore, old.tips_ore, old.cash_ore,
        old.fees_ore, old.refunds_ore, old.fee_credit_ore)
    then
      raise exception 'En avräkning som lämnat utkastet kan inte räknas om (status är %)', old.status
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status <> old.status then
    allowed := case old.status
      when 'DRAFT'    then array['INVOICED', 'VOID']
      when 'INVOICED' then array['PAID', 'VOID']
      else array[]::text[]
    end::public.settlement_status[];

    if not (new.status = any (allowed)) then
      raise exception 'Avräkningen kan inte gå från % till %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  -- Tidsstämplarna sätts här och inte av applikationen, av samma skäl som på
  -- ordern: varje kodväg som ändrar status får dem automatiskt.
  new.invoiced_at := coalesce(new.invoiced_at, case when new.status = 'INVOICED' then now() end);
  new.paid_at     := coalesce(new.paid_at,     case when new.status = 'PAID'     then now() end);
  new.voided_at   := coalesce(new.voided_at,   case when new.status = 'VOID'     then now() end);

  return new;
end;
$$;

create trigger settlements_transition
  before update on public.settlements
  for each row execute function public.enforce_settlement_transition();

create or replace function public.reject_settlement_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'DRAFT' then
    raise exception 'En skickad avräkning raderas inte, den makuleras (VOID)'
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end;
$$;

create trigger settlements_delete_guard
  before delete on public.settlements
  for each row execute function public.reject_settlement_delete();

-- ── Åtkomst ─────────────────────────────────────────────────────────────────

alter table public.settlements enable row level security;

-- Ägare och chef. Servitören ser den inte — vad restaurangen betalar Burp är
-- samma sorts uppgift som statistiksidan, och den gränsen dras likadant överallt.
create policy settlements_select_owner on public.settlements
  for select to authenticated
  using (
    public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

create policy settlements_select_platform on public.settlements
  for select to authenticated
  using (public.is_platform_admin());

-- Ingen INSERT-, UPDATE- eller DELETE-policy. Raderna skapas av
-- `close_settlement_period()` och ändras av backoffice, båda med service role
-- efter att servern kontrollerat att anroparen är plattformsadmin.

comment on table public.settlements is
  'Vad restaurangen är skyldig Burp för en period. Ersätter payouts (0006), som beskrev en utbetalning FRÅN Burp — en modell som föll när öppen fråga 5 besvarades med att restaurangen äger sitt eget inlösenavtal.';

comment on column public.settlements.gross_ore is
  'Vad gästerna betalade restaurangen. Upplysning — pengarna gick aldrig via Burp.';

comment on column public.settlements.amount_due_ore is
  'Det Burp fakturerar. Kan vara negativt: en period med fler återbetalningar än försäljning är en kreditnota.';
