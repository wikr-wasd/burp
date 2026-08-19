-- 0035 — Gemensam nota per bord, och en nota som faktiskt tar slut.
--
-- Fyra personer vid samma bord beställer var för sig i sina egna telefoner. De
-- delar redan `table_session` — det är hela poängen med att sessionen hör till
-- BORDET och inte till gästen — men kassan såg fyra order och krävde fyra
-- kvitteringar. Restaurangen vill ha en nota.
--
-- ⚠️ Under arbetet visade det sig att INGEN KOD NÅGONSIN STÄNGDE EN SESSION.
-- `getOrCreateTableSession` skapade en och återanvände den för alltid. Två fel
-- följde av det, och det andra är allvarligt:
--
--   1. Bordets nota tog aldrig slut. Översikten visade varje bord som "öppen
--      nota" i evighet, och siffran "3 av 12 upptagna" blev meningslös.
--
--   2. **Nästa gäst vid bordet ärvde förra sällskapets nota.** Sessionen är det
--      som bevisar åtkomst till ett kvitto. Gäst B nästa dag fick samma
--      sessions-id i sin cookie som gäst A, och kunde därmed läsa A:s order —
--      exakt det kvittosidans egen kommentar säger ska vara omöjligt.
--
-- Notan måste alltså kunna stängas, och det gör den på tre sätt: personalen
-- kvitterar den, personalen stänger den för hand, eller så går den ut av sig
-- själv efter en tids tystnad.

-- ── En betalning som hör ihop med andra ─────────────────────────────────────
--
-- `payments.order_id` är fortfarande `not null`, och det är med flit. En
-- betalning per order håller avgiften, momsen och återbetalningen per order —
-- allt det som redan fungerar. Det som saknades var att kunna säga att fyra
-- rader kom från ETT handslag över disk.

alter table public.payments
  add column settled_together_id uuid;

create index payments_settled_together_idx on public.payments (settled_together_id)
  where settled_together_id is not null;

comment on column public.payments.settled_together_id is
  'Delat id för betalningar som kvitterades i ett svep, t.ex. hela bordets nota. Null för en ensam betalning.';

-- ── Öppna bordets nota ──────────────────────────────────────────────────────
--
-- Ersätter uppslaget i `getOrCreateTableSession`, som hade två fel utöver att
-- den aldrig stängde något:
--
--   * En kapplöpning. Två gäster som skannade samtidigt såg båda "ingen
--     session" och försökte skapa var sin. Det unika indexet fångade den andra,
--     men som ett fel — gästen fick en 500:a i stället för en nota.
--
--   * Ingen utgång. En nota utan slut är en nota nästa sällskap ärver.
--
-- Låset på bordsraden serialiserar de samtidiga skanningarna.

