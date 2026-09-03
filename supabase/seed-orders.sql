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
-- tidsstämplarna till now(), och det som behövs här är historik — 90 dagar
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
  v_cancelled    boolean;
  v_session_id   uuid;
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
  /*
   * Vakten frågar efter HISTORIK, inte efter order.
   *
   * Den stod som `exists (select 1 from public.orders)` och var därmed alltid
   * sann direkt efter en reset: `seed-staff.sql` lägger in en genomförd order
   * för att kassan ska ha något att visa. Följden var att `npm run db:demo`
   * skrev ut sitt eget felmeddelande och la in NOLL dagars historik —
   * och rådet det gav, "kör db:reset först", gjorde saken värre eftersom
   * reseten lägger tillbaka precis den order som utlöser vakten.
   *
   * Pengaytorna stod alltså tomma efter varje reset, vilket är exakt det
   * db:demo finns för att förhindra.
   *
   * Sju dagar är gränsen: seedens order och passet som pågår ligger i dag,
   * historiken sträcker sig nittio dagar bakåt.
   */
  if exists (
    select 1 from public.orders where placed_at < now() - interval '7 days'
  ) then
    raise notice 'Databasen har redan historik — den läggs inte in igen.';
    raise notice 'Kör `npm run db:reset` följt av `npm run db:demo` för en färsk omgång.';
    raise notice 'Passet som pågår återställs ändå — se sista avsnittet.';
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

    /*
     * Bord åt den som saknar dem.
     *
     * Bara seed-restaurangen hade bord, och följden var att alla andra
     * restaurangers order blev AVHÄMTNING — vilket i sin tur betydde att de
     * aldrig fick en bordssession, och därmed inget omdöme, eftersom gästen vid
     * bordet är sin session (migration 0028). Fyrtioåtta omdömen låg på en enda
     * restaurang medan fjorton visade betyg utan en enda text bakom.
     *
     * Bord hör egentligen hemma i `seed.sql`. De läggs här därför att de bara
     * behövs för att demodatan ska bli trovärdig — en restaurang som just
     * anslutit sig har med rätta noll bord tills ägaren lagt upp dem.
     *
     * QR-koden är sex tecken ur Crockford base32 — alfabetet utan I, L, O och
     * U, så att en handskriven kod inte går att blanda ihop med 1, 0 eller V.
     * `tables_qr_public_id_format` kräver exakt det, och ett U i alfabetet
     * fällde hela demodatan på en check-constraint.
     */
    if not exists (
      select 1 from public.tables t
      where t.restaurant_id = v_rest.id and t.status = 'ACTIVE'
    ) then
      insert into public.tables (restaurant_id, table_number, qr_public_id, capacity)
      select
        v_rest.id,
        n::text,
        string_agg(
          substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                 1 + floor(random() * 32)::integer, 1),
          ''
        ),
        2 + (n % 3) * 2
      from generate_series(1, 6) as n,
           generate_series(1, 6) as c
      group by n;
    end if;

    v_refunded := false;

    for v_day in
      select generate_series(current_date - 90, current_date - 1, interval '1 day')::date
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

        /*
         * Ett bordssällskap per order, stängt när de gick.
         *
         * Historiken saknade sessioner helt, och sessionen är det som gör en
         * order till ett SÄLLSKAP i stället för en ensam rad. Två saker föll på
         * det: bordets gemensamma nota hade ingen historia att visa, och ett
         * omdöme gick inte att skapa alls — `reviews_has_author` kräver en
         * författare, och gästen vid bordet har inget konto. Sessionen ÄR
         * författaren (migration 0028).
         *
         * Stängd direkt: sällskapet gick hem för nittio dagar sedan. En öppen
         * session i historiken hade fått översikten att visa varje bord som
         * upptaget i evighet — precis felet migration 0035 finns för att rätta.
         */
        v_session_id := null;

        if v_table_id is not null then
          insert into public.table_sessions (
            table_id, restaurant_id, status, guest_count, opened_at, closed_at
          )
          values (
            v_table_id, v_rest.id, 'CLOSED', 1 + floor(random() * 4)::integer,
            v_completed - interval '55 minutes', v_completed + interval '25 minutes'
          )
          returning id into v_session_id;
        end if;

        /*
         * Var tolfte order avbryts.
         *
         * Avbrutna order fanns inte alls i demodatan, och följden var att varje
         * yta som hanterar dem — händelseloggen, kassans motbokning,
         * avräkningens kreditrad, statistikens bortfall — såg tom och
         * välfungerande ut. En yta som aldrig visats med data är oprövad.
         *
         * De sprids över hela historiken och inte över en enstaka vecka: en
         * avbokning är inte en händelse som inträffar en gång, den är en del av
         * en vanlig dag.
         *
         * Ingen avgift och ingen dricks på en avbruten order. Öppen fråga 15 —
         * ska en makulering kosta restaurangen något — är obesvarad, och
         * demodatan ska inte föregripa svaret.
         */
        v_cancelled := random() < 0.085;

        insert into public.orders (
          restaurant_id, table_id, table_session_id, type, status, idempotency_key,
          items_gross_ore, items_vat_ore, vat_by_rate, tip_ore, total_ore,
          placed_at, accepted_at, ready_at, completed_at, cancelled_at
        )
        values (
          v_rest.id, v_table_id, v_session_id,
          (case when v_table_id is null then 'PICKUP' else 'TABLE' end)::public.order_type,
          (case when v_cancelled then 'CANCELLED' else 'COMPLETED' end)::public.order_status,
          gen_random_uuid(),
          0, 0, '{}'::jsonb, 0, 0,
          v_completed - interval '38 minutes',
          v_completed - interval '36 minutes',
          case when v_cancelled then null else v_completed - interval '9 minutes' end,
          case when v_cancelled then null else v_completed end,
          case when v_cancelled then v_completed - interval '30 minutes' else null end
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
        -- En avbruten order får ingen: dricksen är personalens pengar för ett
        -- pass som blev av.
        v_tip := case
          when not v_cancelled and random() < 0.33 then round(v_gross * 0.1 / 100) * 100
          else 0
        end;

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

        /*
         * Avgiften och betalningen hör till en order som blev av.
         *
         * En avbruten order som ändå bar en avgift hade gjort avräkningen fel
         * på ett sätt som ser ut som en riktig faktura — och öppen fråga 15,
         * om en makulering ska kosta något, är fortfarande obesvarad.
         */
        if not v_cancelled then
          v_bps := v_rest.bps;
          insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore, created_at)
          values (v_order_id, v_rest.id, 'GROSS_ITEMS', v_gross, v_bps,
                  round(v_gross::numeric * v_bps / 10000), v_completed);
        end if;

        -- Tre av fyra notor kvitteras som kontanter. Resten står obetalda, som
        -- de gör i verkligheten tills någon i kassan hunnit med dem.
        if not v_cancelled and random() < 0.75 then
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

