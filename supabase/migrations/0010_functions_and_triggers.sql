-- 0010 — Funktioner och triggers: statusmaskin, orderskapande, betygscache
--        och skydd mot efterhandsredigering.

-- ── Statusmaskinen ──────────────────────────────────────────────────────────
-- Samma regel som packages/core/src/order-status.ts. Koden finns för snabb
-- feedback i gränssnittet; DEN HÄR triggern är garantin. En order kan inte
-- hoppa från PLACED till COMPLETED ens om någon skriver direkt mot databasen.

create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
as $$
declare
  v_allowed public.order_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  -- Alla grenar måste ha samma typ, därför text[] hela vägen och en enda cast
  -- till slut. Blandas text[] och order_status[] i samma CASE vägrar Postgres
  -- att matcha typerna.
  v_allowed := (case old.status
    when 'DRAFT'     then array['PLACED', 'CANCELLED']
    when 'PLACED'    then array['ACCEPTED', 'CANCELLED']
    when 'ACCEPTED'  then array['PREPARING', 'CANCELLED', 'REFUNDED']
    when 'PREPARING' then array['READY', 'CANCELLED', 'REFUNDED']
    when 'READY'     then array['COMPLETED', 'REFUNDED']
    when 'COMPLETED' then array['REFUNDED']
    else array[]::text[]
  end)::public.order_status[];

  if not (new.status = any(v_allowed)) then
    raise exception 'Ordern kan inte gå från % till %. Tillåtna nästa steg: %',
      old.status, new.status,
      coalesce(nullif(array_to_string(v_allowed, ', '), ''), 'inga (slutläge)')
      using errcode = 'check_violation';
  end if;

  -- Tidsstämplarna sätts här i stället för i applikationen. Varje kodväg som
  -- ändrar status får dem då automatiskt, och ingen kan glömma bort det.
  new.placed_at    := coalesce(new.placed_at,    case when new.status = 'PLACED'    then now() end);
  new.accepted_at  := coalesce(new.accepted_at,  case when new.status = 'ACCEPTED'  then now() end);
  new.ready_at     := coalesce(new.ready_at,     case when new.status = 'READY'     then now() end);
  new.completed_at := coalesce(new.completed_at, case when new.status = 'COMPLETED' then now() end);
  new.cancelled_at := coalesce(new.cancelled_at, case when new.status = 'CANCELLED' then now() end);

  return new;
end;
$$;

create trigger orders_enforce_transition
  before update of status on public.orders
  for each row execute function public.enforce_order_status_transition();

-- Loggar varje statusändring till order_events (avsnitt 5.2).
create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_events (
      order_id, restaurant_id, event_type, from_status, to_status, actor_id, actor_kind
    )
    values (
      new.id, new.restaurant_id, 'STATUS_CHANGED', old.status, new.status,
      auth.uid(),
      case when auth.uid() is null then 'SYSTEM' else 'STAFF' end
    );
  end if;
  return new;
end;
$$;

create trigger orders_log_status_change
  after update of status on public.orders
  for each row execute function public.log_order_status_change();

-- ── Loggen är append-only ───────────────────────────────────────────────────
-- En logg som går att skriva om i efterhand bevisar ingenting. Blockeras på
-- tabellnivå, inte bara via saknad RLS-policy — service role kringgår RLS men
-- inte en trigger.

create or replace function public.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Rader i % är oföränderliga och kan varken ändras eller raderas.', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger order_events_immutable
  before update or delete on public.order_events
  for each row execute function public.reject_mutation();

create trigger loyalty_transactions_immutable
  before update or delete on public.loyalty_transactions
  for each row execute function public.reject_mutation();

-- ── place_order ─────────────────────────────────────────────────────────────
--
-- Skapar order, orderrader, tillval, avgiftsrad och första händelsen i EN
-- transaktion. Görs skrivningarna i följd från route handlern kan ett avbrott
-- mitt i lämna en order utan avgiftsrad — och då har Burp levererat en
-- beställning utan att ta betalt för den.
--
-- Priserna i payload är REDAN omräknade på servern av @burp/core. Funktionen
-- litar på dem därför att den bara nås via service role från route handlern,
-- aldrig direkt av en klient.

