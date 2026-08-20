-- 0044 — Kort i restaurangens egen terminal.
--
-- Kassan kunde bara registrera KONTANT. En gäst som drog sitt kort i
-- restaurangens egen terminal — det enda kortalternativet i Bosnien och
-- Serbien, där Stripe inte finns — fick sin betalning bokförd som sedlar.
--
-- Det är inte en kosmetisk felmärkning. Kassaavstämningen bygger på att
-- `provider = 'CASH'` betyder pengar i lådan: `settlements.cash_ore` räknar
-- dem, kassavyn ställer dem mot notan, och dricksrutan delar upp dricksen på
-- kontant och kort. Med terminalbetalningar inräknade tror alla tre att det
-- ligger sedlar där som inte finns, och avvikelsen upptäcks först när någon
-- räknar lådan.
--
-- ── Vad Burp INTE gör ───────────────────────────────────────────────────────
--
-- Burp läser inte terminalen. Betalningen sker mellan gästens kort och
-- restaurangens egen inlösare, helt utanför produkten, och beloppet skrivs in
-- av en människa precis som med kontanter. Det som byggs här är en ärlig
-- registrering, inte en integration. Vad en riktig sådan skulle kräva står i
-- docs/OPEN-QUESTIONS.md fråga 14.
--
-- `TERMINAL` blir därför en LEVERANTÖR och inte ett gästval. Gästen väljer inte
-- terminal i QR-kassan; personalen registrerar den efteråt.

-- ── Genomförd i samma stund den registreras ─────────────────────────────────
--
-- Samma skäl som för kontanter (0024): det finns inget "auktoriserad men inte
-- dragen" när kortet redan gått igenom i terminalen, och en CAPTURED-rad utan
-- tidpunkt går inte att stämma av mot ett kassapass.

alter table public.payments
  drop constraint payments_cash_is_captured;

alter table public.payments
  add constraint payments_cash_is_captured
  check (
    provider not in ('CASH', 'TERMINAL')
    or (
      status in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      and captured_at is not null
    )
  );

comment on constraint payments_cash_is_captured on public.payments is
  'Gäller de betalsätt personalen registrerar för hand. En sådan rad är genomförd när den skrivs — det finns ingen leverantör som ska bekräfta något senare.';

/*
 * En rad per order OCH betalsätt, inte en per order.
 *
 * `payments_cash_order_key` gjorde dubbelregistrering av kontanter omöjlig, och
 * det ska den fortsätta göra. Men ett sällskap kan dela notan mellan sedlar och
 * terminal — halva i kortläsaren, resten i kontanter — och det är ett vanligt
 * sätt att betala. Ett index som tillåter exakt en handregistrerad rad per
 * order hade gjort den delningen omöjlig.
 *
 * Kortbetalningar genom Burp berörs inte: de skrivs av en webhook och kan
 * behöva flera rader per order.
 */
drop index public.payments_cash_order_key;

create unique index payments_staff_registered_key
  on public.payments (order_id, provider)
  where provider in ('CASH', 'TERMINAL');

comment on index public.payments_staff_registered_key is
  'Ett kontantbelopp och ett terminalbelopp per order. Gör dubbeltryck i kassan omöjligt i databasen, men tillåter en nota som delas mellan sedlar och kort.';

-- ── Vem får registrera, och vem får läsa ────────────────────────────────────
--
-- Policyerna från 0024 nämner `CASH` vid namn. Utan den här ändringen kan
-- personalen inte skriva en terminalrad alls, och servitören kan inte se den
-- hen just skrivit. Villkoren i övrigt är oförändrade: bara den egna
-- restaurangen, bara en slutförd order, och aldrig ett kortflöde genom Burp —
-- de raderna skrivs av webhooken med service role.

drop policy payments_insert_cash on public.payments;

create policy payments_insert_staff_registered on public.payments
  for insert to authenticated
  with check (
    provider in ('CASH', 'TERMINAL')
    and status = 'CAPTURED'
    and public.has_role_at(
      restaurant_id,
      array['owner', 'manager', 'staff']::public.staff_role[]
    )
    and exists (
      select 1
      from public.orders o
      where o.id = payments.order_id
        and o.restaurant_id = payments.restaurant_id
        and o.status = 'COMPLETED'
    )
  );

drop policy payments_select_cash_staff on public.payments;

create policy payments_select_staff_registered on public.payments
  for select to authenticated
  using (
    provider in ('CASH', 'TERMINAL')
    and public.has_role_at(restaurant_id, array['staff']::public.staff_role[])
  );