-- ── Ett pass som pågår ──────────────────────────────────────────────────────
--
-- Historiken ovan gör pengaytorna verkliga men lämnar Översikten död: varje
-- bord ledigt, planritningen enfärgad, köksskärmen tom. Det är samma tomhet
-- som demodatan finns för att ta bort, en yta bort.
--
-- Alla tre bordstillstånd måste synas SAMTIDIGT för att ritningen ska gå att
-- bedöma. Det är då man ser om färgerna går att skilja åt på en meters håll,
-- vilket är det avstånd en servitör faktiskt står på.
--
--   Bord 2 och 13   öppen nota, köket har inget ogjort
--   Bord 6 och 11   beställning inne — en under tillagning, en klar
--   resten          ledigt
--
-- Ordern går genom statusmaskinen steg för steg, inte rakt till PREPARING.
-- Triggern `orders_enforce_transition` skulle avvisa hoppet, och den har rätt:
-- demodata som kringgår regeln beskriver en produkt som inte finns.
--
-- Sektionen är ÅTERKÖRBAR, till skillnad från historiken ovan. Skälet är
-- konkret: `smoke.sh` driver varje aktiv order till COMPLETED och stänger
-- notorna, alltså tömmer den Översikten. Historikspärren hade sedan hindrat
-- `db:demo` från att lägga tillbaka passet, och enda vägen ut vore en full
-- reset — som tar bort de 90 dagarna på köpet. Varje bord kontrolleras därför
-- för sig, och det som redan lever lämnas i fred.

