-- 0030 — Presentkort, giltiga hos EN restaurang.
--
-- ⚠️ JURIDIK FÖRST. Förbetalt värde som går att lösa in var som helst är
-- utgivning av elektroniska pengar och kräver tillstånd i Bosnien, Kroatien och
-- Serbien var för sig. Ett kort som bara går att använda hos utgivaren faller
-- normalt under undantaget för begränsade nätverk — men "normalt" är inte ett
-- juridiskt besked. Kontrollera per land innan presentkort säljs skarpt.
--
-- Spärren som hela konstruktionen vilar på är `restaurant_id not null` plus
-- kontrollen i `redeem_gift_card()`. Den dagen någon vill göra korten
-- plattformsbreda är det inte en schemaändring utan ett tillståndsärende.
--
-- Ett presentkort är BETALMEDEL, inte rabatt. Det sänker vad som återstår att
-- debitera, aldrig ordersumman: momsen och Burps avgiftsunderlag räknas på hela
-- notan även när halva betalas med kort. En inlösen blir därför en rad i
-- `payments` med `provider = 'GIFT_CARD'`, inte ett avdrag i `orders`.

create type public.gift_card_kind as enum ('ISSUE', 'REDEEM', 'REFUND');

create table public.gift_cards (
  id               uuid primary key default gen_random_uuid(),

  -- Inte null, och det är hela poängen.
  restaurant_id    uuid not null references public.restaurants(id) on delete restrict,

  -- Koden lagras i klartext, med flit.
  --
  -- En hash hade varit rätt för ett lösenord men fel här: personalen måste
  -- kunna slå upp ett kort en gäst tappat bort, och supporten måste kunna se
  -- vilket kort en tvist gäller. Koden är inte en identitet — den är ett
  -- värdepapper med begränsat belopp hos en enda restaurang, och den som har
  -- den har rätt att använda den. Skyddet är i stället kodrymden (2^60) och
  -- att inlösen bara går att göra mot en order hos utgivaren.
  code             text not null,

  currency         public.currency_code not null,

  expires_at       timestamptz,
  is_active        boolean not null default true,

  -- Vem det köptes till. Frivilligt: ett presentkort ges bort, och den som
  -- köper det vet inte alltid vem som ska använda det.
  issued_to_email  text,
  note             text,

  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Koden är unik i hela plattformen och inte per restaurang. Två restauranger
-- med samma kod hade betytt att gästen måste veta vilken hon står i för att
-- koden ska betyda något — och det vet hon inte när hon läser den högt.
create unique index gift_cards_code_key on public.gift_cards (code);

create index gift_cards_restaurant_idx on public.gift_cards (restaurant_id, created_at desc);

create trigger gift_cards_touch before update on public.gift_cards
  for each row execute function public.touch_updated_at();

-- Kortets valuta måste vara restaurangens, av samma skäl som betalkontots.
create or replace function public.enforce_gift_card_currency()
returns trigger
language plpgsql
as $$
declare
  v_currency public.currency_code;
begin
  select currency into v_currency from public.restaurants where id = new.restaurant_id;

  if v_currency is distinct from new.currency then
    raise exception 'Presentkortets valuta (%) måste vara restaurangens (%)',
      new.currency, v_currency
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger gift_cards_currency
  before insert or update on public.gift_cards
  for each row execute function public.enforce_gift_card_currency();

-- ── Transaktionsloggen ──────────────────────────────────────────────────────
--
-- SALDOT LAGRAS ALDRIG (regel 7). Det summeras ur raderna nedan. Ett lagrat
-- saldo kan hamna i otakt med sina transaktioner; en summa över loggen kan det
-- inte.
--
-- Beloppet är alltid positivt. Tecknet följer av `kind` — en negativ ISSUE
-- hade varit ett andra sätt att uttrycka en inlösen, och två sätt glider isär.

create table public.gift_card_transactions (
  id             bigint generated always as identity primary key,
  gift_card_id   uuid not null references public.gift_cards(id) on delete restrict,
  kind           public.gift_card_kind not null,
  amount_ore     integer not null check (amount_ore > 0),

  -- Satt för REDEEM och REFUND, null för ISSUE.
  order_id       uuid references public.orders(id) on delete restrict,
  payment_id     uuid references public.payments(id) on delete set null,

  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index gift_card_transactions_card_idx
  on public.gift_card_transactions (gift_card_id, created_at);

create index gift_card_transactions_order_idx
  on public.gift_card_transactions (order_id) where order_id is not null;

-- En inlösen per kort och order. Dubbeltryck ska inte kunna dra saldot två
-- gånger, och spärren hör hemma i databasen och inte i gränssnittet.
create unique index gift_card_transactions_redeem_key
  on public.gift_card_transactions (gift_card_id, order_id)
  where kind = 'REDEEM';

-- Loggen är oföränderlig. Samma princip som order_events och
-- loyalty_transactions: en logg man kan skriva om bevisar ingenting, och här
-- är den dessutom det enda som säger vad kortet är värt.
create trigger gift_card_transactions_immutable
  before update or delete on public.gift_card_transactions
  for each row execute function public.reject_mutation();

-- ── Saldot ──────────────────────────────────────────────────────────────────

create or replace function public.gift_card_balance(p_gift_card_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(
    sum(case when kind = 'REDEEM' then -amount_ore else amount_ore end),
    0
  )::integer
  from public.gift_card_transactions
  where gift_card_id = p_gift_card_id;
$$;

comment on function public.gift_card_balance is
  'Saldot räknat ur loggen. Lagras aldrig — samma skäl som lojalitetssaldot (regel 7).';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.gift_cards enable row level security;
alter table public.gift_card_transactions enable row level security;

-- Ingen SELECT för gäster. Ett presentkort slås upp på sin kod av servern, ett
-- i taget — en läsbar tabell hade varit en lista över värdepapper.
create policy gift_cards_select_staff on public.gift_cards
  for select to authenticated
  using (
    public.has_role_at(restaurant_id, array['owner', 'manager', 'staff']::public.staff_role[])
  );

create policy gift_cards_select_platform on public.gift_cards
  for select to authenticated
  using (public.is_platform_admin());

-- Ägare och chef ger ut. Servitören ser korten — hon måste kunna svara på
-- "hur mycket är kvar" över disk — men ger inte ut nya.
create policy gift_cards_insert_staff on public.gift_cards
  for insert to authenticated
  with check (
    public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

-- Spärrning sker med `is_active`, inte med delete: transaktionerna pekar på
-- kortet och FK:n är `restrict`.
create policy gift_cards_update_staff on public.gift_cards
  for update to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy gift_card_transactions_select_staff on public.gift_card_transactions
  for select to authenticated
  using (
    exists (
      select 1 from public.gift_cards c
      where c.id = gift_card_transactions.gift_card_id
        and public.has_role_at(
          c.restaurant_id,
          array['owner', 'manager', 'staff']::public.staff_role[]
        )
    )
  );

create policy gift_card_transactions_select_platform on public.gift_card_transactions
  for select to authenticated
  using (public.is_platform_admin());

-- Ingen INSERT-policy. Rader skrivs av funktionerna nedan med service role, i
-- samma transaktion som saldot räknas. En anställd som kunde skriva raden
-- direkt kunde också skriva en ISSUE på tiotusen.

-- ── Ge ut ───────────────────────────────────────────────────────────────────

create or replace function public.issue_gift_card(
  p_restaurant_id uuid,
  p_code          text,
  p_amount_ore    integer,
  p_currency      public.currency_code,
  p_expires_at    timestamptz default null,
  p_email         text default null,
  p_note          text default null,
  p_actor_id      uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id uuid;
begin
  if p_amount_ore is null or p_amount_ore <= 0 then
    raise exception 'Beloppet måste vara positivt' using errcode = 'check_violation';
  end if;

  insert into public.gift_cards (
    restaurant_id, code, currency, expires_at, issued_to_email, note, created_by
  )
  values (p_restaurant_id, p_code, p_currency, p_expires_at, p_email, p_note, p_actor_id)
  returning id into v_card_id;

  insert into public.gift_card_transactions (gift_card_id, kind, amount_ore, created_by)
  values (v_card_id, 'ISSUE', p_amount_ore, p_actor_id);

  return v_card_id;
end;
$$;

-- ── Lösa in ─────────────────────────────────────────────────────────────────
--
-- Kontrollerna som spelar roll ligger här och inte i TypeScript: mellan att
-- servern läste saldot och att raden skrivs kan kortet ha använts vid ett annat
-- bord. Läsningen måste ske under lås, i samma transaktion som skrivningen.

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
  v_payment uuid;
begin
  select * into v_card from public.gift_cards where code = p_code for update;
  if not found then
    raise exception 'Okänt presentkort' using errcode = 'no_data_found';
  end if;

  select * into v_order from public.orders where id = p_order_id;
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

  if p_amount_ore > v_order.total_ore then
    raise exception 'Presentkortet kan inte betala mer än notan' using errcode = 'check_violation';
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

revoke execute on function public.issue_gift_card(uuid, text, integer, public.currency_code, timestamptz, text, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.redeem_gift_card(text, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.issue_gift_card(uuid, text, integer, public.currency_code, timestamptz, text, text, uuid)
  to service_role;
grant execute on function public.redeem_gift_card(text, uuid, integer) to service_role;

comment on table public.gift_cards is
  'Förbetalt värde hos EN restaurang. Plattformsbreda kort är utgivning av elektroniska pengar och kräver tillstånd — se migrationens huvud.';

-- ── En order kan nu betalas med flera medel ─────────────────────────────────
--
-- `confirm_order_payment` från 0026 krävde att EN betalning täckte hela notan.
-- Det var sant så länge kort var det enda alternativet, men ett presentkort
-- betalar ofta bara en del: 50 mark på kortet mot en nota på 62 lämnar 12 att
-- dra på kortet. Med det gamla villkoret hade kortbetalningen på 12 avvisats
-- som "täcker inte ordern", och gästen hade betalat utan att få mat.
--
-- Summan av alla betalningar som inte misslyckats är det som avgör. Resten av
-- funktionen är oförändrad.

create or replace function public.confirm_order_payment(
  p_payment_id uuid,
  p_method     text default null
)
returns public.order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_paid    integer;
  v_next    public.order_status;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Okänd betalning %', p_payment_id using errcode = 'no_data_found';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;

  if v_payment.status <> 'CAPTURED' then
    update public.payments
    set status      = 'CAPTURED',
        captured_at = coalesce(captured_at, now()),
        method      = coalesce(p_method, method)
    where id = p_payment_id;
  end if;

  -- Kontrollen mot ordern, inte mot vad leverantören påstår. En webhook kommer
  -- från internet och kan gälla fel belopp.
  select coalesce(sum(amount_ore), 0) into v_paid
  from public.payments
  where order_id = v_order.id and status <> 'FAILED';

  if v_paid < v_order.total_ore then
    raise exception 'Betalningarna (%) täcker inte ordern (%)', v_paid, v_order.total_ore
      using errcode = 'check_violation';
  end if;

  -- Dricksraden skapas av place_order utan betalning, eftersom ordern läggs
  -- innan den betalas. Kopplingen görs här.
  update public.tips
  set payment_id = p_payment_id
  where order_id = v_payment.order_id
    and payment_id is null;

  -- Redan lyft. En omsänd händelse ska inte lägga ordern igen.
  if v_order.status <> 'DRAFT' then
    return v_order.status;
  end if;

  select case
           when coalesce((r.order_policy ->> 'autoAccept')::boolean, false)
           then 'ACCEPTED'::public.order_status
           else 'PLACED'::public.order_status
         end
  into v_next
  from public.restaurants r
  where r.id = v_order.restaurant_id;

  update public.orders
  set status    = 'PLACED',
      placed_at = coalesce(placed_at, now())
  where id = v_order.id;

  if v_next = 'ACCEPTED' then
    update public.orders
    set status = 'ACCEPTED', accepted_at = now()
    where id = v_order.id;
  end if;

  return v_next;
end;
$$;

revoke execute on function public.confirm_order_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text) to service_role;