create or replace function public.place_order(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id       uuid;
  v_existing_id    uuid;
  v_item           jsonb;
  v_option         jsonb;
  v_order_item_id  uuid;
  v_restaurant_id  uuid := (p_payload->>'restaurant_id')::uuid;
  v_idempotency    uuid := (p_payload->>'idempotency_key')::uuid;
  v_status         public.order_status := (p_payload->>'status')::public.order_status;
begin
  -- Idempotens (avsnitt 12): samma nyckel ger samma order. Dubbeltryck på
  -- "Beställ" blir en order, inte två notor.
  select id into v_existing_id
  from public.orders
  where restaurant_id = v_restaurant_id and idempotency_key = v_idempotency;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.orders (
    restaurant_id, guest_id, table_id, table_session_id, type, status, note, scheduled_for,
    items_gross_ore, items_vat_ore, vat_by_rate, delivery_fee_ore, discount_ore,
    tip_ore, total_ore, idempotency_key, placed_at, accepted_at
  )
  values (
    v_restaurant_id,
    -- Null för anonym bordsbeställning. Det är hela poängen med QR-flödet att
    -- inget konto ska krävas.
    nullif(p_payload->>'guest_id', '')::uuid,
    nullif(p_payload->>'table_id', '')::uuid,
    nullif(p_payload->>'table_session_id', '')::uuid,
    (p_payload->>'type')::public.order_type,
    v_status,
    p_payload->>'note',
    nullif(p_payload->>'scheduled_for', '')::timestamptz,
    (p_payload->>'items_gross_ore')::integer,
    (p_payload->>'items_vat_ore')::integer,
    coalesce(p_payload->'vat_by_rate', '{}'::jsonb),
    (p_payload->>'delivery_fee_ore')::integer,
    (p_payload->>'discount_ore')::integer,
    (p_payload->>'tip_ore')::integer,
    (p_payload->>'total_ore')::integer,
    v_idempotency,
    now(),
    -- Statustriggern är BEFORE UPDATE och rör inte INSERT, så en order som
    -- auto-accepteras måste få sin tidsstämpel här.
    case when v_status = 'ACCEPTED' then now() end
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_payload->'lines')
  loop
    insert into public.order_items (
      order_id, restaurant_id, menu_item_id, name_snapshot,
      unit_price_ore, vat_rate_bps, quantity, line_gross_ore, note
    )
    values (
      v_order_id,
      v_restaurant_id,
      (v_item->>'menu_item_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'unit_price_ore')::integer,
      (v_item->>'vat_rate_bps')::integer,
      (v_item->>'quantity')::smallint,
      (v_item->>'line_gross_ore')::integer,
      v_item->>'note'
    )
    returning id into v_order_item_id;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb))
    loop
      insert into public.order_item_options (
        order_item_id, restaurant_id, option_id, name_snapshot, price_ore
      )
      values (
        v_order_item_id,
        v_restaurant_id,
        (v_option->>'option_id')::uuid,
        v_option->>'name_snapshot',
        (v_option->>'price_ore')::integer
      );
    end loop;
  end loop;

  insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore)
  values (
    v_order_id,
    v_restaurant_id,
    (p_payload->>'fee_base')::public.fee_base,
    (p_payload->>'fee_base_amount_ore')::integer,
    (p_payload->>'fee_bps')::integer,
    (p_payload->>'fee_ore')::integer
  );

  if (p_payload->>'tip_ore')::integer > 0 then
    insert into public.tips (order_id, restaurant_id, amount_ore)
    values (v_order_id, v_restaurant_id, (p_payload->>'tip_ore')::integer);
  end if;

  insert into public.order_events (
    order_id, restaurant_id, event_type, to_status, actor_kind, payload
  )
  values (
    v_order_id, v_restaurant_id, 'ORDER_PLACED',
    v_status,
    case when auth.uid() is null then 'GUEST' else 'STAFF' end,
    jsonb_build_object('total_ore', (p_payload->>'total_ore')::integer)
  );

  return v_order_id;
end;
$$;

-- Bara service role får anropa den. Fick `authenticated` göra det skulle en
-- gäst kunna skicka in valfria priser i payloaden.
revoke execute on function public.place_order(jsonb) from public, anon, authenticated;

comment on function public.place_order is
  'Skapar order + rader + avgift + logg i en transaktion. Anropas ENBART av route handlern med service role — priserna i payload är redan omräknade på servern.';

-- ── Recensioner ─────────────────────────────────────────────────────────────

-- Betyg går bara att lämna på en genomförd order (avsnitt 7). RLS-policyn
-- kollar samma sak men kan inte ge ett läsbart felmeddelande, och triggern
-- gäller även för service role.
create or replace function public.enforce_review_on_completed_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
begin
  select status into v_status from public.orders where id = new.order_id;

  if v_status is distinct from 'COMPLETED' then
    raise exception 'Betyg kan bara lämnas på en genomförd order (ordern har status %).', v_status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger reviews_require_completed_order
  before insert on public.reviews
  for each row execute function public.enforce_review_on_completed_order();

-- Restaurangen får svara, inte skriva om betyget. RLS släpper in personalen på
-- raden; den här triggern begränsar vad de får ändra.
create or replace function public.restrict_review_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.user_id is not distinct from old.user_id
     and auth.uid() <> coalesce(old.user_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    -- Uppdateringen kommer från personal, inte från gästen själv.
    if new.rating_food    is distinct from old.rating_food
       or new.rating_service  is distinct from old.rating_service
       or new.rating_delivery is distinct from old.rating_delivery
       or new.comment         is distinct from old.comment then
      raise exception 'Restaurangen kan svara på ett omdöme men inte ändra betyget eller texten.'
        using errcode = 'insufficient_privilege';
    end if;

    if new.response is distinct from old.response then
      new.responded_at := now();
      new.responded_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

create trigger reviews_restrict_response
  before update on public.reviews
  for each row execute function public.restrict_review_response();

-- Cachar snittbetyget på restaurangen (avsnitt 7). En sökträff får inte kosta
-- en aggregering över alla recensioner.
create or replace function public.refresh_restaurant_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  -- NEW är oåtkomlig i en DELETE-trigger och OLD i en INSERT-trigger. Att läsa
  -- fel av dem kastar i plpgsql, därför grenas det på TG_OP i stället för att
  -- coalesce:a över båda.
  if tg_op = 'DELETE' then
    v_restaurant_id := old.restaurant_id;
  else
    v_restaurant_id := new.restaurant_id;
  end if;

  update public.restaurants r
  set rating_average = sub.avg_rating,
      rating_count   = sub.cnt
  from (
    select round(avg(rating_food)::numeric, 1) as avg_rating,
           count(*)                            as cnt
    from public.reviews
    where restaurant_id = v_restaurant_id and is_published
  ) sub
  where r.id = v_restaurant_id;

  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_restaurant_rating();
