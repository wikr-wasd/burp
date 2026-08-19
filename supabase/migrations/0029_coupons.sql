-- 0029 — Kuponger och erbjudanden.
--
-- En kupong är en RABATT, inte ett betalmedel. Skillnaden avgör mer än den
-- låter: en rabatt sänker ordersumman och därmed både momsen och Burps
-- avgiftsunderlag, medan ett presentkort bara sänker vad som återstår att
-- debitera. Blandas de ihop blir momsen fel i restaurangens bokföring och
-- avgiften fel i vår.
--
-- Rabatten räknas i packages/core/src/coupon.ts och ingen annanstans. Klienten
-- skickar en KOD, aldrig ett belopp — samma regel som gäller priser.
--
-- `orders.discount_ore` finns sedan 0005 och är `<= 0`. Ingen ny kolumn där.

create type public.coupon_funder as enum ('BURP', 'RESTAURANT');

create table public.coupons (
  id                uuid primary key default gen_random_uuid(),

  -- Versaler och siffror. Gäster skriver av koder från en skylt eller ett sms,
  -- och normaliseringen sker i koden — men databasen ska inte kunna innehålla
  -- två koder som bara skiljer sig i skiftläge.
  code              text not null check (code ~ '^[A-Z0-9]{3,32}$'),

  -- Null = plattformsbred. Burp kan driva en kampanj över alla restauranger.
  restaurant_id     uuid references public.restaurants(id) on delete cascade,

  -- Antingen ett fast belopp eller en procentsats, aldrig båda och aldrig
  -- ingendera. En kupong som inte ger något är en kupong ingen förstår.
  discount_ore      integer check (discount_ore > 0),
  discount_bps      integer check (discount_bps between 1 and 10000),

  -- Bara meningsfull för ett fast belopp: 500 är fem mark i Sarajevo och fem
  -- dinarer i Beograd. En procentsats betyder samma sak överallt.
  currency          public.currency_code,

  min_order_ore     integer not null default 0 check (min_order_ore >= 0),
  -- Tak för procentrabatter, så att "20 % av allt" inte blir obegränsat.
  max_discount_ore  integer check (max_discount_ore > 0),

  valid_from        timestamptz,
  valid_until       timestamptz,

  -- Null = obegränsad upplaga.
  max_redemptions   integer check (max_redemptions > 0),
  -- 0 = ingen gräns per gäst. En gräns kräver ett konto att räkna på, och
  -- stänger därmed ute den anonyma QR-gästen — det är avsiktligt och kontrolleras
  -- i @burp/core.
  max_per_guest     integer not null default 1 check (max_per_guest >= 0),

  is_active         boolean not null default true,

  -- Vem som bekostar kampanjen. Inte en bokföringsdetalj: avgiftsunderlaget
  -- räknas efter rabatt, alltså är Burp med och betalar varje kupong. Rimligt
  -- för en plattformsbred kampanj, inte självklart för restaurangens egen.
  -- Fältet står på raden så att beslutet kan ändras utan att historiken gör det.
  funded_by         public.coupon_funder not null default 'RESTAURANT',

  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint coupons_one_kind check (
    (discount_ore is not null and discount_bps is null and currency is not null)
    or (discount_bps is not null and discount_ore is null)
  ),
  constraint coupons_period check (valid_from is null or valid_until is null or valid_from < valid_until)
);

-- Koden är unik per restaurang, och separat unik bland de plattformsbreda.
-- Ett partiellt index åt vardera hållet: `unique (restaurant_id, code)` hade
-- inte hindrat två plattformsbreda med samma kod, eftersom null aldrig krockar
-- med null i ett unikt index.
create unique index coupons_code_per_restaurant_key
  on public.coupons (restaurant_id, code)
  where restaurant_id is not null;

create unique index coupons_code_platform_key
  on public.coupons (code)
  where restaurant_id is null;

create index coupons_active_idx on public.coupons (restaurant_id) where is_active;

create trigger coupons_touch before update on public.coupons
  for each row execute function public.touch_updated_at();

-- Kupongens valuta måste vara restaurangens. En kupong i euro hos en
-- restaurang som prissätter i mark ger en rabatt som ser rimlig ut och är
-- dubbelt så stor som avsett.
create or replace function public.enforce_coupon_currency()
returns trigger
language plpgsql
as $$
declare
  v_currency public.currency_code;
begin
  if new.restaurant_id is null or new.currency is null then
    return new;
  end if;

  select currency into v_currency from public.restaurants where id = new.restaurant_id;

  if v_currency is distinct from new.currency then
    raise exception 'Kupongens valuta (%) måste vara restaurangens (%)', new.currency, v_currency
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger coupons_currency
  before insert or update on public.coupons
  for each row execute function public.enforce_coupon_currency();