do $$
declare
  v_rest        uuid := '11111111-1111-1111-1111-111111111111';
  v_table       uuid;
  v_order       uuid;
  v_item        record;
  v_gross       integer;
  v_vat         integer;
  v_by_rate     jsonb;
  v_line        integer;
  v_qty         smallint;
  v_line_gross  integer;
  v_line_vat    integer;
  v_spec        record;
begin
  -- Notor utan något ogjort i köket.
  for v_spec in select unnest(array['2', '13']) as nr loop
    select id into v_table from public.tables
    where restaurant_id = v_rest and table_number = v_spec.nr;
    continue when v_table is null;

    continue when exists (
      select 1 from public.table_sessions
      where table_id = v_table and status = 'OPEN'
    );

    insert into public.table_sessions (table_id, restaurant_id, status, guest_count)
    values (v_table, v_rest, 'OPEN', 2);
  end loop;

  -- Bord med en beställning inne.
  --
  -- Rätterna skiljer sig åt mellan de två, och den ena bär både en notering
  -- till köket och en radnotering. Två identiska biljetter visar inte om
  -- biljetten går att läsa — det gör den först när den är olika lång, har en
  -- rad med tillval och en rad utan, och en notering som ska sticka ut.
  --
  -- BORD 6 HAR TVÅ. Det är inte utfyllnad: notan är gemensam per bord, och två
  -- gäster som beställer var för sig är normalfallet vid ett sällskapsbord.
  -- Köksskärmen grupperar biljetterna och märker dem "1 av 2" — och den
  -- funktionen går inte att bedöma i en demomiljö där varje bord har en enda
  -- beställning. Samma skäl som femton bord i stället för tre.
  for v_spec in
    select *, row_number() over (partition by nr order by minutes desc) as nth
    from (values
      -- Tiderna FLÄTAR bord 6 och 11 med flit: 6 kom in för 14 minuter sedan,
      -- 11 för 9, och bord 6 fyllde på för 4 minuter sedan. Rak FIFO hade
      -- radat dem 6 · 11 · 6 och lagt en annan nota mitt i sällskapets.
      -- Grupperingen ska ge 6 · 6 · 11. Med tiderna i ordning hade båda
      -- sorteringarna sett likadana ut, och funktionen inte gått att bedöma.
      --
      -- Bord 6 har dessutom en klar och en pågående order samtidigt — drycken
      -- hann före maten. Det är precis läget där en biljett som inte säger
      -- "1 av 2" får någon att köra ut halva bordet.
      ('6',  'PREPARING', 14, 0, 3, 'Allergi: en gäst tål inte mjölk.'),
      ('11', 'PREPARING',  9, 4, 2, null),
      ('6',  'READY',      4, 6, 2, null)
    ) as s(nr, target, minutes, skip, lines, kitchen_note)
  loop
    select id into v_table from public.tables
    where restaurant_id = v_rest and table_number = v_spec.nr;
    continue when v_table is null;

    -- Bordet lever redan. Att lägga en order till hade byggt på i stället för
    -- att återställa, och efter tre röktestkörningar stod det sex biljetter i
    -- köket för ett bord som har en.
    -- Bordet har redan så många aktiva beställningar som seeden vill ge det.
    -- Räknat och inte bara "finns någon", eftersom bord 6 ska ha två: en
    -- enkel existenskontroll hade lagt in den första och hoppat över den andra
    -- för alltid, och grupperingen i köket hade aldrig gått att se.
    continue when (
      select count(*) from public.orders
      where table_id = v_table
        and status in ('PLACED', 'ACCEPTED', 'PREPARING', 'READY')
    ) >= v_spec.nth;

    if not exists (
      select 1 from public.table_sessions where table_id = v_table and status = 'OPEN'
    ) then
      insert into public.table_sessions (table_id, restaurant_id, status, guest_count)
      values (v_table, v_rest, 'OPEN', 4);
    end if;

    insert into public.orders (
      restaurant_id, table_id, type, status, idempotency_key,
      items_gross_ore, items_vat_ore, vat_by_rate, tip_ore, total_ore, placed_at
    )
    values (
      v_rest, v_table, 'TABLE'::public.order_type, 'PLACED', gen_random_uuid(),
      0, 0, '{}'::jsonb, 0, 0, now() - make_interval(mins => v_spec.minutes)
    )
    returning id into v_order;

    if v_spec.kitchen_note is not null then
      update public.orders set note = v_spec.kitchen_note where id = v_order;
    end if;

    v_gross := 0; v_vat := 0; v_by_rate := '{}'::jsonb;
    v_line := 0;

    -- Riktiga rader ur menyn. En order utan rader är precis den testdata som
    -- redan lurat en läsare en gång.
    for v_item in
      select mi.id, mi.name, mi.price_ore, mi.vat_rate_bps
      from public.menu_items mi
      join public.menu_categories mc on mc.id = mi.category_id
      join public.menus m on m.id = mc.menu_id
      where m.restaurant_id = v_rest
        and mi.status = 'PUBLISHED'
        and mi.price_ore > 0
      order by mi.sort_order
      offset v_spec.skip
      limit v_spec.lines
    loop
      v_line := v_line + 1;
      -- Antalet varierar per rad. En biljett där varje rad står på "2×" visar
      -- inte om siffran är läsbar när den är ensiffrig respektive tvåsiffrig.
      v_qty := case v_line when 1 then 2 when 2 then 1 else 3 end;

      v_line_gross := v_item.price_ore * v_qty;
      v_line_vat := v_line_gross
                  - round(v_line_gross::numeric * 10000 / (10000 + v_item.vat_rate_bps));

      insert into public.order_items (
        order_id, restaurant_id, menu_item_id, name_snapshot,
        unit_price_ore, vat_rate_bps, quantity, line_gross_ore, note
      )
      values (
        v_order, v_rest, v_item.id, v_item.name,
        v_item.price_ore, v_item.vat_rate_bps, v_qty, v_line_gross,
        -- Radnoteringen bara på första raden av den ena biljetten. Den ska
        -- sticka ut mot resten, och det syns inte om varje rad har en.
        case when v_line = 1 and v_spec.kitchen_note is not null
             then 'Bez luka' end
      );

      v_gross := v_gross + v_line_gross;
      v_vat := v_vat + v_line_vat;
      v_by_rate := jsonb_set(
        v_by_rate, array[v_item.vat_rate_bps::text],
        to_jsonb(coalesce((v_by_rate ->> v_item.vat_rate_bps::text)::integer, 0) + v_line_vat));
    end loop;

    update public.orders
    set items_gross_ore = v_gross, items_vat_ore = v_vat,
        vat_by_rate = v_by_rate, total_ore = v_gross
    where id = v_order;

    -- Ett steg i taget, som köksskärmen gör det.
    update public.orders set status = 'ACCEPTED',
      accepted_at = now() - make_interval(mins => v_spec.minutes - 1) where id = v_order;
    update public.orders set status = 'PREPARING' where id = v_order;

    if v_spec.target = 'READY' then
      update public.orders set status = 'READY', ready_at = now() - interval '2 minutes'
      where id = v_order;
    end if;
  end loop;
