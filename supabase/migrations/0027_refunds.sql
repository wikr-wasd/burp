-- 0027 — Återbetalning som motbokning.
--
-- `REFUNDED` och `PARTIALLY_REFUNDED` har funnits i `payment_status` sedan
-- 0006 och `payouts.refunds_ore` sedan dess, men ingen kod har kunnat sätta
-- dem. Att bygga kortbetalning utan återbetalning vore ett halvfärdigt skal:
-- en felaktig debitering hade bara gått att rätta genom att logga in i
-- leverantörens portal, och Burps egen bokföring hade aldrig fått veta om det.
--
-- Formen är en MOTBOKNING och inte en överskrivning. `payments` är ett kvitto
-- på att pengar rörde sig; att sänka beloppet på raden hade raderat det som
-- faktiskt hände. Samma princip som order_events och loyalty_transactions, och
-- samma som kassavyn redan utlovar: "en felkvittering rättas med en motbokning
-- när återbetalningsflödet byggs".

create type public.refund_status as enum ('PENDING', 'SUCCEEDED', 'FAILED');

-- ── Kontanter måste kunna återbetalas ───────────────────────────────────────
--
-- 0024 krävde att varje kontantrad står i CAPTURED. Det var rätt då: en
-- kontantbetalning är genomförd i samma stund den registreras, och det finns
-- inget "auktoriserad men inte dragen" när pengarna ligger i lådan.
--
-- Men villkoret skrevs innan återbetalning fanns, och det gör att en felaktig
-- kontantnota aldrig kan motbokas — precis det fall 0024 själv utlovade skulle
-- lösas "när återbetalningsflödet byggs". Kravet på tidpunkten står kvar; det
-- som öppnas är de två lägen en genomförd betalning kan gå vidare till.

alter table public.payments
  drop constraint payments_cash_is_captured;

alter table public.payments
  add constraint payments_cash_is_captured
  check (
    provider <> 'CASH'
    or (
      status in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      and captured_at is not null
    )
  );

create table public.refunds (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid not null references public.payments(id) on delete restrict,
  order_id            uuid not null references public.orders(id) on delete restrict,
  restaurant_id       uuid not null references public.restaurants(id) on delete restrict,

  amount_ore          integer not null check (amount_ore > 0),

  -- Varför. Fritt fält, men obligatoriskt: en återbetalning utan skäl är
  -- oförklarlig för den som stämmer av kassan tre månader senare.
  reason              text not null,

  provider            text not null,
  provider_reference  text,

  status              public.refund_status not null default 'PENDING',

  -- Vem tryckte. Null när återbetalningen initierades av leverantören själv,
  -- till exempel vid en chargeback.
  created_by          uuid references auth.users(id) on delete set null,

  provider_payload    jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now(),
  settled_at          timestamptz,
  failure_reason      text
);

create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_order_idx on public.refunds (order_id);
create index refunds_restaurant_idx on public.refunds (restaurant_id, created_at desc);

create unique index refunds_provider_ref_key
  on public.refunds (provider, provider_reference)
  where provider_reference is not null;

alter table public.refunds enable row level security;

-- Ägare och chef ser sina egna. Servitören gör det inte: en återbetalning är
-- ett ekonomiskt beslut, samma gräns som statistiksidan drar.
create policy refunds_select_owner on public.refunds
  for select to authenticated
  using (
    public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

create policy refunds_select_platform on public.refunds
  for select to authenticated
  using (public.is_platform_admin());

-- Ingen INSERT- eller UPDATE-policy. Rader skapas av `request_refund()` efter
-- att servern kontrollerat rollen, och avslutas av webhooken. En anställd som
-- kunde skriva raden direkt hade kunnat påstå en återbetalning som aldrig
-- lämnade banken.

create trigger refunds_no_delete
  before delete on public.refunds
  for each row execute function public.reject_mutation();

comment on table public.refunds is
  'Motbokningar mot payments. Beloppet på en betalning ändras aldrig — det som hände står kvar, och rättelsen är en egen rad.';

-- ── Begära en återbetalning ─────────────────────────────────────────────────
--
-- Kontrollen som spelar roll: summan av alla ej misslyckade återbetalningar får
-- aldrig överstiga betalningen. Utan den går det att återbetala samma nota två
-- gånger genom att trycka snabbt, och pengarna är borta innan någon märker det.

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
  v_payment  public.payments%rowtype;
  v_already  integer;
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
    payment_id, order_id, restaurant_id, amount_ore, reason, provider, created_by,
    -- Kontant lämnas tillbaka över disk i samma stund. Det finns ingen
    -- leverantör som ska bekräfta något, och en PENDING-rad hade legat kvar
    -- för evigt och sett ut som ett fel.
    status, settled_at
  )
  values (
    p_payment_id, v_payment.order_id, v_payment.restaurant_id, p_amount_ore,
    btrim(p_reason), v_payment.provider, p_actor_id,
    (case when v_payment.provider in ('CASH', 'GIFT_CARD') then 'SUCCEEDED' else 'PENDING' end)::public.refund_status,
    case when v_payment.provider in ('CASH', 'GIFT_CARD') then now() end
  )
  returning id into v_refund_id;

  if v_payment.provider in ('CASH', 'GIFT_CARD') then
    perform public.settle_refund(v_refund_id, null);
  end if;

  return v_refund_id;
