-- 0037 — En återbetald presentkortsbetalning ska tillbaka till kortet.
--
-- Två hål i pengarna, båda i presentkortsflödet.
--
-- ── 1. Värdet försvann vid återbetalning ───────────────────────────────────
--
-- `request_refund` (0027) markerade en presentkortsbetalning som återbetald
-- direkt — det finns ingen leverantör som ska bekräfta något. Men ingenting
-- skrev tillbaka värdet på kortet. Gästen betalade 50 med sitt presentkort, fick
-- notan återbetald på papperet, och stod med ett tomt kort. Pengarna var borta.
--
-- `gift_card_transactions.kind` har haft `REFUND` sedan 0030 och
-- `giftCardBalance()` i @burp/core räknar med den — men ingen kod skrev en
-- sådan rad. Alltså precis den sortens halvfärdiga skal grundregeln förbjuder:
-- ett värde i ett enum som ingenting producerar.
--
-- Pengarna går tillbaka till KORTET och inte till kassan. Det är inte en
-- bekvämlighetsfråga: ett presentkort som går att lösa in mot kontanter är inte
-- längre ett kort i ett begränsat nätverk, och hela skälet till att Burp får ge
-- ut dem utan tillstånd faller.
--
-- ── 2. Kortet kunde betala mer än vad ordern var skyldig ───────────────────
--
-- `redeem_gift_card` jämförde mot `orders.total_ore` och inte mot vad som
-- FAKTISKT återstod. En order som redan hade en betalning kunde därmed
-- överbetalas med kortets saldo, och överskottet fanns ingenstans att hämta.

-- ── Avsluta en återbetalning ────────────────────────────────────────────────

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
  v_refund   public.refunds%rowtype;
  v_payment  public.payments%rowtype;
  v_refunded integer;
  v_next     public.payment_status;
  v_order    public.order_status;
  v_card_id  uuid;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Okänd återbetalning %', p_refund_id using errcode = 'no_data_found';
  end if;

  if v_refund.status = 'FAILED' then
    raise exception 'En misslyckad återbetalning kan inte avslutas'
      using errcode = 'check_violation';
  end if;

  -- Redan avslutad. En omsänd webhook ska inte lägga tillbaka värdet på
  -- presentkortet en gång till.
  if v_refund.status = 'SUCCEEDED' and v_refund.settled_at is not null then
    select status into v_next from public.payments where id = v_refund.payment_id;
    return v_next;
  end if;

  update public.refunds
  set status             = 'SUCCEEDED',
      settled_at         = coalesce(settled_at, now()),
      provider_reference = coalesce(p_provider_reference, provider_reference)
  where id = p_refund_id;

  select * into v_payment from public.payments where id = v_refund.payment_id for update;

  /*
   * Presentkortet får tillbaka sitt värde.
   *
   * Kortets id ligger i betalningens `provider_payload`, satt av
   * `redeem_gift_card`. Saknas det går återbetalningen ändå igenom — men det
   * ska synas i loggen, eftersom det betyder att någon inte får tillbaka
   * pengar hen har rätt till.
   */
  if v_payment.provider = 'GIFT_CARD' then
    v_card_id := nullif(v_payment.provider_payload ->> 'gift_card_id', '')::uuid;

    if v_card_id is null then
      raise warning 'Betalning % saknar gift_card_id — värdet kunde inte läggas tillbaka',
        v_payment.id;
    else
      insert into public.gift_card_transactions (
        gift_card_id, kind, amount_ore, order_id, payment_id
      )
      values (v_card_id, 'REFUND', v_refund.amount_ore, v_refund.order_id, v_payment.id);
    end if;
  end if;

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
  -- en kall rätt betyder inte att måltiden aldrig ägde rum.
  if v_next = 'REFUNDED' then
    select status into v_order from public.orders where id = v_refund.order_id;

    if v_order in ('ACCEPTED', 'PREPARING', 'READY', 'COMPLETED') then
      update public.orders set status = 'REFUNDED' where id = v_refund.order_id;
    end if;
  end if;

  return v_next;
end;
$$;

revoke execute on function public.settle_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.settle_refund(uuid, text) to service_role;

comment on function public.settle_refund is
  'Avslutar en motbokning. En presentkortsbetalning lägger tillbaka värdet på KORTET — ett kort som går att lösa in mot kontanter är inte längre ett begränsat nätverk.';