end
$$;

/*
 * Omdömen på ungefär var femte genomförd order.
 *
 * Databasen hade ETT omdöme totalt. Följden var att restaurangsidans
 * omdömeslista, betyget på korten i upptäcktsvyn, personalens omdömesyta och
 * moderationen i backoffice alla såg tomma eller nästan tomma ut — fyra ytor
 * som är byggda och verifierade var för sig men aldrig setts med data.
 *
 * Omdömet hänger på en GENOMFÖRD order, och det är hela grunden för att
 * omdömena går att lita på: bara den som faktiskt handlat kan tycka något.
 * Därför läses de ur `orders` i stället för att hittas på fritt — en avbruten
 * order får inget omdöme, precis som i produkten.
 *
 * Författaren är bordssessionen och inte en användare. Så ser det ut i
 * verkligheten: gästen vid bordet har inget konto (migration 0028), och
 * `reviews_has_author` kräver bara att EN av de tre finns.
 *
 * Betygen är inte jämnt slumpade. En gäst som tar sig tid att skriva är oftare
 * nöjd än missnöjd, och en lista där ettor och femmor är lika vanliga läser som
 * genererad — vilket den är, men den ska inte se ut så.
 */
do $$
declare
  v_order   record;
  v_food    smallint;
  v_service smallint;
  v_comment text;
  v_written integer := 0;
  -- Kommentarerna står på marknadens språk. Restaurangens egen text och
  -- gästens egen text översätts aldrig — bara gränssnittet.
  v_good    text[] := array[
    'Odlično! Ćevapi kao nekad.',
    'Brza usluga i sve toplo. Vraćamo se.',
    'Najbolji burek u gradu, bez konkurencije.',
    'Sve pohvale za osoblje, veoma ljubazni.',
    'Porcije velike, cijena poštena.',
    'Naručili preko QR koda za stolom — gotovo za deset minuta.',
    'Sehr freundlich und schnell. Das Essen war ausgezeichnet.',
    'Great food, ordered straight from the table. No app needed.'
  ];
  v_mixed   text[] := array[
    'Hrana dobra, ali smo čekali malo duže nego što piše.',
    'Ukusno, mada je bilo prilično bučno.',
    'Dobro, ali bi salata mogla biti svježija.',
    'Essen gut, Wartezeit etwas lang.'
  ];
  v_poor    text[] := array[
    'Naručili smo dva jela, stiglo je jedno.',
    'Hladno kad je stiglo. Šteta, jer je ukus dobar.'
  ];
