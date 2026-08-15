-- 0018 — Gästen ändrar sin order (avsnitt 5.2).
--
-- Reglerna för vad gästen får ändra har funnits sedan migration 0002
-- (`restaurants.order_policy`) och logiken i @burp/core sedan början. Men
-- ingenting anropade den: en restaurang kunde ställa in ändringsfönster och
-- vilka ändringar som tilläts, och ingen av inställningarna hade någon verkan.
--
-- Funktionerna nedan är den saknade delen. De körs som SECURITY DEFINER
-- eftersom en anonym bordsgäst inte har någon `auth.uid()` att skriva en policy
-- mot — legitimeringen sker i stället i route handlern, som verifierar
-- bordssessionen eller gästens konto innan den anropar.

/*
 * Räknar om ordersummorna ur de rader som finns kvar.
 *
 * Priset räknas ALDRIG om från menyn här. Orderraderna bär sin ögonblicksbild
 * av namn och pris, och den ska gälla — ändras menypriset mellan beställning
 * och ändring ska gästen inte plötsligt betala det nya priset för mat hen redan
 * beställt.
 */
create or replace function public.recalculate_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_gross bigint;
  v_vat_by_rate jsonb;
  v_items_vat   bigint;
  v_order       public.orders%rowtype;
  v_fee         public.fees%rowtype;
  v_base        bigint;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Ordern finns inte.' using errcode = 'no_data_found';
  end if;

  select coalesce(sum(line_gross_ore), 0) into v_items_gross
  from public.order_items where order_id = p_order_id;

  -- Momsen bryts ut per sats, precis som vid beställningen. En order kan blanda
  -- 12 % mat och 25 % alkohol och bokföringen behöver dem åtskilda.
  select coalesce(
    jsonb_object_agg(rate::text, amount),
    '{}'::jsonb
  ), coalesce(sum(amount), 0)
  into v_vat_by_rate, v_items_vat
  from (
    select
      vat_rate_bps as rate,
      sum(line_gross_ore - round(line_gross_ore * 10000.0 / (10000 + vat_rate_bps)))::bigint as amount
    from public.order_items
    where order_id = p_order_id
    group by vat_rate_bps
  ) per_rate;

  update public.orders
  set items_gross_ore = v_items_gross,
      items_vat_ore   = v_items_vat,
      vat_by_rate     = v_vat_by_rate,
      total_ore       = greatest(0, v_items_gross + delivery_fee_ore + discount_ore + tip_ore)
  where id = p_order_id;

  -- Avgiften följer med. Räknas den inte om tar Burp betalt för mat som togs
  -- bort ur ordern — och det upptäcks först i restaurangens bokföring.
  select * into v_fee from public.fees where order_id = p_order_id;

  if found then
    v_base := case v_fee.base
      when 'GROSS_ITEMS' then greatest(0, v_items_gross + v_order.discount_ore)
      when 'NET_ITEMS'   then greatest(0, v_items_gross + v_order.discount_ore - v_items_vat)
      when 'GROSS_TOTAL' then greatest(0, v_items_gross + v_order.discount_ore + v_order.delivery_fee_ore)
    end;

    update public.fees
    set base_amount_ore = v_base,
        fee_ore = round(v_base * v_fee.bps / 10000.0)
    where order_id = p_order_id;
  end if;
end;
$$;

comment on function public.recalculate_order_totals is
  'Räknar om summor och Burps avgift ur kvarvarande orderrader. Priset tas ur radernas ögonblicksbild, aldrig ur menyn — ett menypris som ändrats ska inte träffa en order som redan lagts.';

/*
 * Tar bort en rad ur en lagd order.
 *
 * Sista raden går inte att ta bort. En order utan innehåll är inte en ändrad
 * order utan en avbruten, och den skillnaden ska gästen göra medvetet — annars
 * står köket med en tom nota som ingen avbokat.
 */
create or replace function public.remove_order_item(
  p_order_id uuid,
  p_item_id  uuid,
  p_actor    text default 'GUEST'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
  v_name      text;
  v_rest_id   uuid;
begin
  select o.restaurant_id into v_rest_id
  from public.orders o where o.id = p_order_id;

  if v_rest_id is null then
    raise exception 'Ordern finns inte.' using errcode = 'no_data_found';
  end if;

  select name_snapshot into v_name
  from public.order_items
  where id = p_item_id and order_id = p_order_id;

  if v_name is null then
    raise exception 'Raden hör inte till ordern.' using errcode = 'no_data_found';
  end if;

  select count(*) into v_remaining from public.order_items where order_id = p_order_id;

  if v_remaining <= 1 then
    raise exception 'Sista raden kan inte tas bort. Avbryt ordern i stället.'
      using errcode = 'check_violation';
  end if;

  delete from public.order_items where id = p_item_id;

  perform public.recalculate_order_totals(p_order_id);

  -- Varje ändring gästen gör skrivs till loggen. Det ska alltid gå att se vem
  -- som ändrade vad och när (avsnitt 5.2).
  insert into public.order_events (order_id, restaurant_id, event_type, actor_id, actor_kind, payload)
  values (
    p_order_id, v_rest_id, 'ITEM_REMOVED', auth.uid(),
    case when p_actor = 'STAFF' then 'STAFF' else 'GUEST' end,
    jsonb_build_object('name', v_name)
  );
end;
$$;

revoke execute on function public.recalculate_order_totals(uuid) from public, anon, authenticated;
revoke execute on function public.remove_order_item(uuid, uuid, text) from public, anon, authenticated;

/*
 * Och GE rättigheten till service_role.
 *
 * Migration 0012 delade ut execute på alla funktioner som fanns DÅ. Nya
 * funktioner ärver ingenting av det, och `revoke ... from public` tar bort den
 * implicita rättighet alla annars har. Utan raden nedan svarar route handlern
 * "permission denied for function remove_order_item" — vilket den också gjorde
 * tills det upptäcktes.
 */
grant execute on function public.recalculate_order_totals(uuid) to service_role;
grant execute on function public.remove_order_item(uuid, uuid, text) to service_role;

comment on function public.remove_order_item is
  'Tar bort en orderrad och räknar om summan. Sista raden vägras — en tom order är en avbruten order, och den skillnaden ska gästen göra medvetet.';