-- ── Begära en återbetalning ─────────────────────────────────────────────────
--
-- Raden skapas som PENDING för ALLA leverantörer, även kontant och presentkort.
--
-- 0027 skrev dem som SUCCEEDED direkt, med motiveringen att det inte finns
-- någon leverantör som ska bekräfta något. Det stämmer — men `settle_refund` är
-- också det som lägger tillbaka värdet på presentkortet, och en rad som redan
-- var avslutad plockades bort av dubblettskyddet innan den hann göra det.
--
-- Nu gör `settle_refund` avslutet i båda fallen, och den anropas direkt för de
-- betalsätt som inte har någon leverantör att vänta på. En PENDING-rad ligger
-- alltså aldrig kvar för dem.

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

  -- Kontant lämnas tillbaka över disk och presentkortet skrivs upp direkt. Det
  -- finns ingen leverantör som ska bekräfta något, och en PENDING-rad hade
  -- legat kvar för evigt och sett ut som ett fel.
  if v_payment.provider in ('CASH', 'GIFT_CARD') then
    perform public.settle_refund(v_refund_id, null);
  end if;

  return v_refund_id;
end;
$$;

revoke execute on function public.request_refund(uuid, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.request_refund(uuid, integer, text, uuid) to service_role;

-- ── Lösa in mot vad som faktiskt återstår ───────────────────────────────────

create or replace function public.redeem_gift_card(
  p_code       text,
  p_order_id   uuid,
  p_amount_ore integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card    public.gift_cards%rowtype;
  v_order   public.orders%rowtype;
  v_balance integer;
  v_paid    integer;
  v_due     integer;
  v_payment uuid;
begin
  select * into v_card from public.gift_cards where code = p_code for update;
  if not found then
    raise exception 'Okänt presentkort' using errcode = 'no_data_found';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Okänd order %', p_order_id using errcode = 'no_data_found';
  end if;

  -- Spärren som gör konstruktionen möjlig utan tillstånd att ge ut
  -- elektroniska pengar. Den står i koden OCH här, med flit.
  if v_card.restaurant_id <> v_order.restaurant_id then
    raise exception 'Presentkortet gäller bara hos restaurangen som gav ut det'
      using errcode = 'check_violation';
  end if;

  if not v_card.is_active then
    raise exception 'Presentkortet är spärrat' using errcode = 'check_violation';
  end if;

  if v_card.expires_at is not null and now() >= v_card.expires_at then
    raise exception 'Presentkortet har gått ut' using errcode = 'check_violation';
  end if;

  if v_card.currency <> v_order.currency then
    raise exception 'Presentkortet är i en annan valuta än ordern'
      using errcode = 'check_violation';
  end if;

  v_balance := public.gift_card_balance(v_card.id);

  if p_amount_ore <= 0 or p_amount_ore > v_balance then
    raise exception 'Presentkortets saldo (%) räcker inte till %', v_balance, p_amount_ore
      using errcode = 'check_violation';
  end if;

  /*
   * Mot vad som ÅTERSTÅR, inte mot hela notan.
   *
   * Jämförelsen gick förut mot `total_ore`. En order som redan hade en
   * betalning kunde därmed överbetalas med kortets saldo — och överskottet
   * fanns ingenstans att hämta, eftersom ett presentkort inte löses in mot
   * kontanter.
   */
  select coalesce(sum(amount_ore), 0) into v_paid
  from public.payments
  where order_id = p_order_id and status <> 'FAILED';

  v_due := v_order.total_ore - v_paid;

  if v_due <= 0 then
    raise exception 'Ordern är redan betald' using errcode = 'check_violation';
  end if;

  if p_amount_ore > v_due then
    raise exception 'Presentkortet kan inte betala mer än vad som återstår (%)', v_due
      using errcode = 'check_violation';
  end if;

  -- Inlösen är en BETALNING och inte en rabatt. Ordersumman rörs inte, och
  -- momsen räknas därmed fortfarande på hela notan.
  insert into public.payments (
    order_id, restaurant_id, amount_ore, provider, method, status,
    idempotency_key, captured_at, provider_payload
  )
  values (
    p_order_id, v_order.restaurant_id, p_amount_ore, 'GIFT_CARD', 'gift_card', 'CAPTURED',
    gen_random_uuid(), now(),
    jsonb_build_object('gift_card_id', v_card.id)
  )
  returning id into v_payment;

  insert into public.gift_card_transactions (
    gift_card_id, kind, amount_ore, order_id, payment_id
  )
  values (v_card.id, 'REDEEM', p_amount_ore, p_order_id, v_payment);

  return v_payment;
end;
$$;

revoke execute on function public.redeem_gift_card(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.redeem_gift_card(text, uuid, integer) to service_role;