begin
  for v_order in
    select o.id, o.restaurant_id, o.table_session_id, o.completed_at
    from public.orders o
    where o.status = 'COMPLETED'
      and o.table_session_id is not null
      and o.completed_at is not null
      and not exists (select 1 from public.reviews rv where rv.order_id = o.id)
      and random() < 0.2
  loop
    -- Sjuttio procent fyror och femmor, tjugo blandat, tio klagomål.
    if random() < 0.7 then
      v_food    := 4 + floor(random() * 2)::smallint;
      v_service := 4 + floor(random() * 2)::smallint;
      v_comment := v_good[1 + floor(random() * array_length(v_good, 1))::integer];
    elsif random() < 0.67 then
      v_food    := 3;
      v_service := 3 + floor(random() * 2)::smallint;
      v_comment := v_mixed[1 + floor(random() * array_length(v_mixed, 1))::integer];
    else
      v_food    := 1 + floor(random() * 2)::smallint;
      v_service := 2;
      v_comment := v_poor[1 + floor(random() * array_length(v_poor, 1))::integer];
    end if;

    insert into public.reviews (
      order_id, restaurant_id, table_session_id,
      rating_food, rating_service, comment, is_published, created_at, updated_at
    )
    values (
      v_order.id, v_order.restaurant_id, v_order.table_session_id,
      v_food, v_service,
      -- Var tredje skriver ingenting. Ett betyg utan text är det vanligaste
      -- omdömet som finns, och listan ska tåla att rendera det.
      case when random() < 0.66 then v_comment else null end,
      true,
      v_order.completed_at + interval '2 hours',
      v_order.completed_at + interval '2 hours'
    );

    v_written := v_written + 1;
  end loop;

  raise notice 'Omdömen: % st', v_written;
end
$$;

/*
 * Några omdömen från den inloggade gästen.
 *
 * Alla andra kommer från bordssessioner, alltså QR-gäster utan konto — vilket
 * är realistiskt och samtidigt betyder att visningsnamnet (migration 0069) och
 * bilden (0068) ALDRIG syns i demodatan. Två ytor som är byggda och verifierade
 * men aldrig setts med data, exakt det den här filen finns för att förhindra.
 *
 * Bilden lämnas orörd: den kräver en riktig fil i lagringen, och en pekare till
 * en fil som inte finns är en trasig bild — sämre än ingen.
 */
do $$
declare
  v_gast uuid;
