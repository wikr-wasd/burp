-- 0073 — Pulsen: vad som faktiskt händer på plattformen, i siffror.
--
-- Önskemålet var att gästen ska känna att Burp är i gång och att många är
-- aktiva. Det finns två sätt att göra det, och bara det ena är hederligt:
-- hitta på siffror, eller visa de riktiga. Den här migrationen ger de riktiga.
--
-- ── Varför en funktion och inte en fråga i appen ────────────────────────────
--
-- `orders` är INTE publikt läsbart, och ska aldrig bli det. En fråga från
-- startsidan hade därför krävt service role — alltså en nyckel som kringgår
-- all RLS, för att räkna fram ett tal som ändå är offentligt.
--
-- I stället en SECURITY DEFINER-funktion som bara kan svara på precis det som
-- ska vara offentligt: HUR MÅNGA, aldrig VILKA. Det som lämnar databasen är
-- summor och en rätts namn — inget order-id, inget bord, ingen gäst, ingen
-- restaurang. Ingen rad går att spåra tillbaka till en person.
--
-- ── Om siffrorna är små ─────────────────────────────────────────────────────
--
-- Då är de små. Funktionen ljuger inte, och gränssnittet döljer hellre ett tal
-- än blåser upp det: en nystartad marknadsplats som påstår tusen beställningar
-- är genomskådad direkt, och det är dyrare än att vara liten.

create or replace function public.platform_pulse()
returns table (
  restaurants integer,
  cities      integer,
  orders_week integer,
  reviews     integer,
  rating      numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer
       from public.restaurants
      where status = 'ACTIVE'),

    (select count(distinct city)::integer
       from public.restaurants
      where status = 'ACTIVE'),

    -- Utkast och avbrutna order är inte aktivitet. En order som lades och
    -- ångrades säger ingenting om att någon åt någonstans.
    (select count(*)::integer
       from public.orders
      where created_at > now() - interval '7 days'
        and status not in ('DRAFT', 'CANCELLED')),

    (select count(*)::integer
       from public.reviews
      where is_published),

    -- Bara matbetyget. Service och leverans betygsätts separat och saknas på
    -- de flesta omdömen; ett snitt över tre kolumner hade vägt olika tungt
    -- beroende på vad gästen råkade fylla i.
    (select round(avg(rating_food)::numeric, 1)
       from public.reviews
      where is_published);
$$;

comment on function public.platform_pulse is
  'Offentliga summor för startsidan. Svarar HUR MÅNGA, aldrig VILKA — orders är och förblir stängd för anon.';

/**
 * De senaste beställningarna, som rätt och stad.
 *
 * En rad per ORDER och inte per rad i den: en beställning på fem rätter är en
 * sak som hände, inte fem. `distinct on` plockar den första rätten i ordern,
 * vilket i praktiken är den gästen valde först.
 *
 * Dygnet är gränsen. En "just nu"-lista med gårdagens middag är en lögn med
 * korrekta uppgifter i.
 */
create or replace function public.recent_orders_pulse(p_limit integer default 6)
returns table (
  dish text,
  city text,
  at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select first_item.name_snapshot, first_item.city, first_item.created_at
  from (
    select distinct on (o.id)
           oi.name_snapshot,
           r.city,
           o.created_at
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.restaurants r on r.id = o.restaurant_id
    where o.created_at > now() - interval '24 hours'
      and o.status not in ('DRAFT', 'CANCELLED')
      and r.status = 'ACTIVE'
    order by o.id, oi.created_at
  ) as first_item
  order by first_item.created_at desc
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
$$;

comment on function public.recent_orders_pulse is
  'Senaste dygnets beställningar som rätt + stad. Ingen restaurang, inget bord, ingen gäst — ingenting som pekar på en person.';

grant execute on function public.platform_pulse() to anon, authenticated, service_role;
grant execute on function public.recent_orders_pulse(integer) to anon, authenticated, service_role;
