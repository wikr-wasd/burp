-- Historik att bedöma sidorna mot. KÖRS INTE av `supabase db reset`.
--
--     npm run db:demo
--
-- Seeden ger menyer, bord och personal men inte en enda order. Följden är att
-- varje yta som handlar om pengar — Beställningar, Kassa, Statistik, Burps
-- översikt och Avräkning — står tom i en färsk lokal miljö. En tom sida går att
-- kontrollera att den inte kraschar, men inte att bedöma: kolumnbredder,
-- avrundning och radbrytning syns först när det står siffror i dem.
--
-- Filen är avsiktligt SKILD från seed.sql. Det som ligger i seeden ska en
-- utvecklare kunna lita på som utgångsläge; en hög påhittade order i den hade
-- förr eller senare lästs som produktens beteende. Det har hänt en gång redan:
-- smoke.sh skapade en order utan orderrader och statistiksidan visade en
-- momstotal större än summan per sats, vilket såg ut som en bugg i
-- uppdelningen.
--
-- Därför bär varje order här RIKTIGA orderrader ur restaurangens egen meny, och
-- momsen räknas ur dem. Sidorna ska stämma internt.
--
-- Ordern skrivs direkt och inte genom `place_order()`. Funktionen sätter
-- tidsstämplarna till now(), och det som behövs här är historik — 75 dagar
-- bakåt, så att förra månaden går att stänga i Avräkning.

-- Inga psql-metakommandon här. Filen kontrolleras av `npm run db:validate`, som
-- kör den genom PostgreSQL:s egen parser — och ett `\echo` är inte SQL.
-- ON_ERROR_STOP sätts av scripts/seed-demo-orders.mjs i stället.

begin;

-- Samma data varje gång. En demomiljö som ser olika ut vid varje reset går inte
-- att jämföra en skärmdump mot.
select setseed(0.42);

do $$
declare
  v_rest         record;
  v_day          date;
  v_order_id     uuid;
  v_table_id     uuid;
  v_item         record;
  v_count        integer;
  v_lines        integer;
  v_gross        integer;
  v_vat          integer;
  v_line_gross   integer;
  v_line_vat     integer;
  v_vat_by_rate  jsonb;
  v_tip          integer;
  v_bps          integer;
  v_completed    timestamptz;
  v_payment_id   uuid;
  v_refunded     boolean;