begin
  select id into v_gast from auth.users where email = 'gast@burp.test';
  if v_gast is null then
    return;
  end if;

  update public.profiles set display_name = 'Amina S.' where id = v_gast;

  /*
   * De två NYASTE per restaurang, inte tolv slumpade.
   *
   * Slumpen la dem över nittio dagar, och restaurangsidan visar de tjugo
   * senaste omdömena. Följden var att namnet fanns i databasen, funktionen
   * returnerade det, och sidan ändå inte visade ett enda — koden var rätt hela
   * tiden och demodatan gjorde funktionen osynlig.
   *
   * Det är samma sorts fel som att inte ha någon data alls, bara svårare att
   * se: allt SER ut att fungera.
   */
  with nyast as (
    select id, row_number() over (partition by restaurant_id order by created_at desc) as rn
    from public.reviews
    where user_id is null
  )
  update public.reviews r
  set user_id = v_gast
  from nyast
  where r.id = nyast.id and nyast.rn <= 2;

  raise notice 'Omdömen knutna till gästkontot: %', (
    select count(*) from public.reviews where user_id = v_gast
  );
end
$$;

/*
 * Bord, bokningar, kuponger och presentkort.
 *
 * Fyra ytor som var byggda, verifierade var för sig — och tomma. Mätt före:
 * fyrtiofem bord varav två hade egenskaper och ett hade tillägg, noll
 * bokningar, noll kuponger, noll presentkort.
 *
 * En yta som aldrig visats med data är oprövad. `/dashboard/bokningar`,
 * `/dashboard/erbjudanden` och `/dashboard/presentkort` gick att öppna och sa
 * "inget här än" — vilket ser ut som att de fungerar och bevisar ingenting.
 */
do $$
declare
  v_rest    record;
  v_table   record;
  v_i       integer;
  v_start   timestamptz;
  v_status  public.reservation_status;
  v_zones   text[];
  v_namn    text[] := array[
    'Amina Softić', 'Emir Hadžić', 'Lejla Begić', 'Tarik Kovačević',
    'Selma Đurić', 'Haris Mujić', 'Ivana Marić', 'Nikola Petrović'
  ];
  v_bokade  integer := 0;
