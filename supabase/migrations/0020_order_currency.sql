-- 0020 — Valutan fryses på ordern.
--
-- Migration 0019 gav restaurangen ett land och en valuta. Ordern hade ingen,
-- och varje kvitto formaterades därför i kronor — en gäst i Sarajevo fick se
-- "129,00 kr" för något som kostade 12,90 KM.
--
-- Att slå upp restaurangens valuta vid visning hade räckt idag men inte i
-- morgon: byter en restaurang land eller valuta skrivs samtliga gamla kvitton
-- om, och ett kvitto som ändrar sig i efterhand är inte ett kvitto. Samma skäl
-- som gör att orderraden bär `name_snapshot` och `unit_price_ore` i stället
-- för att peka på menyn.

alter table public.orders
  add column currency public.currency_code;

comment on column public.orders.currency is
  'Valutan ordern lades i. Fryst vid orderläggning — följer aldrig med när restaurangen byter valuta.';

-- Befintliga order tillhör restauranger som fått sin valuta i 0019.
update public.orders o
set currency = r.currency
from public.restaurants r
where r.id = o.restaurant_id
  and o.currency is null;

alter table public.orders
  alter column currency set not null;

/*
 * Valutan sätts av databasen, inte av anroparen.
 *
 * `place_order()` tar emot en jsonb från API:t, och varje fält där är ett fält
 * en klient i förlängningen kan påverka. Valutan är inte ett val — den följer
 * av vilken restaurang ordern läggs hos — och ska därför aldrig gå att skicka
 * med. Triggern skriver över det som står, om något står.
 */
create or replace function public.set_order_currency()
returns trigger
language plpgsql
as $$
begin
  select currency into new.currency
  from public.restaurants
  where id = new.restaurant_id;

  if new.currency is null then
    raise exception 'Restaurangen % saknar valuta', new.restaurant_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger orders_set_currency
  before insert on public.orders
  for each row execute function public.set_order_currency();

-- Statistiken summerar per restaurang och är därför redan i en enda valuta.
-- Plattformsöversikten är det inte — den läser över alla länder — och därför
-- får den gruppera på valuta i stället för att lägga ihop BAM, EUR och RSD
-- till ett tal som inte betyder något.
create index if not exists orders_currency_idx on public.orders (currency);

/*
 * Plattformsöversikten kan inte längre ge ETT belopp.
 *
 * `platform_summary` summerade `items_gross_ore` över alla order i hela
 * plattformen. Med en enda valuta var det ett riktigt tal. Med tre är det
 * bosniska fening plus euro-cent plus dinarer i samma summa — ett tal som ser
 * ut som pengar, går att sätta i en graf, och inte betyder någonting.
 *
 * Funktionen delas därför i två: räkneverket, som fortfarande är valutalöst,
 * och pengarna, som redovisas per valuta.
 */
drop function if exists public.platform_summary(timestamptz, timestamptz);

create function public.platform_summary(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  restaurants_total    bigint,
  restaurants_active   bigint,
  restaurants_pending  bigint,
  orders_count         bigint
)
language sql
stable
as $$
  select
    (select count(*) from public.restaurants)                          as restaurants_total,
    (select count(*) from public.restaurants where status = 'ACTIVE')  as restaurants_active,
    (select count(*) from public.restaurants where status = 'PENDING') as restaurants_pending,
    (select count(*) from public.orders o
      where o.status = 'COMPLETED'
        and o.completed_at >= p_from and o.completed_at < p_to)        as orders_count;
$$;

revoke execute on function public.platform_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.platform_summary(timestamptz, timestamptz) to authenticated, service_role;

comment on function public.platform_summary is
  'Antal för Burps backoffice. Innehåller medvetet inga belopp — de kan inte summeras över valutagränser. Se platform_revenue_by_currency.';

create function public.platform_revenue_by_currency(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  currency         public.currency_code,
  orders_count     bigint,
  gmv_ore          bigint,
  burp_revenue_ore bigint,
  tips_ore         bigint
)
language sql
stable
as $$
  select
    o.currency,
    count(o.id)                                       as orders_count,
    -- GMV: det som gick genom plattformen, inte det Burp behöll.
    coalesce(sum(o.items_gross_ore), 0)::bigint       as gmv_ore,
    coalesce(sum(f.fee_ore), 0)::bigint               as burp_revenue_ore,
    coalesce(sum(o.tip_ore), 0)::bigint               as tips_ore
  from public.orders o
  left join public.fees f on f.order_id = o.id
  where o.status = 'COMPLETED'
    and o.completed_at >= p_from
    and o.completed_at < p_to
  group by o.currency
  order by gmv_ore desc;
$$;

revoke execute on function public.platform_revenue_by_currency(timestamptz, timestamptz) from public, anon;
grant execute on function public.platform_revenue_by_currency(timestamptz, timestamptz)
  to authenticated, service_role;

comment on function public.platform_revenue_by_currency is
  'Burps omsättning per valuta. En rad per valuta — belopp från olika valutor läggs aldrig ihop.';
