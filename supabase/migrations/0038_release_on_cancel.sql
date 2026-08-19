-- 0038 — En avbruten order lämnar tillbaka det den tog.
--
-- En kortorder skapas som utkast, förbrukar allt gästen valt att använda, och
-- lyfts först när betalningen bekräftats. Går betalningen inte igenom avbryts
-- ordern — men ingenting lämnade tillbaka det den hunnit ta:
--
--   * **Kupongen var använd.** En kod med gräns per gäst var slut för gott,
--     trots att gästen aldrig fick någon mat.
--   * **Klippkortet var uttaget.** Tio besök blev till ingenting.
--   * **Presentkortet var tömt.** Värdet var borta.
--
-- Det räcker inte att rätta det i route handlern. Ordern kan avbrytas av
-- webhooken när ett kort nekas, av gästen själv via `PATCH /api/orders/:id`, av
-- personalen i orderlistan, eller av kupongvägen när koden hann ta slut. Fyra
-- vägar, och den femte kommer att skrivas av någon som inte läst det här.
--
-- Därför en trigger. Regeln hör till ordern och inte till den som avbryter den.

-- ── Något som gick att ångra ────────────────────────────────────────────────
--
-- Loggarna är append-only, och det ska de förbli: en inlösen som går att radera
-- är ingen gräns. Raden står därför kvar och får en tidpunkt i stället —
-- historiken visar att kupongen användes OCH att den lämnades tillbaka.

alter table public.coupon_redemptions
  add column released_at timestamptz;

alter table public.punch_card_redemptions
  add column released_at timestamptz;

comment on column public.coupon_redemptions.released_at is
  'Satt när ordern avbröts och kupongen lämnades tillbaka. Släppta rader räknas inte mot upplagan eller gränsen per gäst.';

comment on column public.punch_card_redemptions.released_at is
  'Satt när ordern avbröts och belöningen lämnades tillbaka. Släppta rader räknas inte som uttagna.';

-- ── Loggarna får ändras på exakt ett sätt ───────────────────────────────────
--
-- `reject_mutation` blockerade all UPDATE. Samma mönster som betalningarna
-- använder sedan 0026 i stället: en vakt som släpper igenom det enda fältet som
-- ska kunna ändras och stoppar allt annat. Att öppna hela raden hade gjort
-- loggen till något som går att skriva om.

create or replace function public.guard_redemption_release()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Rader i % raderas aldrig. En inlösen som går att radera är ingen gräns.',
      tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  -- Bara en gång: en kupong kan inte lämnas tillbaka två gånger.
  if old.released_at is not null then
    raise exception 'Rader i % kan bara lämnas tillbaka en gång', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * Allt utom `released_at` måste vara oförändrat.
   *
   * Jämförelsen görs på hela raden och inte kolumn för kolumn. En uppräkning
   * skyddar bara de fält någon kom ihåg att skriva ned — och nästa kolumn som
   * läggs till blir oskyddad utan att någon märker det. Den här varianten
   * skyddar den automatiskt.
   */
  if (to_jsonb(new) - 'released_at') is distinct from (to_jsonb(old) - 'released_at') then
    raise exception 'Rader i % kan bara märkas som återlämnade, inget annat', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger coupon_redemptions_immutable on public.coupon_redemptions;
drop trigger punch_card_redemptions_immutable on public.punch_card_redemptions;

create trigger coupon_redemptions_guard
  before update or delete on public.coupon_redemptions
  for each row execute function public.guard_redemption_release();

create trigger punch_card_redemptions_guard
  before update or delete on public.punch_card_redemptions
  for each row execute function public.guard_redemption_release();

-- Släppta rader räknas inte. Indexen speglar frågorna nedan.
create index coupon_redemptions_active_idx
  on public.coupon_redemptions (coupon_id) where released_at is null;

create index punch_card_redemptions_active_idx
  on public.punch_card_redemptions (restaurant_id, guest_id) where released_at is null;

-- ── Lämna tillbaka ──────────────────────────────────────────────────────────

create or replace function public.release_order_holds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_card_id uuid;
begin
  update public.coupon_redemptions
  set released_at = now()
  where order_id = new.id and released_at is null;

  update public.punch_card_redemptions
  set released_at = now()
  where order_id = new.id and released_at is null;

  /*
   * Presentkortet skrivs upp igen.
   *
   * Samma väg som en riktig återbetalning tar (0037): en REFUND-rad i loggen.
   * Saldot räknas ur den och lagras aldrig, så det är allt som behövs.
   *
   * Betalningen markeras som återbetald, annars ser ordern ut att vara betald
   * trots att den är avbruten — och `confirm_order_payment` skulle räkna med
   * pengarna om ordern på något vis väcktes igen.
   */
  for v_payment in
    select * from public.payments
    where order_id = new.id
      and provider = 'GIFT_CARD'
      and status = 'CAPTURED'
  loop
    v_card_id := nullif(v_payment.provider_payload ->> 'gift_card_id', '')::uuid;

    if v_card_id is null then
      raise warning 'Betalning % saknar gift_card_id — värdet kunde inte lämnas tillbaka',
        v_payment.id;
    else
      insert into public.gift_card_transactions (
        gift_card_id, kind, amount_ore, order_id, payment_id
      )
      values (v_card_id, 'REFUND', v_payment.amount_ore, new.id, v_payment.id);

      update public.payments set status = 'REFUNDED' where id = v_payment.id;
    end if;
  end loop;

  return null;