begin
  for v_rest in
    select r.id, r.name, r.country, r.currency
    from public.restaurants r
    where r.status = 'ACTIVE'
      and exists (select 1 from public.tables t where t.restaurant_id = r.id)
  loop
    /*
     * ── Borden får ett rum, en form och en egenskap ──────────────────────
     *
     * Bara seed-restaurangen hade zoner. Utan zon skriver köksbiljetten bara
     * ett nummer, och "bord 6" är en halv adress i en lokal med uteservering
     * OCH en sal innanför. Det var därför zonen byggdes 2026-08-20; utan data
     * gick den aldrig att se.
     */
    v_zones := case
      when v_rest.country = 'HR' then array['Terasa', 'Unutra']
      else array['Bašta', 'Unutra']
    end;

    v_i := 0;
    for v_table in
      select id, table_number from public.tables
      where restaurant_id = v_rest.id and zone is null
      order by table_number
    loop
      v_i := v_i + 1;

      update public.tables
      set zone = v_zones[1 + (v_i % 2)],
          shape = case when v_i % 3 = 0 then 'SQUARE' else 'ROUND' end::public.table_shape,
          capacity = 2 + (v_i % 3) * 2,
          -- Egenskaperna översätts och kommer ur en fast lista (0054). Två av
          -- tre bord får någon; alla bord med samma märkning säger ingenting.
          attributes = case (v_i % 4)
            when 0 then array['WINDOW']
            when 1 then array['OUTDOOR', 'QUIET']
            when 2 then array['BOOTH']
            else array[]::text[]
          end,
          -- Tillägget hamnar på NOTAN i restaurangen. Burp tar aldrig emot det
          -- och det ingår inte i avgiftsunderlaget — regel 8.
          surcharge_ore = case when v_i % 5 = 0 then 500 else 0 end
      where id = v_table.id;
    end loop;

    /*
     * ── Bokningar över tre veckor ────────────────────────────────────────
     *
     * Spridda bakåt och framåt, och genom alla fem tillstånden. En vy som bara
     * visar kommande bokningar går inte att bedöma: det är NO_SHOW och
     * CANCELLED som avgör om listan är läsbar när något gått fel.
     *
     * Direktinsert och inte `create_reservation()`: den funktionen prövar
     * tiden mot `reservation_slots()`, som räknar ur öppettider och policy.
     * Rätt beteende i produkten, men en demorad som råkar hamna en halvtimme
     * utanför öppettiden hade fällt hela seeden i stället för att bli en rad.
     * Överlappsspärren i 0054 gäller ändå — därför en bokning per bord och dag.
     */
    v_i := 0;
    for v_table in
      select id from public.tables
      where restaurant_id = v_rest.id and status = 'ACTIVE'
      order by table_number
      limit 6
    loop
      v_i := v_i + 1;

      -- Från tio dagar bakåt till elva dagar framåt, ett bord i taget.
      v_start := date_trunc('hour', now()) - interval '10 days'
               + (v_i * interval '3 days') + interval '18 hours';

      v_status := case
        when v_start < now() - interval '2 days' then 'COMPLETED'
        when v_start < now() then (case when v_i % 3 = 0 then 'NO_SHOW' else 'COMPLETED' end)
        when v_i % 5 = 0 then 'CANCELLED'
        else 'BOOKED'
      end::public.reservation_status;

      insert into public.reservations (
        restaurant_id, table_id, guest_name, guest_phone, guest_email,
        party_size, during, status, note, cancelled_at, seated_at
      )
      values (
        v_rest.id, v_table.id,
        v_namn[1 + (v_i % array_length(v_namn, 1))],
        '+387 6' || lpad((100000 + v_i * 7919)::text, 7, '0'),
        'gast' || v_i || '@example.com',
        2 + (v_i % 4),
        tstzrange(v_start, v_start + interval '90 minutes', '[)'),
        v_status,
        case when v_i % 4 = 0 then 'Barnstol, tack.' else null end,
        case when v_status = 'CANCELLED' then v_start - interval '1 day' else null end,
        case when v_status in ('COMPLETED', 'NO_SHOW') then v_start else null end
      )
      on conflict do nothing;

      v_bokade := v_bokade + 1;
    end loop;

    /*
     * ── Kuponger: en i procent, en i pengar, en utgången ─────────────────
     *
     * Den utgångna är inte utfyllnad. En kupongyta som bara visar giltiga
     * koder ser ut att fungera tills någon undrar var förra månadens kampanj
     * tog vägen — och då är frågan om den utelämnades eller aldrig sparades.
     *
     * Existenskontroll och inte `on conflict`: koden är unik per restaurang
     * genom ett PARTIELLT index (`where restaurant_id is not null`), och en
     * on conflict-sats kan inte matcha det utan att upprepa predikatet. En
     * vanlig if-sats säger dessutom rakt ut vad den gör.
     */
    if not exists (select 1 from public.coupons c where c.restaurant_id = v_rest.id) then
      insert into public.coupons (
        code, restaurant_id, discount_bps, min_order_ore, max_redemptions,
        max_per_guest, valid_from, valid_until, is_active, funded_by
      )
      values
        ('DOBRODOSLI10', v_rest.id, 1000, 2000, 100, 1,
         now() - interval '20 days', now() + interval '40 days', true, 'RESTAURANT'),
        ('PETKOM' || upper(substr(md5(v_rest.id::text), 1, 4)),
         v_rest.id, 500, 1500, 50, 2,
         now() - interval '10 days', now() + interval '20 days', true, 'RESTAURANT'),
        ('LJETO' || upper(substr(md5(v_rest.name), 1, 4)),
         v_rest.id, 1500, 3000, 200, 1,
         now() - interval '80 days', now() - interval '15 days', true, 'RESTAURANT');
    end if;

    /*
     * ── Presentkort ──────────────────────────────────────────────────────
     *
     * Genom `issue_gift_card()` och inte som en rad: saldot räknas ur
     * transaktionerna, precis som lojalitetspoängen, och ett kort utan
     * utgivningsrad hade visat noll i kassan. Koden är tolv tecken ur samma
     * alfabet som formatet kräver — utan I, O, 0 och 1.
     */
    if not exists (select 1 from public.gift_cards g where g.restaurant_id = v_rest.id) then
      perform public.issue_gift_card(
        v_rest.id,
        upper(translate(substr(md5(v_rest.id::text || 'a'), 1, 12), 'abcdef01', 'ABCDEF23')),
        5000, v_rest.currency, now() + interval '1 year', 'poklon@example.com', 'Demo'
      );

      perform public.issue_gift_card(
        v_rest.id,
        upper(translate(substr(md5(v_rest.id::text || 'b'), 1, 12), 'abcdef01', 'BCDEFG34')),
        10000, v_rest.currency, now() + interval '6 months', null, 'Demo'
      );
    end if;
  end loop;

  raise notice 'Bokningar: %, kuponger och presentkort per restaurang: 3 + 2', v_bokade;