create or replace function public.open_table_session(
  p_table_id      uuid,
  p_restaurant_id uuid,
  -- Hur länge en nota får vara tyst innan den räknas som avslutad. Fyra timmar
  -- är längre än en måltid och kortare än ett pass; ett sällskap som suttit i
  -- fyra timmar utan att beställa har gått.
  p_idle_minutes  integer default 240
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session    public.table_sessions%rowtype;
  v_last       timestamptz;
  v_session_id uuid;
begin
  -- Serialiserar samtidiga skanningar vid samma bord.
  perform 1 from public.tables where id = p_table_id for update;

  select * into v_session
  from public.table_sessions
  where table_id = p_table_id and status = 'OPEN';

  if found then
    -- Senaste livstecknet: notan öppnades, eller någon beställde på den.
    select greatest(
             v_session.opened_at,
             coalesce(max(o.created_at), v_session.opened_at)
           )
    into v_last
    from public.orders o
    where o.table_session_id = v_session.id;

    if v_last > now() - make_interval(mins => p_idle_minutes) then
      return v_session.id;
    end if;

    -- Tyst för länge. Notan avslutas så att nästa sällskap får en egen — och
    -- inte ärver åtkomsten till förra sällskapets kvitton.
    update public.table_sessions
    set status = 'CLOSED', closed_at = now()
    where id = v_session.id;
  end if;

  insert into public.table_sessions (table_id, restaurant_id, status)
  values (p_table_id, p_restaurant_id, 'OPEN')
  returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke execute on function public.open_table_session(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.open_table_session(uuid, uuid, integer) to service_role;

comment on function public.open_table_session is
  'Öppnar bordets nota, eller återanvänder den pågående. Stänger en nota som varit tyst för länge — annars ärver nästa sällskap åtkomsten till förra sällskapets kvitton.';

-- ── Vad bordet är skyldigt ──────────────────────────────────────────────────

create or replace function public.table_session_bill(p_session_id uuid)
returns table (
  order_id   uuid,
  total_ore  integer,
  paid_ore   integer,
  due_ore    integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.total_ore,
    coalesce(p.paid, 0)::integer,
    (o.total_ore - coalesce(p.paid, 0))::integer
  from public.orders o
  left join (
    select order_id, sum(amount_ore) as paid
    from public.payments
    where status <> 'FAILED'
    group by order_id
  ) p on p.order_id = o.id
  where o.table_session_id = p_session_id
    and o.status = 'COMPLETED'
  order by o.completed_at;
$$;

revoke execute on function public.table_session_bill(uuid) from public, anon;
grant execute on function public.table_session_bill(uuid) to authenticated, service_role;

-- ── Kvittera hela bordet ────────────────────────────────────────────────────
--
-- Det som gör funktionen värd att ha är FÖRDELNINGEN. Bordet betalar ett
-- belopp; böckerna behöver veta hur mycket som hörde till vilken order,
-- eftersom avgiften, momsen och en framtida återbetalning räknas per order.
--
-- Beloppet fördelas i proportion till vad varje order är skyldig, och den
-- krona som blir över av heltalsdivisionen går till den order som har störst
-- rest. Det är största-rest-metoden, och den är vald därför att summan av
-- delarna då ALLTID blir exakt det som togs emot — en proportionell fördelning
-- som avrundar var för sig tappar eller hittar på pengar.

create or replace function public.settle_table_session(
  p_session_id   uuid,
  p_received_ore integer,
  p_actor_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant   uuid;
  v_total_due    bigint;
  v_together_id  uuid := gen_random_uuid();
  v_rows         integer;
begin
  if p_received_ore is null or p_received_ore <= 0 then
    raise exception 'Beloppet måste vara positivt' using errcode = 'check_violation';
  end if;

  select restaurant_id into v_restaurant
  from public.table_sessions
  where id = p_session_id
  for update;

  if v_restaurant is null then
    raise exception 'Okänd bordssession %', p_session_id using errcode = 'no_data_found';
  end if;

  select coalesce(sum(due_ore), 0) into v_total_due
  from public.table_session_bill(p_session_id)
  where due_ore > 0;

  if v_total_due = 0 then
    raise exception 'Bordet har inget kvar att betala' using errcode = 'check_violation';
  end if;

  with due as (
    select order_id, due_ore
    from public.table_session_bill(p_session_id)
    where due_ore > 0
  ),
  shares as (
    select
      order_id,
      (p_received_ore::bigint * due_ore) / v_total_due          as base,
      (p_received_ore::bigint * due_ore) % v_total_due          as remainder
    from due
  ),
  ranked as (
    select
      order_id,
      base,
      -- Ordningen är rest först, sedan id. Id:t är med för att fördelningen
      -- ska bli densamma varje gång även när två order har samma rest.
      row_number() over (order by remainder desc, order_id) as rank
    from shares
  ),
  allocated as (
    select
      order_id,
      (base + case
                when rank <= p_received_ore - (select sum(base) from shares)
                then 1 else 0
              end)::integer as amount_ore
    from ranked
  )
  insert into public.payments (
    order_id, restaurant_id, amount_ore, provider, method, status,
    idempotency_key, captured_at, settled_together_id, provider_payload
  )
  select
    a.order_id,
    v_restaurant,
    a.amount_ore,
    'CASH',
    'cash',
    'CAPTURED',
    gen_random_uuid(),
    now(),
    v_together_id,
    jsonb_build_object(
      'table_session_id', p_session_id,
      'received_ore', p_received_ore,
      'table_due_ore', v_total_due,
      'registered_by', p_actor_id
    )
  from allocated a
  where a.amount_ore > 0;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'Ingenting att kvittera på bordet' using errcode = 'check_violation';
  end if;

  -- Notan är betald och därmed slut. Nästa sällskap får en egen.
  update public.table_sessions
  set status = 'CLOSED', closed_at = now(), closed_by = p_actor_id
  where id = p_session_id and status = 'OPEN';

  return v_together_id;
end;
$$;

revoke execute on function public.settle_table_session(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.settle_table_session(uuid, integer, uuid) to service_role;

comment on function public.settle_table_session is
  'Kvitterar hela bordets nota i ett svep. Fördelar beloppet per order med största-rest-metoden, så att summan av delarna blir exakt det som togs emot.';

-- ── Stänga notan för hand ───────────────────────────────────────────────────
--
-- Sällskapet gick utan att beställa, eller betalade på ett sätt som inte hör
-- hemma i Burp. Notan ska ändå kunna avslutas — annars är bordet upptaget för
-- alltid i Översikten.

create or replace function public.close_table_session(
  p_session_id uuid,
  p_actor_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.table_sessions
  set status = 'CLOSED', closed_at = now(), closed_by = p_actor_id
  where id = p_session_id and status = 'OPEN';
end;
$$;

revoke execute on function public.close_table_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.close_table_session(uuid, uuid) to service_role;