end;
$$;

create trigger orders_release_holds
  after update of status on public.orders
  for each row
  when (new.status = 'CANCELLED' and old.status is distinct from 'CANCELLED')
  execute function public.release_order_holds();

comment on function public.release_order_holds is
  'Lämnar tillbaka kupong, klippkort och presentkortsvärde när en order avbryts. Trigger och inte anropande kod: ordern kan avbrytas från fyra håll, och det femte är inte skrivet än.';

-- ── Räkningarna hoppar över det som lämnats tillbaka ────────────────────────

create or replace function public.redeem_coupon(
  p_coupon_id    uuid,
  p_order_id     uuid,
  p_guest_id     uuid,
  p_discount_ore integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons%rowtype;
  v_order  public.orders%rowtype;
  v_total  integer;
  v_guest  integer;
begin
  select * into v_coupon from public.coupons where id = p_coupon_id for update;
  if not found then
    raise exception 'Okänd kupong %', p_coupon_id using errcode = 'no_data_found';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Okänd order %', p_order_id using errcode = 'no_data_found';
  end if;

  if v_coupon.restaurant_id is not null and v_coupon.restaurant_id <> v_order.restaurant_id then
    raise exception 'Kupongen gäller inte hos den här restaurangen'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_total
  from public.coupon_redemptions
  where coupon_id = p_coupon_id and released_at is null;

  if v_coupon.max_redemptions is not null and v_total >= v_coupon.max_redemptions then
    raise exception 'Kupongen är slut' using errcode = 'check_violation';
  end if;

  if v_coupon.max_per_guest > 0 then
    if p_guest_id is null then
      raise exception 'Kupongen kräver ett konto' using errcode = 'check_violation';
    end if;

    select count(*) into v_guest
    from public.coupon_redemptions
    where coupon_id = p_coupon_id and guest_id = p_guest_id and released_at is null;

    if v_guest >= v_coupon.max_per_guest then
      raise exception 'Gästen har redan använt kupongen' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.coupon_redemptions (
    coupon_id, order_id, restaurant_id, guest_id, discount_ore
  )
  values (p_coupon_id, p_order_id, v_order.restaurant_id, p_guest_id, p_discount_ore);
end;
$$;

revoke execute on function public.redeem_coupon(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.redeem_coupon(uuid, uuid, uuid, integer) to service_role;

create or replace function public.punch_card_status(
  p_restaurant_id uuid,
  p_guest_id      uuid
)
returns table (
  size             smallint,
  completed_orders bigint,
  rewards_redeemed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.punch_card_size,
    (
      select count(*)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.guest_id = p_guest_id
        and o.status = 'COMPLETED'
    ),
    (
      select count(*)
      from public.punch_card_redemptions p
      where p.restaurant_id = p_restaurant_id
        and p.guest_id = p_guest_id
        and p.released_at is null
    )
  from public.restaurants r
  where r.id = p_restaurant_id;
$$;

revoke execute on function public.punch_card_status(uuid, uuid) from public, anon;
grant execute on function public.punch_card_status(uuid, uuid) to authenticated, service_role;

create or replace function public.redeem_punch_card(
  p_restaurant_id uuid,
  p_guest_id      uuid,
  p_order_id      uuid,
  p_reward_ore    integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size      smallint;
  v_completed bigint;
  v_redeemed  bigint;
  v_row_id    bigint;
begin
  if p_guest_id is null then
    raise exception 'Klippkort kräver ett konto' using errcode = 'check_violation';
  end if;

  select punch_card_size into v_size
  from public.restaurants
  where id = p_restaurant_id
  for share;

  if v_size is null then
    raise exception 'Restaurangen har inget klippkort' using errcode = 'check_violation';
  end if;

  perform 1
  from public.punch_card_redemptions
  where restaurant_id = p_restaurant_id and guest_id = p_guest_id
  for update;

  select count(*) into v_completed
  from public.orders
  where restaurant_id = p_restaurant_id
    and guest_id = p_guest_id
    and status = 'COMPLETED';

  select count(*) into v_redeemed
  from public.punch_card_redemptions
  where restaurant_id = p_restaurant_id
    and guest_id = p_guest_id
    and released_at is null;

  if v_completed - v_redeemed * v_size < v_size then
    raise exception 'Klippkortet är inte fullt (% besök, % uttagna belöningar)',
      v_completed, v_redeemed
      using errcode = 'check_violation';
  end if;

  insert into public.punch_card_redemptions (
    restaurant_id, guest_id, order_id, size, reward_ore
  )
  values (p_restaurant_id, p_guest_id, p_order_id, v_size, greatest(0, p_reward_ore))
  returning id into v_row_id;

  return v_row_id;
end;
$$;

revoke execute on function public.redeem_punch_card(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.redeem_punch_card(uuid, uuid, uuid, integer) to service_role;