-- ── Återbetalning sker i terminalen, inte hos oss ───────────────────────────
--
-- `request_refund` avslutar kontanter och presentkort direkt, eftersom ingen
-- leverantör ska bekräfta något. Terminalen hör dit: pengarna lämnas tillbaka i
-- kortläsaren av personalen. En PENDING-rad hade legat kvar för evigt och sett
-- ut som ett fel.
--
-- Speglar `settlesOutsideBurp()` i packages/core/src/payment.ts.
--
-- Kroppen nedan är 0037:s och inte 0027:s, med EN rad ändrad. Att i stället
-- utgå från den ursprungliga versionen hade tyst backat 0037:s rättning —
-- presentkortets värde hade slutat skrivas tillbaka vid en återbetalning, och
-- gästen stått med ett tomt kort igen. Det hände under arbetet med den här
-- migrationen och fångades av testet från 0037.

create or replace function public.request_refund(
  p_payment_id uuid,
  p_amount_ore integer,
  p_reason     text,
  p_actor_id   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment   public.payments%rowtype;
  v_already   integer;
  v_refund_id uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Okänd betalning %', p_payment_id using errcode = 'no_data_found';
  end if;

  if v_payment.status not in ('CAPTURED', 'PARTIALLY_REFUNDED') then
    raise exception 'Bara en genomförd betalning kan återbetalas (status är %)', v_payment.status
      using errcode = 'check_violation';
  end if;

  if p_amount_ore is null or p_amount_ore <= 0 then
    raise exception 'Beloppet måste vara positivt' using errcode = 'check_violation';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'En återbetalning måste ha ett skäl' using errcode = 'check_violation';
  end if;

  select coalesce(sum(amount_ore), 0) into v_already
  from public.refunds
  where payment_id = p_payment_id and status <> 'FAILED';

  if v_already + p_amount_ore > v_payment.amount_ore then
    raise exception 'Återbetalningen (% + %) överstiger betalningen (%)',
      v_already, p_amount_ore, v_payment.amount_ore
      using errcode = 'check_violation';
  end if;

  insert into public.refunds (
    payment_id, order_id, restaurant_id, amount_ore, reason, provider, created_by
  )
  values (
    p_payment_id, v_payment.order_id, v_payment.restaurant_id, p_amount_ore,
    btrim(p_reason), v_payment.provider, p_actor_id
  )
  returning id into v_refund_id;

  -- Kontant lämnas tillbaka över disk, terminalen i kortläsaren och
  -- presentkortet skrivs upp direkt. Ingen av dem har en leverantör som ska
  -- bekräfta något, och en PENDING-rad hade legat kvar för evigt.
  if v_payment.provider in ('CASH', 'TERMINAL', 'GIFT_CARD') then
    perform public.settle_refund(v_refund_id, null);
  end if;

  return v_refund_id;
end;
$$;

revoke execute on function public.request_refund(uuid, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.request_refund(uuid, integer, text, uuid) to service_role;

comment on function public.request_refund is
  'Skapar en motbokning. Vägrar när summan av tidigare återbetalningar plus den nya överstiger betalningen. Kontant, terminal och presentkort avslutas direkt — det finns ingen leverantör som ska bekräfta något.';

-- ── Bordets gemensamma nota kan betalas med kort ────────────────────────────
--
-- `settle_table_session` skrev hårdkodat `provider = 'CASH'`. Fyra personer som
-- delar en nota och betalar den med ett kort i terminalen är precis det fall
-- funktionen finns för.
--
-- Argumentet är sist och har `'CASH'` som standard, så att befintliga anrop
-- fortsätter fungera oförändrade.

create or replace function public.settle_table_session(
  p_session_id   uuid,
  p_received_ore integer,
  p_actor_id     uuid default null,
  p_provider     text default 'CASH'
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

  -- Bara det personalen får registrera för hand. Ett kortflöde genom Burp
  -- skrivs av webhooken och har aldrig med den här vägen att göra.
  if p_provider not in ('CASH', 'TERMINAL') then
    raise exception 'Bordets nota kan bara kvitteras som CASH eller TERMINAL, inte %', p_provider
      using errcode = 'check_violation';
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
    p_provider,
    case when p_provider = 'CASH' then 'cash' else 'card_present' end,
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

-- Den gamla signaturen ligger kvar som en egen funktion tills den tas bort —
-- annars svarar PostgREST tvetydigt på ett anrop utan p_provider.
drop function if exists public.settle_table_session(uuid, integer, uuid);

revoke execute on function public.settle_table_session(uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.settle_table_session(uuid, integer, uuid, text) to service_role;

comment on function public.settle_table_session is
  'Kvitterar hela bordets nota i ett svep, kontant eller i terminalen. Fördelar beloppet per order med största-rest-metoden, så att summan av delarna blir exakt det som togs emot.';