end
$$;

/*
 * Favoriter, och Burps utvalda.
 *
 * `co_favourites()` (migration 0070) räknar samförekomst: de som sparat något
 * du sparat, vad sparade de mer? Med EN favorit i hela databasen fanns
 * ingenting att räkna, och funktionen hade returnerat tomt för alltid — en yta
 * som ser trasig ut fast koden är rätt. Samma fel som visningsnamnet hade i
 * går, och som pengaytorna hade före det.
 *
 * Tjugo demogäster med två till fyra favoriter var ger ett signalvärde som
 * faktiskt går att bedöma: några restauranger sticker ut, andra gör det inte.
 * Ett jämnt utfall hade sett ut som slump, vilket det hade varit.
 */
do $$
declare
  v_gast    uuid;
  v_ny      uuid;
  v_rest    uuid;
  v_i       integer;
  v_j       integer;
  v_antal   integer;
  v_stad    text;
begin
  if (select count(*) from public.favorites) > 5 then
    raise notice 'Favoriter finns redan — läggs inte in igen.';
    return;
  end if;

  for v_i in 1..20 loop
    v_ny := gen_random_uuid();

    insert into auth.users (id, email, raw_user_meta_data)
    values (
      v_ny,
      'demogast' || v_i || '@example.com',
      jsonb_build_object('full_name', 'Demogäst ' || v_i)
    )
    on conflict do nothing;

    /*
     * Två till fyra favoriter, dragna med en vikt: restauranger med högre
     * betyg sparas oftare. Rent slumpade favoriter hade gett en lista där
     * allt är lika populärt, och då säger "andra sparade också" ingenting.
     */
    v_antal := 2 + floor(random() * 3)::integer;

    for v_j in 1..v_antal loop
      select r.id into v_rest
      from public.restaurants r
      where r.status = 'ACTIVE'
      order by random() * coalesce(r.rating_average, 3.5) desc
      limit 1;

      insert into public.favorites (user_id, restaurant_id)
      values (v_ny, v_rest)
      on conflict do nothing;
    end loop;
  end loop;

  -- Testgästen får två egna, så att samförekomsten har något att utgå från.
  select id into v_gast from auth.users where email = 'gast@burp.test';

  if v_gast is not null then
    insert into public.favorites (user_id, restaurant_id)
    select v_gast, r.id
    from public.restaurants r
    where r.status = 'ACTIVE'
    order by r.rating_average desc nulls last
    limit 2
    on conflict do nothing;
  end if;

  /*
   * Burps egna utvalda: två per stad.
   *
   * Egen lista och egen rubrik. Blandad med den räknade hade den gjort
   * påståendet om vad andra gäster gillar osant — se kommentaren i 0070.
   */
  for v_stad in select distinct city_slug from public.restaurants where status = 'ACTIVE' loop
    insert into public.featured_restaurants (city_slug, restaurant_id, sort_order, note)
    select v_stad, r.id, row_number() over (order by r.rating_average desc nulls last, r.name),
           'Demo — valt på betyg'
    from public.restaurants r
    where r.city_slug = v_stad and r.status = 'ACTIVE'
    order by r.rating_average desc nulls last, r.name
    limit 2
    on conflict (city_slug, restaurant_id) do nothing;
  end loop;

  raise notice 'Favoriter: %, utvalda: %',
    (select count(*) from public.favorites),
    (select count(*) from public.featured_restaurants);
end
$$;

commit;

select
  count(*)                                        as antal_order,
  count(*) filter (where status = 'CANCELLED')    as avbrutna,
  count(*) filter (where status = 'REFUNDED')     as aterbetalda,
  min(completed_at)::date                         as fran,
  max(completed_at)::date                         as till,
  (select count(*) from public.reviews)           as omdomen,
  (select count(*) from public.settlements)       as avrakningar
from public.orders;