end;
$$;

-- ── Avsluta en återbetalning ────────────────────────────────────────────────
--
-- Anropas av webhooken när leverantören bekräftat, och direkt av
-- `request_refund` för kontanter. Statusen räknas ur summan av lyckade
-- motbokningar — inte ur vad anroparen tror. En nota som återbetalas i tre steg
-- ska bli REFUNDED först när tredje steget landat.

create or replace function public.settle_refund(
  p_refund_id          uuid,
  p_provider_reference text default null
)
returns public.payment_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund     public.refunds%rowtype;
  v_payment    public.payments%rowtype;
  v_refunded   integer;
  v_next       public.payment_status;
  v_order      public.order_status;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Okänd återbetalning %', p_refund_id using errcode = 'no_data_found';
  end if;

  if v_refund.status = 'FAILED' then
    raise exception 'En misslyckad återbetalning kan inte avslutas'
      using errcode = 'check_violation';
  end if;

  update public.refunds
  set status             = 'SUCCEEDED',
      settled_at         = coalesce(settled_at, now()),
      provider_reference = coalesce(p_provider_reference, provider_reference)
  where id = p_refund_id;

  select * into v_payment from public.payments where id = v_refund.payment_id for update;

  select coalesce(sum(amount_ore), 0) into v_refunded
  from public.refunds
  where payment_id = v_refund.payment_id and status = 'SUCCEEDED';

  v_next := case
    when v_refunded >= v_payment.amount_ore then 'REFUNDED'
    else 'PARTIALLY_REFUNDED'
  end::public.payment_status;

  if v_payment.status <> v_next then
    update public.payments set status = v_next where id = v_payment.id;
  end if;

  -- Ordern följer bara med när HELA notan är tillbaka. En delåterbetalning för
  -- en kall rätt betyder inte att måltiden aldrig ägde rum, och köket ska inte
  -- se ordern försvinna ur passet.
  if v_next = 'REFUNDED' then
    select status into v_order from public.orders where id = v_refund.order_id;

    if v_order in ('ACCEPTED', 'PREPARING', 'READY', 'COMPLETED') then
      update public.orders set status = 'REFUNDED' where id = v_refund.order_id;
    end if;
  end if;

  return v_next;
end;
$$;

create or replace function public.fail_refund(
  p_refund_id uuid,
  p_reason    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.refunds
  set status = 'FAILED', failure_reason = p_reason
  where id = p_refund_id and status = 'PENDING';
end;
$$;

revoke execute on function public.request_refund(uuid, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.settle_refund(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_refund(uuid, text) from public, anon, authenticated;

grant execute on function public.request_refund(uuid, integer, text, uuid) to service_role;
grant execute on function public.settle_refund(uuid, text) to service_role;
grant execute on function public.fail_refund(uuid, text) to service_role;

comment on function public.request_refund is
  'Skapar en motbokning. Vägrar när summan av tidigare återbetalningar plus den nya överstiger betalningen — dubbeltryck får aldrig ge dubbla pengar tillbaka.';

-- ── Dricksen följer med ─────────────────────────────────────────────────────
--
-- `payouts.refunds_ore` finns sedan 0006 men fylls inte av någon kod ännu.
-- Vyn nedan är underlaget den kommer att läsa, och den finns nu därför att
-- ägaren behöver se sina återbetalningar innan utbetalningarna byggs.

create or replace function public.restaurant_refund_summary(
  p_restaurant_id uuid,
  p_from          timestamptz,
  p_to            timestamptz
)
returns table (
  refunds_count bigint,
  refunds_ore   bigint,
  currency      public.currency_code
)
language sql
stable
as $$
  select
    count(r.id)                             as refunds_count,
    coalesce(sum(r.amount_ore), 0)::bigint  as refunds_ore,
    p.currency
  from public.refunds r
  join public.payments p on p.id = r.payment_id
  where r.restaurant_id = p_restaurant_id
    and r.status = 'SUCCEEDED'
    and r.settled_at >= p_from
    and r.settled_at < p_to
  group by p.currency;
$$;

revoke execute on function public.restaurant_refund_summary(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.restaurant_refund_summary(uuid, timestamptz, timestamptz)
  to authenticated, service_role;