begin
  /*
   * Kör en gång, inte varje gång.
   *
   * En andra körning hade lagt 246 order till de 246 som redan fanns och
   * dubblat varje siffra på varje yta — tyst, eftersom ingenting i schemat
   * hindrar fler order. Att i stället falla på överlappsspärren när
   * avräkningarna skulle stängas var ett sämre sätt att upptäcka det: då är
   * ordern redan inlagd och databasen halvvägs.
   *
   * En färsk `supabase db reset` har noll order, så tabellen är signalen.
   */
  if exists (select 1 from public.orders limit 1) then
    raise notice 'Databasen har redan order — demodatan läggs inte in igen.';
    raise notice 'Kör `npm run db:reset` först om du vill ha en färsk omgång.';
    return;
  end if;

  for v_rest in
    select r.id, r.name, r.country, coalesce(r.fee_override_bps, 340) as bps
    from public.restaurants r
    where r.status = 'ACTIVE'
    order by r.name
  loop
    -- En restaurang utan publicerad meny kan inte sälja något. Seeden har en
    -- sådan med flit, och utan det här hoppet blir det en order på noll kronor
    -- — vilket databasen med rätta vägrar ta emot som betalning.
    if not exists (
      select 1
      from public.menu_items mi
      join public.menu_categories mc on mc.id = mi.category_id
      join public.menus m on m.id = mc.menu_id
      where m.restaurant_id = v_rest.id
        and mi.status = 'PUBLISHED'
        and mi.price_ore > 0
    ) then
      continue;
    end if;

    v_refunded := false;

    for v_day in
      select generate_series(current_date - 75, current_date - 1, interval '1 day')::date
    loop
      -- Två till fem order per dag. Helgen är starkare, som i en verklig lokal.
      v_count := 2 + floor(random() * 3)::integer
               + case when extract(isodow from v_day) in (5, 6) then 1 else 0 end;

      for i in 1..v_count loop
        v_gross := 0;
        v_vat := 0;
        v_vat_by_rate := '{}'::jsonb;

        -- Kvällspass i restaurangens egen tid. Utan tidszonen hamnar en del av
        -- kvällen i fel dygn, och då blir demodatan ett dåligt underlag för
        -- just den gräns Avräkning finns för att hålla.
        v_completed := ((v_day::text || ' ' ||
                         lpad((11 + floor(random() * 11)::integer)::text, 2, '0') || ':' ||
                         lpad(floor(random() * 60)::integer::text, 2, '0') || ':00')::timestamp)
                       at time zone public.country_time_zone(v_rest.country);

        select t.id into v_table_id
        from public.tables t
        where t.restaurant_id = v_rest.id and t.status = 'ACTIVE'
        order by random()
        limit 1;

        insert into public.orders (
          restaurant_id, table_id, type, status, idempotency_key,
          items_gross_ore, items_vat_ore, vat_by_rate, tip_ore, total_ore,
          placed_at, accepted_at, ready_at, completed_at
        )
        values (
          v_rest.id, v_table_id,
          (case when v_table_id is null then 'PICKUP' else 'TABLE' end)::public.order_type,
          'COMPLETED', gen_random_uuid(),
          0, 0, '{}'::jsonb, 0, 0,
          v_completed - interval '38 minutes',
          v_completed - interval '36 minutes',
          v_completed - interval '9 minutes',
          v_completed
        )
        returning id into v_order_id;

        v_lines := 1 + floor(random() * 3)::integer;

        for v_item in
          select mi.id, mi.name, mi.price_ore, mi.vat_rate_bps
          from public.menu_items mi
          join public.menu_categories mc on mc.id = mi.category_id
          join public.menus m on m.id = mc.menu_id
          where m.restaurant_id = v_rest.id
            and mi.status = 'PUBLISHED'
            -- Ett nollpris skulle ge division med noll när antalet räknas ut.
            and mi.price_ore > 0
          order by random()
          limit v_lines
        loop
          v_line_gross := v_item.price_ore * (1 + floor(random() * 2)::integer);
          -- Momsen bryts ur bruttot, som i @burp/core: netto = brutto × 10000 /
          -- (10000 + sats). Att lägga den på ett netto ger en annan slutsiffra.
          v_line_vat := v_line_gross
                      - round(v_line_gross::numeric * 10000 / (10000 + v_item.vat_rate_bps));

          insert into public.order_items (
            order_id, restaurant_id, menu_item_id, name_snapshot,
            unit_price_ore, vat_rate_bps, quantity, line_gross_ore
          )
          values (
            v_order_id, v_rest.id, v_item.id, v_item.name,
            v_item.price_ore, v_item.vat_rate_bps,
            (v_line_gross / v_item.price_ore)::smallint, v_line_gross
          );

          v_gross := v_gross + v_line_gross;
          v_vat := v_vat + v_line_vat;
          v_vat_by_rate := jsonb_set(
            v_vat_by_rate,
            array[v_item.vat_rate_bps::text],
            to_jsonb(coalesce((v_vat_by_rate ->> v_item.vat_rate_bps::text)::integer, 0) + v_line_vat)
          );
        end loop;

        -- Dricks på var tredje nota. Aldrig i avgiftsunderlaget — regel 8.
        v_tip := case when random() < 0.33 then round(v_gross * 0.1 / 100) * 100 else 0 end;

        update public.orders
        set items_gross_ore = v_gross,
            items_vat_ore   = v_vat,
            vat_by_rate     = v_vat_by_rate,
            tip_ore         = v_tip,
            total_ore       = v_gross + v_tip
        where id = v_order_id;

        -- Dricksen har en egen liggare sedan migration 0040, och det är den
        -- statistiken och avräkningen läser. `orders.tip_ore` ensam ger noll
        -- i dricks på varje yta.
        if v_tip > 0 then
          insert into public.tips (order_id, restaurant_id, amount_ore, created_at)
          values (v_order_id, v_rest.id, v_tip, v_completed);
        end if;

        v_bps := v_rest.bps;
        insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore, created_at)
        values (v_order_id, v_rest.id, 'GROSS_ITEMS', v_gross, v_bps,
                round(v_gross::numeric * v_bps / 10000), v_completed);

        -- Tre av fyra notor kvitteras som kontanter. Resten står obetalda, som
        -- de gör i verkligheten tills någon i kassan hunnit med dem.
        if random() < 0.75 then
          insert into public.payments (
            order_id, restaurant_id, amount_ore, provider, method, status,
            idempotency_key, captured_at, created_at
          )
          values (
            v_order_id, v_rest.id, v_gross + v_tip, 'CASH', 'cash', 'CAPTURED',
            gen_random_uuid(), v_completed + interval '20 minutes',
            v_completed + interval '20 minutes'
          )
          returning id into v_payment_id;

          -- En återbetalning per restaurang, i förra månaden. Utan den syns
          -- varken motbokningen i kassan eller krediten i avräkningen.
          if not v_refunded
             and v_day between date_trunc('month', current_date)::date - 20
                           and date_trunc('month', current_date)::date - 5 then
            perform public.request_refund(v_payment_id, v_gross + v_tip, 'Maten kom aldrig fram');
            update public.refunds
            set settled_at = v_completed + interval '1 hour'
            where payment_id = v_payment_id;
            v_refunded := true;
          end if;
        end if;
      end loop;
    end loop;
  end loop;