-- ── Inlösen ─────────────────────────────────────────────────────────────────
--
-- En rad per användning. Antalet räknas ur loggen och lagras aldrig — samma
-- skäl som lojalitetssaldot (regel 7): ett lagrat antal kan hamna i otakt med
-- sina rader, en count över raderna kan det inte.

create table public.coupon_redemptions (
  id             uuid primary key default gen_random_uuid(),
  coupon_id      uuid not null references public.coupons(id) on delete restrict,
  order_id       uuid not null references public.orders(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  -- Null för en anonym bordsgäst. En kupong med gräns per gäst kräver därför
  -- ett konto, vilket kontrolleras i @burp/core innan raden ens skrivs.
  guest_id       uuid references auth.users(id) on delete set null,

  -- Vad rabatten faktiskt blev. Sparas per rad så att en ändrad kupong inte
  -- skriver om vad en gäst fick i förra veckan.
  discount_ore   integer not null check (discount_ore > 0),

  redeemed_at    timestamptz not null default now()
);

-- En kupong per order. Att stapla koder är en egen produktfråga och inte något
-- som ska uppstå av att gränssnittet råkade tillåta det.
create unique index coupon_redemptions_order_key on public.coupon_redemptions (order_id);

create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);
create index coupon_redemptions_guest_idx on public.coupon_redemptions (coupon_id, guest_id)
  where guest_id is not null;

-- Loggen är oföränderlig. En inlösen som går att radera är ingen gräns.
create trigger coupon_redemptions_immutable
  before update or delete on public.coupon_redemptions
  for each row execute function public.reject_mutation();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

-- Ingen SELECT för gäster. En lista över giltiga koder är en lista att prova
-- igenom; kontrollen sker på servern som slår upp EN kod i taget.
create policy coupons_select_staff on public.coupons
  for select to authenticated
  using (
    restaurant_id is not null
    and public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

create policy coupons_select_platform on public.coupons
  for select to authenticated
  using (public.is_platform_admin());

-- Restaurangen skapar och ändrar sina egna. Plattformsbreda kuponger är Burps
-- och skrivs i backoffice.
create policy coupons_insert_staff on public.coupons
  for insert to authenticated
  with check (
    restaurant_id is not null
    and public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
    and funded_by = 'RESTAURANT'
  );

create policy coupons_update_staff on public.coupons
  for update to authenticated
  using (
    restaurant_id is not null
    and public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  )
  with check (
    restaurant_id is not null
    and public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
    and funded_by = 'RESTAURANT'
  );

create policy coupons_all_platform on public.coupons
  for all to authenticated
  using (public.has_platform_role(array['admin', 'owner']::public.platform_role[]))
  with check (public.has_platform_role(array['admin', 'owner']::public.platform_role[]));

-- En kupong som använts får inte tas bort — inlösenraden pekar på den, och
-- FK:n är `restrict`. Avstängning sker med `is_active`, inte med delete.
create policy coupons_delete_staff on public.coupons
  for delete to authenticated
  using (
    restaurant_id is not null
    and public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

create policy coupon_redemptions_select_staff on public.coupon_redemptions
  for select to authenticated
  using (
    public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

create policy coupon_redemptions_select_own on public.coupon_redemptions
  for select to authenticated
  using (guest_id = auth.uid());

create policy coupon_redemptions_select_platform on public.coupon_redemptions
  for select to authenticated
  using (public.is_platform_admin());

-- Ingen INSERT-policy. Raden skrivs av `redeem_coupon()` i samma transaktion
-- som ordern, med service role. En gäst som kunde skriva raden själv kunde
-- också låta bli.

-- ── Inlösen i en transaktion ────────────────────────────────────────────────
--
-- Kontrollen som spelar roll ligger här och inte i TypeScript: mellan att
-- servern räknat fram rabatten och att ordern skrivs kan en annan gäst ha löst
-- in den sista kupongen. Räkningen måste ske under lås, i samma transaktion som
-- raden skrivs.

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

  select count(*) into v_total from public.coupon_redemptions where coupon_id = p_coupon_id;

  if v_coupon.max_redemptions is not null and v_total >= v_coupon.max_redemptions then
    raise exception 'Kupongen är slut' using errcode = 'check_violation';
  end if;

  if v_coupon.max_per_guest > 0 then
    if p_guest_id is null then
      raise exception 'Kupongen kräver ett konto' using errcode = 'check_violation';
    end if;

    select count(*) into v_guest
    from public.coupon_redemptions
    where coupon_id = p_coupon_id and guest_id = p_guest_id;

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

comment on function public.redeem_coupon is
  'Skriver inlösenraden under lås. Räkningen måste ske i samma transaktion som raden — mellan uträkning och skrivning kan någon annan ha tagit den sista.';
