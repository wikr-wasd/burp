-- 0016 — Poäng delas faktiskt ut (avsnitt 10).
--
-- Schemat för lojalitet fanns sedan migration 0007 och kundpanelen visar ett
-- saldo, men ingen kod skrev någonsin en EARN-rad. Saldot kunde alltså aldrig
-- bli annat än noll — en funktion som såg färdig ut och inte var det.

-- Grundnivån. Speglar BASE_POINTS_PER_KRONA i packages/core/src/loyalty.ts.
-- Restaurangen får höja, aldrig sänka; det kontrolleras i koden och behöver
-- inte upprepas här eftersom kolumnen bara sätts av backoffice.
alter table public.restaurants
  add column loyalty_points_per_krona numeric(4,2) not null default 1.00
    check (loyalty_points_per_krona >= 1.00 and loyalty_points_per_krona <= 10.00);

comment on column public.restaurants.loyalty_points_per_krona is
  'Poäng per spenderad krona. Minst 1,00 — Burps grundnivå, som restaurangen kan höja men inte sänka.';

/*
 * Hur länge poäng lever.
 *
 * Utgångsdatum finns för att poängskulden inte ska växa i evighet — en skuld
 * utan slutdatum är en post i balansräkningen som aldrig går att stänga
 * (avsnitt 10). Tolv månader är ett utgångsläge, inte ett beslut: värdet ligger
 * i en funktion så att det går att ändra utan att röra triggern.
 */
create or replace function public.loyalty_expiry_months()
returns integer
language sql
immutable
as $$ select 12; $$;

/*
 * Delar ut poäng när en order slutförs.
 *
 * Underlaget är varukorgen exklusive leverans och dricks. Gästen ska belönas
 * för att köpa mat, inte för att bo långt bort eller ge dricks — samma regel
 * som pointsForOrder() i @burp/core.
 *
 * Anonyma bordsbeställningar ger inga poäng. Det är inte en brist utan en
 * följd av att QR-flödet inte kräver konto: utan guest_id finns ingen att ge
 * poängen till.
 */
create or replace function public.award_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id  uuid;
  v_rate        numeric(4,2);
  v_points      integer;
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then
    return new;
  end if;

  if new.guest_id is null then
    return new;  -- anonym beställning
  end if;

  select loyalty_points_per_krona into v_rate
  from public.restaurants where id = new.restaurant_id;

  -- Heltal poäng, alltid nedåt. En order på 149,50 kr ger 149 poäng, inte 150 —
  -- att avrunda uppåt gör poängskulden större än omsättningen den bygger på.
  v_points := floor((new.items_gross_ore / 100.0) * coalesce(v_rate, 1.00))::integer;

  if v_points <= 0 then
    return new;
  end if;

  -- Kontot skapas vid första intjäningen i stället för vid registrering.
  -- En gäst som aldrig beställt behöver inget lojalitetskonto.
  select id into v_account_id
  from public.loyalty_accounts
  where user_id = new.guest_id and restaurant_id is null;

  if v_account_id is null then
    insert into public.loyalty_accounts (user_id, restaurant_id)
    values (new.guest_id, null)
    returning id into v_account_id;
  end if;

  insert into public.loyalty_transactions (account_id, order_id, kind, points, expires_at, description)
  values (
    v_account_id,
    new.id,
    'EARN',
    v_points,
    now() + (public.loyalty_expiry_months() || ' months')::interval,
    'Poäng för beställning'
  );

  return new;
end;
$$;

create trigger orders_award_loyalty
  after update of status on public.orders
  for each row execute function public.award_loyalty_points();

comment on function public.award_loyalty_points is
  'Skriver en EARN-rad när en order går till COMPLETED. Anonyma bordsbeställningar ger inga poäng — utan guest_id finns ingen att ge dem till.';

-- Backoffice ska kunna läsa poängskulden. Den är en verklig skuld och hör
-- hemma i plattformens siffror, inte bara i gästens vy.
create policy loyalty_transactions_select_platform on public.loyalty_transactions
  for select to authenticated using (public.is_platform_admin());

create policy loyalty_accounts_select_platform on public.loyalty_accounts
  for select to authenticated using (public.is_platform_admin());
