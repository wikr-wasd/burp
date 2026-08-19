-- 0031 — Klippkort: tionde besöket bjuder restaurangen på.
--
-- En annan mekanik än lojalitetspoängen, och de ska inte blandas ihop. Poäng
-- räknar KRONOR — den som äter dyrt tjänar snabbare. Ett klippkort räknar
-- BESÖK: tio gånger är tio gånger, oavsett om det var en kaffe eller en
-- trerätters. Det är därför det fungerar på ett ställe man går till ofta.
--
-- ANTALET LAGRAS ALDRIG. Det är en count(*) över gästens slutförda order hos
-- restaurangen, av samma skäl som lojalitetssaldot inte lagras (regel 7).
--
-- Fungerar bara för inloggade gäster. En anonym QR-gäst går inte att räkna
-- besök på och SKA inte gå att räkna besök på — annars vore klippkortet ett
-- skäl att spåra den som valt att inte ha konto.
--
-- ── Varför inte i loyalty_transactions ──────────────────────────────────────
--
-- Planen sa att belöningen skulle bli en rad där. Schemat säger nej, och det av
-- goda skäl: tabellen saknar `restaurant_id` (den hänger på kontot, som kan
-- vara Burps globala) och har `check (points <> 0)`. En klippkortsbelöning
-- kostar noll poäng — den är inte en poänginlösen.
--
-- Att böja poängloggen för att få in något som inte är poäng hade gjort båda
-- svårare att lita på. Egen tabell i stället, med samma egenskaper: append-only
-- och en rad per uttag.

-- ── Restaurangens kort ──────────────────────────────────────────────────────

alter table public.restaurants
  add column punch_card_size smallint check (punch_card_size between 2 and 50);

comment on column public.restaurants.punch_card_size is
  'Antal besök för en gratis måltid. Null = avstängt. Ett kort på ett besök är inget kort, därav minst 2.';

-- Vad belöningen är värd. Null = hela nästa order, vilket är det rubriken
-- lovar. Ett tak finns för den restaurang som vill bjuda på en måltid men inte
-- på ett sällskap som beställer för hela kvällen.
alter table public.restaurants
  add column punch_card_max_reward_ore integer check (punch_card_max_reward_ore > 0);

comment on column public.restaurants.punch_card_max_reward_ore is
  'Tak för klippkortsbelöningen. Null = hela ordern bjuds.';

-- ── Uttagen ─────────────────────────────────────────────────────────────────
--
-- Vem som bekostar belöningen står på raden. Öppen fråga 3 är fortfarande
-- obesvarad i sin helhet, men klippkortet kan inte byggas utan ett svar för
-- just det: rubriken säger "bjuder restaurangen på", och det är utgångsläget.
-- Med kolumnen på raden kan svaret bli ett annat utan att historiken skrivs om.

create type public.reward_funder as enum ('BURP', 'RESTAURANT');

create table public.punch_card_redemptions (
  id             bigint generated always as identity primary key,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  guest_id       uuid not null references auth.users(id) on delete cascade,
  order_id       uuid not null references public.orders(id) on delete restrict,

  -- Kortets storlek när belöningen togs ut. Ändrar restaurangen från tio till
  -- åtta ska gamla uttag fortfarande gå att förstå — samma skäl som `fees`
  -- sparar bas och procentsats per rad.
  size           smallint not null check (size between 2 and 50),
  /** Vad gästen faktiskt slapp betala. */
  reward_ore     integer not null check (reward_ore >= 0),
  funded_by      public.reward_funder not null default 'RESTAURANT',

  redeemed_at    timestamptz not null default now()
);

-- En belöning per order. Dubbeltryck ska inte ge två gratismåltider.
create unique index punch_card_redemptions_order_key
  on public.punch_card_redemptions (order_id);

create index punch_card_redemptions_guest_idx
  on public.punch_card_redemptions (restaurant_id, guest_id, redeemed_at desc);

-- Append-only. En logg man kan skriva om är ingen gräns — och den här är det
-- enda som säger hur många belöningar gästen redan tagit ut.
create trigger punch_card_redemptions_immutable
  before update or delete on public.punch_card_redemptions
  for each row execute function public.reject_mutation();

alter table public.punch_card_redemptions enable row level security;

create policy punch_card_redemptions_select_own on public.punch_card_redemptions
  for select to authenticated
  using (guest_id = auth.uid());

create policy punch_card_redemptions_select_staff on public.punch_card_redemptions
  for select to authenticated
  using (
    public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

create policy punch_card_redemptions_select_platform on public.punch_card_redemptions
  for select to authenticated
  using (public.is_platform_admin());

-- Ingen INSERT-policy. Raden skrivs av `redeem_punch_card()` med service role, i
-- samma transaktion som räkningen. En gäst som kunde skriva raden själv kunde
-- också skriva tio.

comment on table public.punch_card_redemptions is
  'En rad per uttagen klippkortsbelöning. Antalet besök lagras aldrig — det räknas ur orders. Se docs/OPEN-QUESTIONS.md fråga 3 om funded_by.';

-- ── Räkningen ───────────────────────────────────────────────────────────────
--
-- En funktion och inte en vy: den ska gå att anropa för EN gäst hos EN
-- restaurang utan att räkna om något för alla andra.

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
    )
  from public.restaurants r
  where r.id = p_restaurant_id;
$$;

revoke execute on function public.punch_card_status(uuid, uuid) from public, anon;
grant execute on function public.punch_card_status(uuid, uuid) to authenticated, service_role;

comment on function public.punch_card_status is
  'Klippkortets läge för en gäst hos en restaurang. Räknar order och uttagna belöningar — lagrar ingetdera.';

-- ── Lösa ut belöningen ──────────────────────────────────────────────────────
--
-- Räkningen måste ske under lås i samma transaktion som raden skrivs. Två
-- samtidiga beställningar från samma konto skulle annars kunna lösa ut samma
-- belöning två gånger, och restaurangen bjuda på två måltider för tio besök.

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

  -- Låser restaurangen så att storleken inte kan ändras mitt i räkningen.
  select punch_card_size into v_size
  from public.restaurants
  where id = p_restaurant_id
  for share;

  if v_size is null then
    raise exception 'Restaurangen har inget klippkort' using errcode = 'check_violation';
  end if;

  /*
   * Låset som gör två samtidiga uttag omöjliga.
   *
   * `for update` på en rad som kanske inte finns låser ingenting, och därför
   * låses gästens tidigare uttag i stället — finns inga är det unika indexet på
   * order_id sista utvägen, och två beställningar kan ändå inte ha samma order.
   */
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
  where restaurant_id = p_restaurant_id and guest_id = p_guest_id;

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

comment on function public.redeem_punch_card is
  'Löser ut en klippkortsbelöning under lås. Två samtidiga beställningar från samma konto får inte lösa ut samma belöning två gånger.';