end
$$;

/*
 * Två stängda avräkningsperioder per restaurang.
 *
 * Utan dem visar Avräkning bara den pågående månaden, och de tre lägena en
 * avräkning kan stå i — utkast, fakturerad, betald — går inte att se utan att
 * först klicka fram dem. Den äldre månaden är betald, den senaste ligger som
 * utkast och går att fakturera eller kasta.
 */
do $$
declare
  v_rest       uuid;
  v_this_month date := date_trunc('month', current_date)::date;
  v_month      date;
  v_id         uuid;
begin
  for v_rest in select distinct restaurant_id from public.orders loop
    foreach v_month in array array[
      (v_this_month - interval '2 months')::date,
      (v_this_month - interval '1 month')::date
    ]
    loop
      /*
       * Hoppa över det som redan är stängt.
       *
       * Två perioder får inte överlappa (0039), och spärren är en exclusion
       * constraint som med rätta vägrar. Här är det inget fel — perioden är
       * redan avräknad — så demodatan ska gå vidare i stället för att falla.
       */
      if exists (
        select 1 from public.settlements s
        where s.restaurant_id = v_rest
          and s.period_start  = v_month
      ) then
        continue;
      end if;

      begin
        v_id := public.close_settlement_period(
          v_rest, v_month, (v_month + interval '1 month' - interval '1 day')::date);
      exception
        -- En period som delvis överlappar en befintlig. Sällsynt, och det är
        -- fortfarande inte demodatans sak att avgöra vad som ska hända med den.
        when exclusion_violation then
          raise notice 'Perioden % för restaurang % överlappar en avräkning som finns — hoppar över',
            to_char(v_month, 'YYYY-MM'), v_rest;
          continue;
      end;

      if v_month < (v_this_month - interval '1 month')::date then
        update public.settlements
        set status = 'INVOICED', invoice_number = 'B-' || to_char(v_month, 'YYYY-MM')
        where id = v_id;

        update public.settlements set status = 'PAID' where id = v_id;
      end if;
    end loop;
  end loop;
end
$$;

commit;

select
  count(*)                                        as antal_order,
  count(*) filter (where status = 'REFUNDED')     as aterbetalda,
  min(completed_at)::date                         as fran,
  max(completed_at)::date                         as till,
  (select count(*) from public.settlements)       as avrakningar
from public.orders;
