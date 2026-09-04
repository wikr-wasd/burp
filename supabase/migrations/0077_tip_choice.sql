-- 0077 — Dricksen bär hur gästen valde, inte bara vad det blev.
--
-- `tips` har haft tre kolumner sedan migration 0006 som ingenting någonsin
-- skrivit: `chosen_as`, `chosen_bps` och `given_after_meal`. Varje dricksrad
-- har alltså burit standardvärdet 'AMOUNT' och ett tomt `chosen_bps`, oavsett
-- att gästen tryckte på "10 %".
--
-- Det är ett skal i samma mening som `item_availability` var det: en kolumn
-- som lästes av ingen och skrevs av ingen. Hittad 2026-09-04 genom att svepa
-- varje kolumn i schemat mot appkoden.
--
-- ── Varför det är värt att spara ────────────────────────────────────────────
--
-- Restaurangen väljer själv vilka dricksknappar som visas. Utan `chosen_bps`
-- går det inte att svara på om gästerna faktiskt trycker på dem — och en
-- knapprad ingen använder är en knapprad som borde se annorlunda ut.
--
-- ── Varför inte räkna fram procenten i efterhand ────────────────────────────
--
-- Därför att det vore en GISSNING. 10 % av 12,50 KM avrundas till 1,25, och
-- baklänges blir det 1000 baspunkter — men 1,25 kan lika gärna vara ett belopp
-- gästen skrev in själv. En härledd "valde procent" är inte samma sak som att
-- veta det, och skillnaden syns först när någon fattar ett beslut på siffran.
--
-- ── Vad som INTE ändras ─────────────────────────────────────────────────────
--
-- Beloppet. `tip_ore` kommer som förut från klienten — dricks är gästens egna
-- pengar och kan inte härledas ur menyn (regel 2 gäller priser, inte gåvor).
-- Servern kontrollerar att procenten och beloppet hör ihop innan metadatan
-- sparas; stämmer de inte lagras valet som AMOUNT, vilket är sanningen.
--
-- Funktionen nedan är den levande `place_order` ur migration 0026, ordagrant,
-- med dricksraden utbytt. Den klipptes ut programmatiskt och inte avskriven:
-- en avskrift av 115 rader ordercreering för att ändra en insert är hur två
-- versioner uppstår som skiljer sig på en rad ingen minns.

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
    -- Ett utkast är inte lagt. Tidpunkten sätts av statustriggern när
    -- betalningen bekräftas.
    case when v_status <> 'DRAFT' then now() end,
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
    -- Hur gästen valde, och inte bara vad det blev. Kolumnerna fanns sedan
    -- migration 0006 och skrevs av ingen; se migrationens inledning.
    insert into public.tips
      (order_id, restaurant_id, amount_ore, chosen_as, chosen_bps, given_after_meal)
    values (
      v_order_id,
      v_restaurant_id,
      (p_payload->>'tip_ore')::integer,
      coalesce(p_payload->>'tip_chosen_as', 'AMOUNT'),
      (p_payload->>'tip_chosen_bps')::integer,
      -- Dricks som ges vid beställningen är per definition före måltiden.
      -- Kassan, som tar emot dricks efteråt, skriver sin egen rad.
      false
    );
  end if;

  insert into public.order_events (
    order_id, restaurant_id, event_type, to_status, actor_kind, payload
  )
  values (
    v_order_id, v_restaurant_id,
    case when v_status = 'DRAFT' then 'ORDER_DRAFTED' else 'ORDER_PLACED' end,
    v_status,
    case when auth.uid() is null then 'GUEST' else 'STAFF' end,
    jsonb_build_object('total_ore', (p_payload->>'total_ore')::integer)
  );

  return v_order_id;
end;
$$;

revoke execute on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;

comment on function public.place_order is
  'Skapar order, rader, tillval, avgift, dricks och händelselogg i EN transaktion. Dricksraden bär sedan 0077 hur gästen valde.';

/**
 * Vad gästerna faktiskt trycker på.
 *
 * Den läsande halvan av den här migrationen. Utan den hade `chosen_bps` bara
 * bytt sorts skal: skriven av någon, läst av ingen.
 *
 * En rad per procentsats, den vanligaste först, plus en rad för dricks som
 * gavs som belopp (`chosen_bps` null). Restaurangen väljer själv vilka
 * dricksknappar som visas — det här är svaret på om någon trycker på dem.
 */
create or replace function public.restaurant_tip_choices(
  p_restaurant_id uuid,
  p_from          timestamptz,
  p_to            timestamptz
)
returns table (chosen_bps integer, tips integer, amount_ore bigint)
language sql
stable
security definer
set search_path = public
as $$
  select t.chosen_bps,
         count(*)::integer,
         sum(t.amount_ore)::bigint
  from public.tips t
  where t.restaurant_id = p_restaurant_id
    and t.created_at >= p_from
    and t.created_at < p_to
    -- Släppt dricks är personalens pengar som gick tillbaka. Den hör inte
    -- hemma i en fråga om vad gästerna väljer — se regel 8.
    and t.released_at is null
  group by t.chosen_bps
  order by count(*) desc, t.chosen_bps nulls last;
$$;

revoke execute on function public.restaurant_tip_choices(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.restaurant_tip_choices(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

comment on function public.restaurant_tip_choices is
  'Vilka dricksval gästerna gjorde i perioden. Null chosen_bps = eget belopp.';
