-- Tester för databaslogiken. Körs av scripts/verify-schema.sh mot en riktig
-- PostgreSQL, eftersom triggers och plpgsql-funktioner inte går att verifiera
-- med en parser.
--
-- Varje test kastar vid fel, och ON_ERROR_STOP i skriptet gör att hela körningen
-- avbryts. Rullas tillbaka till slut — testerna ska inte lämna data efter sig.

begin;

\set ON_ERROR_STOP on
\echo '   statusmaskin'

do $$
declare
  v_order_id uuid;
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_ok       boolean;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 12900)
  returning id into v_order_id;

  -- Tillåten övergång.
  update public.orders set status = 'PLACED' where id = v_order_id;

  -- Otillåtet hopp: PLACED → COMPLETED.
  begin
    update public.orders set status = 'COMPLETED' where id = v_order_id;
    raise exception 'FEL: statusmaskinen släppte igenom PLACED → COMPLETED';
  exception
    when check_violation then null;  -- förväntat
  end;

  -- Otillåtet bakåt: PLACED → DRAFT.
  begin
    update public.orders set status = 'DRAFT' where id = v_order_id;
    raise exception 'FEL: statusmaskinen släppte igenom PLACED → DRAFT';
  exception
    when check_violation then null;
  end;

  -- Tidsstämpeln ska ha satts av triggern, inte av applikationen.
  select placed_at is not null into v_ok from public.orders where id = v_order_id;
  if not v_ok then
    raise exception 'FEL: placed_at sattes inte när ordern gick till PLACED';
  end if;

  -- Slutläge: CANCELLED får inte lämnas.
  update public.orders set status = 'CANCELLED' where id = v_order_id;
  begin
    update public.orders set status = 'PLACED' where id = v_order_id;
    raise exception 'FEL: en avbruten order gick att återuppliva';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   order_events loggas och är oföränderlig'

do $$
declare
  v_order_id uuid;
  v_events   integer;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values ('11111111-1111-1111-1111-111111111111', 'PICKUP', 'DRAFT', gen_random_uuid(), 1000)
  returning id into v_order_id;

  update public.orders set status = 'PLACED'   where id = v_order_id;
  update public.orders set status = 'ACCEPTED' where id = v_order_id;

  select count(*) into v_events from public.order_events where order_id = v_order_id;
  if v_events <> 2 then
    raise exception 'FEL: förväntade 2 loggrader, fick %', v_events;
  end if;

  begin
    update public.order_events set event_type = 'FÖRFALSKAD' where order_id = v_order_id;
    raise exception 'FEL: order_events gick att skriva om';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.order_events where order_id = v_order_id;
    raise exception 'FEL: order_events gick att radera';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

\echo '   place_order skriver order, rader, avgift och logg'

do $$
declare
  v_key      uuid := gen_random_uuid();
  v_order_id uuid;
  v_again    uuid;
  v_fee      integer;
  v_lines    integer;
  v_options  integer;
  v_status   public.order_status;
begin
  v_order_id := public.place_order(jsonb_build_object(
    'idempotency_key', v_key,
    'restaurant_id', '11111111-1111-1111-1111-111111111111',
    'guest_id', null,
    'table_id', null,
    'table_session_id', null,
    'type', 'PICKUP',
    'status', 'PLACED',
    'note', null,
    'scheduled_for', null,
    'items_gross_ore', 14400,
    'items_vat_ore', 1543,
    'vat_by_rate', jsonb_build_object('1200', 1543),
    'delivery_fee_ore', 0,
    'discount_ore', 0,
    'tip_ore', 1000,
    'total_ore', 15400,
    'fee_base', 'GROSS_ITEMS',
    'fee_bps', 340,
    'fee_base_amount_ore', 14400,
    'fee_ore', 490,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'menu_item_id', '44444444-4444-4444-4444-444444444441',
        'name_snapshot', 'Ćevapi 10 kom',
        'unit_price_ore', 12900,
        'vat_rate_bps', 1200,
        'quantity', 1,
        'line_gross_ore', 14400,
        'note', 'utan basilika',
        'options', jsonb_build_array(
          jsonb_build_object('option_id', null, 'name_snapshot', 'Extra kajmak', 'price_ore', 1500)
        )
      )
    )
  ));

  select count(*) into v_lines   from public.order_items where order_id = v_order_id;
  select count(*) into v_options from public.order_item_options
    where order_item_id in (select id from public.order_items where order_id = v_order_id);
  select fee_ore into v_fee from public.fees where order_id = v_order_id;

  if v_lines <> 1   then raise exception 'FEL: förväntade 1 orderrad, fick %', v_lines; end if;
  if v_options <> 1 then raise exception 'FEL: förväntade 1 tillval, fick %', v_options; end if;
  if v_fee <> 490   then raise exception 'FEL: avgiften blev % i stället för 490', v_fee; end if;

  if not exists (select 1 from public.tips where order_id = v_order_id and amount_ore = 1000) then
    raise exception 'FEL: dricksen skrevs inte till tips';
  end if;

  if not exists (
    select 1 from public.order_events
    where order_id = v_order_id and event_type = 'ORDER_PLACED'
  ) then
    raise exception 'FEL: ORDER_PLACED loggades inte';
  end if;

  -- Idempotens: samma nyckel ger samma order, inte en ny.
  v_again := public.place_order(jsonb_build_object(
    'idempotency_key', v_key,
    'restaurant_id', '11111111-1111-1111-1111-111111111111',
    'type', 'PICKUP', 'status', 'PLACED',
    'items_gross_ore', 14400, 'items_vat_ore', 1543,
    'vat_by_rate', '{}'::jsonb,
    'delivery_fee_ore', 0, 'discount_ore', 0, 'tip_ore', 0, 'total_ore', 14400,
    'fee_base', 'GROSS_ITEMS', 'fee_bps', 340,
    'fee_base_amount_ore', 14400, 'fee_ore', 490,
    'lines', '[]'::jsonb
  ));

  if v_again <> v_order_id then
    raise exception 'FEL: samma idempotensnyckel gav två olika order (% och %)', v_order_id, v_again;
  end if;

  -- auto_accept ska ge accepted_at redan vid insert.
  select status into v_status from public.orders where id = v_order_id;
  if v_status <> 'PLACED' then
    raise exception 'FEL: status blev % i stället för PLACED', v_status;
  end if;
end
$$;

\echo '   place_order sätter accepted_at vid auto_accept'

do $$
declare
  v_order_id uuid;
begin
  v_order_id := public.place_order(jsonb_build_object(
    'idempotency_key', gen_random_uuid(),
    'restaurant_id', '11111111-1111-1111-1111-111111111111',
    'type', 'PICKUP', 'status', 'ACCEPTED',
    'items_gross_ore', 12900, 'items_vat_ore', 1382,
    'vat_by_rate', '{}'::jsonb,
    'delivery_fee_ore', 0, 'discount_ore', 0, 'tip_ore', 0, 'total_ore', 12900,
    'fee_base', 'GROSS_ITEMS', 'fee_bps', 340,
    'fee_base_amount_ore', 12900, 'fee_ore', 439,
    'lines', '[]'::jsonb
  ));

  if (select accepted_at from public.orders where id = v_order_id) is null then
    raise exception 'FEL: accepted_at sattes inte när ordern auto-accepterades';
  end if;
end
$$;

\echo '   betyg kräver en genomförd order'

do $$
declare
  v_order_id uuid;
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_user_id  uuid;
  v_snitt    numeric;
  v_antal    integer;
begin
  -- Omdömet behöver en avsändare sedan 0028: ett konto eller en bordssession.
  -- Det här är avhämtning, alltså en inloggad gäst.
  insert into auth.users (id, email) values (gen_random_uuid(), 'betyg@example.com')
  returning id into v_user_id;

  insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, v_user_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 12900)
  returning id into v_order_id;

  update public.orders set status = 'PLACED' where id = v_order_id;

  -- Ordern är inte klar än — betyget ska avvisas.
  begin
    insert into public.reviews (order_id, restaurant_id, user_id, rating_food)
    values (v_order_id, v_rest_id, v_user_id, 5);
    raise exception 'FEL: betyg gick att lämna på en order som inte var genomförd';
  exception
    when check_violation then null;
  end;

  update public.orders set status = 'ACCEPTED'  where id = v_order_id;
  update public.orders set status = 'PREPARING' where id = v_order_id;
  update public.orders set status = 'READY'     where id = v_order_id;
  update public.orders set status = 'COMPLETED' where id = v_order_id;

  insert into public.reviews (order_id, restaurant_id, user_id, rating_food)
  values (v_order_id, v_rest_id, v_user_id, 4);

  -- Snittbetyget ska ha cachats på restaurangen av triggern.
  select rating_average, rating_count into v_snitt, v_antal
  from public.restaurants where id = v_rest_id;

  if v_antal <> 1 or v_snitt <> 4.0 then
    raise exception 'FEL: snittbetyget blev % över % omdömen, förväntade 4.0 över 1', v_snitt, v_antal;
  end if;

  -- Ett betyg per order.
  begin
    insert into public.reviews (order_id, restaurant_id, user_id, rating_food)
    values (v_order_id, v_rest_id, v_user_id, 1);
    raise exception 'FEL: samma order gick att recensera två gånger';
  exception
    when unique_violation then null;
  end;
end
$$;

\echo '   ett bord kan bara ha en öppen nota'

do $$
declare
  v_table_id uuid;
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
begin
  select id into v_table_id from public.tables where qr_public_id = 'R7K2M9';

  insert into public.table_sessions (table_id, restaurant_id, status)
  values (v_table_id, v_rest_id, 'OPEN');

  begin
    insert into public.table_sessions (table_id, restaurant_id, status)
    values (v_table_id, v_rest_id, 'OPEN');
    raise exception 'FEL: bordet fick två öppna notor samtidigt';
  exception
    when unique_violation then null;
  end;

  -- Stängd nota blockerar inte en ny.
  update public.table_sessions set status = 'CLOSED' where table_id = v_table_id;
  insert into public.table_sessions (table_id, restaurant_id, status)
  values (v_table_id, v_rest_id, 'OPEN');
end
$$;

\echo '   öppettider'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  -- Seed-restaurangen i Sarajevo har öppet 08–22 på tisdagar.
  if not public.is_restaurant_open(v_rest_id, '2026-08-11 12:00:00+02'::timestamptz) then
    raise exception 'FEL: restaurangen räknades som stängd mitt på dagen';
  end if;

  if public.is_restaurant_open(v_rest_id, '2026-08-11 23:30:00+02'::timestamptz) then
    raise exception 'FEL: restaurangen räknades som öppen efter stängning';
  end if;

  if public.is_restaurant_open(v_rest_id, '2026-08-11 03:00:00+02'::timestamptz) then
    raise exception 'FEL: restaurangen räknades som öppen mitt i natten';
  end if;
end
$$;

\echo '   qr_public_id är unikt och formatvaliderat'

do $$
begin
  begin
    insert into public.tables (restaurant_id, table_number, qr_public_id)
    values ('11111111-1111-1111-1111-111111111111', '99', 'R7K2M9');
    raise exception 'FEL: två bord kunde dela samma QR-kod';
  exception
    when unique_violation then null;
  end;

  -- I finns inte i alfabetet (förväxlas med 1).
  begin
    insert into public.tables (restaurant_id, table_number, qr_public_id)
    values ('11111111-1111-1111-1111-111111111111', '98', 'R7K2MI');
    raise exception 'FEL: ett qr_public_id med otillåtet tecken accepterades';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   city_slug genereras med svenska tecken translittererade'

do $$
declare
  v_slug text;
begin
  select city_slug into v_slug from public.restaurants
  where id = '11111111-1111-1111-1111-111111111111';

  if v_slug <> 'sarajevo' then
    raise exception 'FEL: city_slug blev "%" i stället för "sarajevo"', v_slug;
  end if;
end
$$;

\echo '   lojalitetsloggen är oföränderlig'

do $$
declare
  v_account_id uuid;
  v_user_id    uuid;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'test@example.com') returning id into v_user_id;

  insert into public.loyalty_accounts (user_id) values (v_user_id) returning id into v_account_id;
  insert into public.loyalty_transactions (account_id, kind, points) values (v_account_id, 'EARN', 100);

  begin
    update public.loyalty_transactions set points = 999999 where account_id = v_account_id;
    raise exception 'FEL: lojalitetspoäng gick att skriva om i efterhand';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

\echo '   profil skapas automatiskt för nya konton'

do $$
declare
  v_user_id uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), 'ny@example.com', '{"full_name": "Ny Gäst"}'::jsonb)
  returning id into v_user_id;

  if not exists (
    select 1 from public.profiles where id = v_user_id and full_name = 'Ny Gäst'
  ) then
    raise exception 'FEL: profilen skapades inte när kontot registrerades';
  end if;
end
$$;

\echo '   statistiken räknar bara genomförda order'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  -- Eget tidsfönster i det förflutna. Tidigare test i samma transaktion lämnar
  -- genomförda order med completed_at = now(), och de skulle annars räknas med
  -- här — testet blir då beroende av i vilken ordning blocken körs.
  v_from     timestamptz := '2020-01-01 00:00:00+01';
  v_to       timestamptz := '2020-02-01 00:00:00+01';
  v_stamp    timestamptz := '2020-01-15 12:00:00+01';
  v_order_id uuid;
  v_summary  record;
  v_top      record;
  v_prep     record;
begin
  -- Tre order: en genomförd, en avbruten, en som fortfarande tillagas.
  -- Bara den första ska räknas som omsättning.
  for i in 1..3 loop
    insert into public.orders (
      restaurant_id, type, status, idempotency_key,
      items_gross_ore, items_vat_ore, vat_by_rate, tip_ore, total_ore
    )
    values (
      v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(),
      10000, 1453, jsonb_build_object('1700', 1453), 500, 10500
    )
    returning id into v_order_id;

    insert into public.order_items (
      order_id, restaurant_id, name_snapshot, unit_price_ore,
      vat_rate_bps, quantity, line_gross_ore
    )
    values (v_order_id, v_rest_id, 'Testrört', 10000, 1700, 1, 10000);

    insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore)
    values (v_order_id, v_rest_id, 'GROSS_ITEMS', 10000, 340, 340);

    -- `place_order` skriver dricksraden; den här ordern skrivs för hand och
    -- måste göra det själv. Statistiken läser liggaren och inte `tip_ore`
    -- sedan migration 0040 — den avbrutna orderns dricks släpps av triggern.
    insert into public.tips (order_id, restaurant_id, amount_ore)
    values (v_order_id, v_rest_id, 500);

    update public.orders set status = 'PLACED'    where id = v_order_id;

    if i = 2 then
      update public.orders set status = 'CANCELLED' where id = v_order_id;
    else
      update public.orders set status = 'ACCEPTED'  where id = v_order_id;
      update public.orders set status = 'PREPARING' where id = v_order_id;
      if i = 1 then
        update public.orders set status = 'READY'     where id = v_order_id;
        update public.orders set status = 'COMPLETED' where id = v_order_id;

        -- Flyttas in i testets fönster. Statustriggern är BEFORE UPDATE OF
        -- status och rör inte en uppdatering som bara sätter tidsstämplar.
        update public.orders
        set completed_at = v_stamp,
            placed_at    = v_stamp - interval '15 minutes',
            ready_at     = v_stamp - interval '2 minutes'
        where id = v_order_id;
      end if;
    end if;
  end loop;

  select * into v_summary
  from public.restaurant_revenue_summary(v_rest_id, v_from, v_to);

  if v_summary.orders_count <> 1 then
    raise exception 'FEL: statistiken räknade % order, bara den genomförda skulle räknas', v_summary.orders_count;
  end if;
  if v_summary.items_gross_ore <> 10000 then
    raise exception 'FEL: omsättningen blev % öre, väntade 10000', v_summary.items_gross_ore;
  end if;
  if v_summary.items_net_ore <> 10000 - 1453 then
    raise exception 'FEL: nettot blev % öre', v_summary.items_net_ore;
  end if;
  if v_summary.tips_ore <> 500 then
    raise exception 'FEL: dricksen blev % öre, väntade 500', v_summary.tips_ore;
  end if;
  if v_summary.fees_ore <> 340 then
    raise exception 'FEL: avgiften blev % öre, väntade 340 (bara genomförd order)', v_summary.fees_ore;
  end if;
  if v_summary.avg_order_ore <> 10000 then
    raise exception 'FEL: snittnotan blev % öre', v_summary.avg_order_ore;
  end if;

  -- Utanför perioden ska ingenting räknas.
  select * into v_summary
  from public.restaurant_revenue_summary(v_rest_id, '2019-01-01 00:00:00+01', '2019-02-01 00:00:00+01');
  if v_summary.orders_count <> 0 or v_summary.items_gross_ore <> 0 then
    raise exception 'FEL: order utanför perioden räknades med';
  end if;

  -- Populäraste rätter: bara den genomförda ordern bidrar.
  select * into v_top
  from public.restaurant_top_items(v_rest_id, v_from, v_to, 10)
  where name = 'Testrört';

  if v_top.quantity <> 1 then
    raise exception 'FEL: topplistan räknade % st, väntade 1', v_top.quantity;
  end if;

  -- Tillagningstid mäts bara på order som faktiskt nått READY.
  select * into v_prep from public.restaurant_prep_times(v_rest_id, v_from, v_to);
  if v_prep.measured_orders <> 1 then
    raise exception 'FEL: tillagningstid mättes på % order, väntade 1', v_prep.measured_orders;
  end if;
end
$$;

\echo '   momsen delas upp per sats'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
  v_mat     bigint;
  v_alkohol bigint;
begin
  select vat_ore into v_mat
  from public.restaurant_vat_breakdown(v_rest_id, '2020-01-01 00:00:00+01', '2020-02-01 00:00:00+01')
  where vat_rate_bps = 1700;

  if coalesce(v_mat, 0) = 0 then
    raise exception 'FEL: momsen för 17 %% saknas i uppdelningen';
  end if;

  select vat_ore into v_alkohol
  from public.restaurant_vat_breakdown(v_rest_id, '2020-01-01 00:00:00+01', '2020-02-01 00:00:00+01')
  where vat_rate_bps = 2500;

  -- Ingen omsättning på den satsen i testdatan — den ska då inte dyka upp alls,
  -- inte som en nolla. En sats med noll kronor bakom sig är brus i redovisningen.
  if v_alkohol is not null then
    raise exception 'FEL: en momssats utan omsättning listades ändå';
  end if;
end
$$;

\echo '   plattformsrollen är skild från restaurangpersonal'

do $$
declare
  v_burp_user  uuid;
  v_staff_user uuid;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'backoffice@burp.test') returning id into v_burp_user;
  insert into auth.users (id, email) values (gen_random_uuid(), 'personal@restaurang.test') returning id into v_staff_user;

  insert into public.platform_admins (user_id, role) values (v_burp_user, 'owner');

  insert into public.staff (restaurant_id, user_id, role)
  values ('11111111-1111-1111-1111-111111111111', v_staff_user, 'owner');

  -- En plattformsadmin ska INTE dyka upp i restaurangens personallista.
  -- Frestelsen att lösa backoffice genom att lägga Burp-personal i staff på
  -- varje restaurang är just det här testet finns för att stänga.
  if exists (select 1 from public.staff where user_id = v_burp_user) then
    raise exception 'FEL: plattformsadmin hamnade i en restaurangs personallista';
  end if;

  -- Och restaurangpersonal ska inte råka bli plattformsadmin.
  if exists (select 1 from public.platform_admins where user_id = v_staff_user) then
    raise exception 'FEL: restaurangpersonal hamnade i plattformsrollen';
  end if;
end
$$;

\echo '   plattformsrollens funktioner svarar utan inloggning'

do $$
begin
  -- Utan auth.uid() (ingen session) ska funktionerna svara nej, inte kasta.
  -- Kastar de blir varje anonym sidladdning ett fel i stället för en tom vy.
  if public.is_platform_admin() then
    raise exception 'FEL: is_platform_admin() gav true utan inloggad användare';
  end if;

  if public.has_platform_role(array['owner']::public.platform_role[]) then
    raise exception 'FEL: has_platform_role() gav true utan inloggad användare';
  end if;
end
$$;

\echo '   plattformsöversikten summerar över alla restauranger'

do $$
declare
  v_summary record;
begin
  select * into v_summary
  from public.platform_summary('2000-01-01 00:00:00+01', '2100-01-01 00:00:00+01');

  -- Seed har sju restauranger. Siffran ska komma från tabellen, inte från
  -- de order som råkar finnas.
  if v_summary.restaurants_total < 7 then
    raise exception 'FEL: plattformsöversikten räknade % restauranger, väntade minst 7',
      v_summary.restaurants_total;
  end if;

  if v_summary.restaurants_active < 7 then
    raise exception 'FEL: % aktiva restauranger, seed har sju aktiva',
      v_summary.restaurants_active;
  end if;
end
$$;

\echo '   valutan fryses på ordern och blandas aldrig i statistiken'

do $$
declare
  v_bosnisk  uuid := '11111111-1111-1111-1111-111111111111';
  v_kroatisk uuid;
  v_order    uuid;
  v_currency public.currency_code;
  v_rader    integer;
  v_gmv      bigint;
begin
  -- Valutan sätts av triggern, inte av den som skriver raden. Vi försöker
  -- skicka med fel valuta för att se att den skrivs över.
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             currency, items_gross_ore, total_ore)
  values (v_bosnisk, 'PICKUP', 'DRAFT', gen_random_uuid(), 'SEK', 1200, 1200)
  returning id into v_order;

  select currency into v_currency from public.orders where id = v_order;
  if v_currency <> 'BAM' then
    raise exception 'FEL: ordern fick valutan % i stället för restaurangens BAM', v_currency;
  end if;

  -- En kroatisk restaurang med en genomförd order i euro.
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Konoba Valuta', 'konoba-valuta', '88800011122',
          'Ilica 5', '10000', 'Zagreb', 'ACTIVE', 'HR', 'EUR')
  returning id into v_kroatisk;

  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, total_ore)
  values (v_kroatisk, 'PICKUP', 'DRAFT', gen_random_uuid(), 5000, 5000)
  returning id into v_order;

  for i in 1..1 loop
    update public.orders set status = 'PLACED'    where id = v_order;
    update public.orders set status = 'ACCEPTED'  where id = v_order;
    update public.orders set status = 'PREPARING' where id = v_order;
    update public.orders set status = 'READY'     where id = v_order;
    update public.orders set status = 'COMPLETED' where id = v_order;
  end loop;

  update public.orders set completed_at = '2021-06-15 12:00:00+02' where id = v_order;

  /*
   * Poängen med hela uppdelningen: en rad per valuta.
   *
   * Den gamla platform_summary lade ihop items_gross_ore över alla order i
   * plattformen. Med bosniska fening, euro-cent och dinarer i samma summa blev
   * det ett tal som ser ut som pengar men inte är det.
   */
  select count(*) into v_rader
  from public.platform_revenue_by_currency('2021-01-01 00:00:00+01', '2021-12-31 00:00:00+01');

  if v_rader <> 1 then
    raise exception 'FEL: väntade en valutarad för perioden, fick %', v_rader;
  end if;

  select gmv_ore into v_gmv
  from public.platform_revenue_by_currency('2021-01-01 00:00:00+01', '2021-12-31 00:00:00+01')
  where currency = 'EUR';

  if v_gmv <> 5000 then
    raise exception 'FEL: EUR-omsättningen blev %, väntade 5000', v_gmv;
  end if;

  -- Och att beloppen inte längre går att få ut som en enda klump.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and column_name = 'gmv_ore'
      and table_name = 'platform_summary'
  ) then
    raise exception 'FEL: platform_summary har fått tillbaka ett belopp som spänner över valutor';
  end if;
end
$$;

\echo '   lojalitetspoäng delas ut vid slutförd order'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_user_id  uuid;
  v_order_id uuid;
  v_points   integer;
  v_expires  timestamptz;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'poang@example.com') returning id into v_user_id;

  insert into public.orders (
    restaurant_id, guest_id, type, status, idempotency_key,
    items_gross_ore, items_vat_ore, tip_ore, total_ore
  )
  values (v_rest_id, v_user_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 14950, 1602, 1000, 15950)
  returning id into v_order_id;

  update public.orders set status = 'PLACED'    where id = v_order_id;
  update public.orders set status = 'ACCEPTED'  where id = v_order_id;
  update public.orders set status = 'PREPARING' where id = v_order_id;
  update public.orders set status = 'READY'     where id = v_order_id;

  -- Ingen poäng förrän ordern faktiskt är slutförd.
  if exists (
    select 1 from public.loyalty_transactions t
    join public.loyalty_accounts a on a.id = t.account_id
    where a.user_id = v_user_id
  ) then
    raise exception 'FEL: poäng delades ut innan ordern var slutförd';
  end if;

  update public.orders set status = 'COMPLETED' where id = v_order_id;

  select t.points, t.expires_at into v_points, v_expires
  from public.loyalty_transactions t
  join public.loyalty_accounts a on a.id = t.account_id
  where a.user_id = v_user_id and t.order_id = v_order_id;

  -- 149,50 kr → 149 poäng. Avrundat nedåt: uppåt skulle göra poängskulden
  -- större än omsättningen den bygger på. Dricksen ingår inte.
  if v_points is distinct from 149 then
    raise exception 'FEL: poängen blev %, väntade 149 (149,50 kr, dricks exkluderad)', v_points;
  end if;

  if v_expires is null then
    raise exception 'FEL: poängen saknar utgångsdatum — skulden kan aldrig stängas';
  end if;
end
$$;

\echo '   anonym bordsbeställning ger inga poäng'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_table_id uuid;
  v_order_id uuid;
  v_before   bigint;
  v_after    bigint;
begin
  select count(*) into v_before from public.loyalty_transactions;
  select id into v_table_id from public.tables where qr_public_id = 'B3H8N5';

  insert into public.orders (
    restaurant_id, guest_id, table_id, type, status, idempotency_key,
    items_gross_ore, items_vat_ore, total_ore
  )
  values (v_rest_id, null, v_table_id, 'TABLE', 'DRAFT', gen_random_uuid(), 10000, 1071, 10000)
  returning id into v_order_id;

  update public.orders set status = 'PLACED'    where id = v_order_id;
  update public.orders set status = 'ACCEPTED'  where id = v_order_id;
  update public.orders set status = 'PREPARING' where id = v_order_id;
  update public.orders set status = 'READY'     where id = v_order_id;
  update public.orders set status = 'COMPLETED' where id = v_order_id;

  select count(*) into v_after from public.loyalty_transactions;

  -- Inte en brist utan en följd av att QR-flödet inte kräver konto.
  if v_after <> v_before then
    raise exception 'FEL: en anonym beställning skapade % lojalitetsrader', v_after - v_before;
  end if;
end
$$;

\echo '   godkänd media publiceras, avvisad tas bort'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_item_id  uuid := '44444444-4444-4444-4444-444444444441';
  v_media_id uuid;
  v_url      text;
begin
  insert into public.media (restaurant_id, menu_item_id, kind, storage_path, alt_text)
  values (v_rest_id, v_item_id, 'IMAGE', v_rest_id || '/test.jpg', 'Testbild')
  returning id into v_media_id;

  -- PENDING ska inte synas för gästen.
  select image_url into v_url from public.menu_items where id = v_item_id;
  if v_url is not null then
    raise exception 'FEL: en ogranskad bild publicerades direkt';
  end if;

  update public.media set status = 'APPROVED' where id = v_media_id;

  select image_url into v_url from public.menu_items where id = v_item_id;
  if v_url is null or v_url not like '%menu-media%' then
    raise exception 'FEL: godkännandet publicerade ingen bild (image_url = %)', v_url;
  end if;

  -- Tillbakadraget godkännande ska ta bort bilden ur menyn.
  update public.media set status = 'REJECTED' where id = v_media_id;

  select image_url into v_url from public.menu_items where id = v_item_id;
  if v_url is not null then
    raise exception 'FEL: en tillbakadragen bild låg kvar i menyn';
  end if;
end
$$;

\echo '   avvisad bild raderar inte en nyare godkänd'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
  v_item_id uuid := '44444444-4444-4444-4444-444444444442';
  v_gammal  uuid;
  v_ny      uuid;
  v_url     text;
begin
  insert into public.media (restaurant_id, menu_item_id, kind, storage_path)
  values (v_rest_id, v_item_id, 'IMAGE', v_rest_id || '/gammal.jpg')
  returning id into v_gammal;

  insert into public.media (restaurant_id, menu_item_id, kind, storage_path)
  values (v_rest_id, v_item_id, 'IMAGE', v_rest_id || '/ny.jpg')
  returning id into v_ny;

  update public.media set status = 'APPROVED' where id = v_gammal;
  update public.media set status = 'APPROVED' where id = v_ny;

  -- Den nyare bilden gäller nu. Att dra tillbaka den äldre får inte ta med
  -- sig den nyare — pekaren pekar inte längre på den gamla.
  update public.media set status = 'REJECTED' where id = v_gammal;

  select image_url into v_url from public.menu_items where id = v_item_id;
  if v_url is null or v_url not like '%ny.jpg' then
    raise exception 'FEL: den nyare godkända bilden försvann (image_url = %)', v_url;
  end if;
end
$$;

\echo '   borttagen rad räknar om summa och avgift'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_order_id uuid;
  v_rad_a    uuid;
  v_rad_b    uuid;
  v_total    integer;
  v_gross    integer;
  v_fee      integer;
  v_vat      integer;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, items_vat_ore, vat_by_rate, tip_ore, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(),
          27800, 4039, jsonb_build_object('1700', 4039), 1000, 28800)
  returning id into v_order_id;

  insert into public.order_items (order_id, restaurant_id, name_snapshot, unit_price_ore,
                                  vat_rate_bps, quantity, line_gross_ore)
  values (v_order_id, v_rest_id, 'Ćevapi 10 kom', 12900, 1700, 1, 12900)
  returning id into v_rad_a;

  insert into public.order_items (order_id, restaurant_id, name_snapshot, unit_price_ore,
                                  vat_rate_bps, quantity, line_gross_ore)
  values (v_order_id, v_rest_id, 'Pljeskavica', 14900, 1700, 1, 14900)
  returning id into v_rad_b;

  insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore)
  values (v_order_id, v_rest_id, 'GROSS_ITEMS', 27800, 340, 945);

  update public.orders set status = 'PLACED' where id = v_order_id;

  perform public.remove_order_item(v_order_id, v_rad_b);

  select items_gross_ore, total_ore, items_vat_ore into v_gross, v_total, v_vat
  from public.orders where id = v_order_id;

  if v_gross <> 12900 then
    raise exception 'FEL: summan blev % efter borttagning, väntade 12900', v_gross;
  end if;

  -- Dricksen ligger kvar; den är gästens pengar och rörs inte av att en rätt
  -- tas bort.
  if v_total <> 13900 then
    raise exception 'FEL: totalen blev %, väntade 13900 (12900 + 1000 dricks)', v_total;
  end if;

  -- 17 % av 12900 brutto = 12900 - 12900/1,17 = 1874.
  if v_vat <> 1874 then
    raise exception 'FEL: momsen blev % öre, väntade 1874', v_vat;
  end if;

  -- Avgiften måste följa med. Görs den inte det tar Burp betalt för mat som
  -- togs bort — och det upptäcks först i restaurangens bokföring.
  select fee_ore into v_fee from public.fees where order_id = v_order_id;
  if v_fee <> 439 then
    raise exception 'FEL: avgiften blev % öre, väntade 439 (3,40 %% av 12900)', v_fee;
  end if;

  if not exists (
    select 1 from public.order_events
    where order_id = v_order_id and event_type = 'ITEM_REMOVED'
  ) then
    raise exception 'FEL: borttagningen loggades inte';
  end if;

  -- Sista raden ska vägras. En tom order är en avbruten order.
  begin
    perform public.remove_order_item(v_order_id, v_rad_a);
    raise exception 'FEL: sista raden gick att ta bort';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   momssatsen måste gälla i restaurangens land'

do $$
declare
  v_kroatien uuid;
  v_kategori uuid;
  v_meny     uuid;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Konoba Adriatica', 'konoba-adriatica', '99900011122',
          'Ilica 1', '10000', 'Zagreb', 'ACTIVE', 'HR', 'EUR')
  returning id into v_kroatien;

  insert into public.menus (restaurant_id, name, status)
  values (v_kroatien, 'Meni', 'PUBLISHED') returning id into v_meny;

  insert into public.menu_categories (menu_id, restaurant_id, name)
  values (v_meny, v_kroatien, 'Riba') returning id into v_kategori;

  -- Kroatisk matmoms är 13 %, inte svenska 12 %. Utan triggern hade den
  -- svenska satsen glidit in obemärkt och landat i bokföringen.
  begin
    insert into public.menu_items (category_id, restaurant_id, name, price_ore, vat_rate_bps)
    values (v_kategori, v_kroatien, 'Riblja plata', 18900, 1200);
    raise exception 'FEL: svensk momssats accepterades i Kroatien';
  exception
    when check_violation then null;
  end;

  insert into public.menu_items (category_id, restaurant_id, name, price_ore, vat_rate_bps)
  values (v_kategori, v_kroatien, 'Riblja plata', 18900, 1300);

  -- Ett svenskt organisationsnummer har tio siffror och duger inte som OIB.
  begin
    insert into public.restaurants (
      name, slug, org_number, street_address, postal_code, city, status, country, currency
    )
    values ('Fel OIB', 'fel-oib', '5566778899', 'Ilica 2', '10000', 'Zagreb', 'ACTIVE', 'HR', 'EUR');
    raise exception 'FEL: tiosiffrigt organisationsnummer accepterades som OIB';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   bosnisk moms har en enda sats'

do $$
begin
  if public.allowed_vat_rates('BA') <> array[1700] then
    raise exception 'FEL: Bosnien fick % i stället för en enda sats på 17 %%',
      public.allowed_vat_rates('BA');
  end if;

  if public.allowed_vat_rates('RS') <> array[1000, 2000] then
    raise exception 'FEL: serbiska momssatser blev %', public.allowed_vat_rates('RS');
  end if;
end
$$;

\echo '   betalkontot följer restaurangens valuta'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  -- Seedrestaurangen ligger i Sarajevo och prissätter i mark. Ett konto som
  -- avräknar i euro tar emot rätt siffra i fel valuta, och det syns först i
  -- avräkningen — därför stoppas det här.
  begin
    insert into public.restaurant_payment_accounts
      (restaurant_id, provider, external_account_id, currency)
    values (v_rest_id, 'STRIPE', 'acct_fel', 'EUR');
    raise exception 'FEL: betalkonto i annan valuta än restaurangens accepterades';
  exception
    when check_violation then null;
  end;

  insert into public.restaurant_payment_accounts
    (restaurant_id, provider, external_account_id, currency, status)
  values (v_rest_id, 'MONRI', 'mid_1', 'BAM', 'ACTIVE');

  -- Två konton hos samma leverantör betyder att hälften av betalningarna
  -- hamnar på fel ställe.
  begin
    insert into public.restaurant_payment_accounts
      (restaurant_id, provider, external_account_id, currency)
    values (v_rest_id, 'MONRI', 'mid_2', 'BAM');
    raise exception 'FEL: två Monri-konton på samma restaurang accepterades';
  exception
    when unique_violation then null;
  end;
end
$$;

\echo '   betalningen ärver valutan från ordern'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_order_id uuid;
  v_currency public.currency_code;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 1200)
  returning id into v_order_id;

  -- Anroparen försöker sätta kronor. Triggern skriver över med orderns valuta.
  insert into public.payments
    (order_id, restaurant_id, amount_ore, currency, provider, status, idempotency_key)
  values (v_order_id, v_rest_id, 1200, 'SEK', 'STRIPE', 'PENDING', gen_random_uuid());

  select currency into v_currency from public.payments where order_id = v_order_id;
  if v_currency <> 'BAM' then
    raise exception 'FEL: betalningen fick valutan % i stället för orderns BAM', v_currency;
  end if;
end
$$;

\echo '   betalningens statusmaskin och oföränderliga fält'

do $$
declare
  v_rest_id    uuid := '11111111-1111-1111-1111-111111111111';
  v_order_id   uuid;
  v_payment_id uuid;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 1200)
  returning id into v_order_id;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key)
  values (v_order_id, v_rest_id, 1200, 'STRIPE', 'PENDING', gen_random_uuid())
  returning id into v_payment_id;

  update public.payments set status = 'CAPTURED', captured_at = now() where id = v_payment_id;

  -- Bakåt går inte. En capturad betalning som blir PENDING igen är en order
  -- som ser obetald ut trots att pengarna kommit in.
  begin
    update public.payments set status = 'PENDING' where id = v_payment_id;
    raise exception 'FEL: betalningen gick från CAPTURED tillbaka till PENDING';
  exception
    when check_violation then null;
  end;

  -- Beloppet är det som gör raden till bevis.
  begin
    update public.payments set amount_ore = 1 where id = v_payment_id;
    raise exception 'FEL: beloppet på en betalning gick att ändra';
  exception
    when check_violation then null;
  end;

  -- Och den tas aldrig bort.
  begin
    delete from public.payments where id = v_payment_id;
    raise exception 'FEL: en betalningsrad gick att radera';
  exception
    when insufficient_privilege then null;
  end;

  update public.payments set status = 'REFUNDED' where id = v_payment_id;
  begin
    update public.payments set status = 'CAPTURED' where id = v_payment_id;
    raise exception 'FEL: en återbetald betalning gick att capturera igen';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   kortordern lyfts ur DRAFT först när betalningen bekräftats'

do $$
declare
  v_rest_id    uuid := '11111111-1111-1111-1111-111111111111';
  v_order_id   uuid;
  v_payment_id uuid;
  v_status     public.order_status;
  v_placed     timestamptz;
  v_tip_link   uuid;
begin
  v_order_id := public.place_order(jsonb_build_object(
    'restaurant_id',       v_rest_id,
    'type',                'PICKUP',
    'status',              'DRAFT',
    'idempotency_key',     gen_random_uuid(),
    'items_gross_ore',     1200,
    'items_vat_ore',       174,
    'delivery_fee_ore',    0,
    'discount_ore',        0,
    'tip_ore',             100,
    'total_ore',           1300,
    'fee_base',            'GROSS_ITEMS',
    'fee_base_amount_ore', 1200,
    'fee_bps',             340,
    'fee_ore',             41,
    'lines',               '[]'::jsonb
  ));

  -- Ett utkast är inte lagt. Hade placed_at satts här hade kvittot och
  -- statistiken påstått att ordern lades trots att den aldrig betalades.
  select placed_at into v_placed from public.orders where id = v_order_id;
  if v_placed is not null then
    raise exception 'FEL: en DRAFT-order fick placed_at satt';
  end if;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key)
  values (v_order_id, v_rest_id, 1300, 'STRIPE', 'PENDING', gen_random_uuid())
  returning id into v_payment_id;

  v_status := public.confirm_order_payment(v_payment_id, 'apple_pay');
  if v_status <> 'PLACED' then
    raise exception 'FEL: ordern blev % i stället för PLACED', v_status;
  end if;

  select placed_at into v_placed from public.orders where id = v_order_id;
  if v_placed is null then
    raise exception 'FEL: placed_at sattes inte när betalningen bekräftades';
  end if;

  -- Dricksen ska nu peka på betalningen, annars går den inte att fördela.
  select payment_id into v_tip_link from public.tips where order_id = v_order_id;
  if v_tip_link is distinct from v_payment_id then
    raise exception 'FEL: dricksraden kopplades inte till betalningen';
  end if;

  -- Leverantören skickar om händelsen. Ordern ska inte läggas en gång till.
  v_status := public.confirm_order_payment(v_payment_id, 'apple_pay');
  if v_status <> 'PLACED' then
    raise exception 'FEL: en omsänd webhook flyttade ordern till %', v_status;
  end if;
end
$$;

\echo '   en betalning som inte täcker ordern avvisas'

do $$
declare
  v_rest_id    uuid := '11111111-1111-1111-1111-111111111111';
  v_order_id   uuid;
  v_payment_id uuid;
  v_status     public.order_status;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 5000)
  returning id into v_order_id;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key)
  values (v_order_id, v_rest_id, 4999, 'STRIPE', 'PENDING', gen_random_uuid())
  returning id into v_payment_id;

  -- Webhooken kommer från internet. Ett belopp som inte räcker får aldrig
  -- markera ordern som betald.
  begin
    v_status := public.confirm_order_payment(v_payment_id);
    raise exception 'FEL: en för liten betalning lyfte ordern till %', v_status;
  exception
    when check_violation then null;
  end;

  -- Misslyckad betalning avbryter utkastet.
  perform public.fail_order_payment(v_payment_id, 'Kortet nekades');

  select status into v_status from public.orders where id = v_order_id;
  if v_status <> 'CANCELLED' then
    raise exception 'FEL: utkastet blev % i stället för CANCELLED', v_status;
  end if;
end
$$;

\echo '   en lagd order avbryts inte av en sen webhook'

do $$
declare
  v_rest_id    uuid := '11111111-1111-1111-1111-111111111111';
  v_order_id   uuid;
  v_payment_id uuid;
  v_status     public.order_status;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'PLACED', gen_random_uuid(), 1200)
  returning id into v_order_id;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key)
  values (v_order_id, v_rest_id, 1200, 'STRIPE', 'PENDING', gen_random_uuid())
  returning id into v_payment_id;

  perform public.fail_order_payment(v_payment_id, 'Timeout');

  -- Ordern hör till köket nu. Den frågan löses av personalen, inte av en
  -- webhook som kom för sent.
  select status into v_status from public.orders where id = v_order_id;
  if v_status <> 'PLACED' then
    raise exception 'FEL: en lagd order avbröts av en sen webhook (blev %)', v_status;
  end if;
end
$$;

\echo '   samma webhook kan bara tas emot en gång'

do $$
begin
  insert into public.payment_events (provider, event_id, kind)
  values ('STRIPE', 'evt_1', 'PAYMENT_SUCCEEDED');

  -- Leverantörer garanterar leverans minst en gång, inte exakt en gång. Utan
  -- det unika indexet hade en omsändning gett köket ännu ett brev.
  begin
    insert into public.payment_events (provider, event_id, kind)
    values ('STRIPE', 'evt_1', 'PAYMENT_SUCCEEDED');
    raise exception 'FEL: samma webhook gick att ta emot två gånger';
  exception
    when unique_violation then null;
  end;
end
$$;

\echo '   återbetalning är en motbokning, aldrig en överskrivning'

do $$
declare
  v_rest_id    uuid := '11111111-1111-1111-1111-111111111111';
  v_order_id   uuid;
  v_payment_id uuid;
  v_refund_id  uuid;
  v_status     public.payment_status;
  v_amount     integer;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 1000)
  returning id into v_order_id;

  update public.orders set status = 'PLACED'    where id = v_order_id;
  update public.orders set status = 'ACCEPTED'  where id = v_order_id;
  update public.orders set status = 'PREPARING' where id = v_order_id;
  update public.orders set status = 'READY'     where id = v_order_id;
  update public.orders set status = 'COMPLETED' where id = v_order_id;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_order_id, v_rest_id, 1000, 'STRIPE', 'CAPTURED', gen_random_uuid(), now())
  returning id into v_payment_id;

  -- Ett skäl är obligatoriskt. En återbetalning utan skäl är oförklarlig för
  -- den som stämmer av kassan tre månader senare.
  begin
    perform public.request_refund(v_payment_id, 300, '   ');
    raise exception 'FEL: en återbetalning utan skäl accepterades';
  exception
    when check_violation then null;
  end;

  v_refund_id := public.request_refund(v_payment_id, 300, 'Kall soppa');
  v_status := public.settle_refund(v_refund_id, 're_1');

  if v_status <> 'PARTIALLY_REFUNDED' then
    raise exception 'FEL: betalningen blev % efter en delåterbetalning', v_status;
  end if;

  -- Beloppet på betalningen står kvar. Raden är ett kvitto på vad som hände.
  select amount_ore into v_amount from public.payments where id = v_payment_id;
  if v_amount <> 1000 then
    raise exception 'FEL: betalningens belopp skrevs om till %', v_amount;
  end if;

  -- Ordern följer inte med vid en delåterbetalning — måltiden ägde rum.
  if (select status from public.orders where id = v_order_id) <> 'COMPLETED' then
    raise exception 'FEL: ordern lämnade COMPLETED vid en delåterbetalning';
  end if;

  -- Mer än notan går inte tillbaka, hur snabbt man än trycker.
  begin
    perform public.request_refund(v_payment_id, 800, 'Igen');
    raise exception 'FEL: summan av återbetalningar fick överstiga betalningen';
  exception
    when check_violation then null;
  end;

  v_refund_id := public.request_refund(v_payment_id, 700, 'Resten');
  v_status := public.settle_refund(v_refund_id, 're_2');

  if v_status <> 'REFUNDED' then
    raise exception 'FEL: betalningen blev % när hela notan återbetalats', v_status;
  end if;

  if (select status from public.orders where id = v_order_id) <> 'REFUNDED' then
    raise exception 'FEL: ordern följde inte med när hela notan återbetalats';
  end if;
end
$$;

\echo '   kontant återbetalas över disk, utan att vänta på någon leverantör'

do $$
declare
  v_rest_id    uuid := '11111111-1111-1111-1111-111111111111';
  v_order_id   uuid;
  v_payment_id uuid;
  v_refund_id  uuid;
  v_settled    timestamptz;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 500)
  returning id into v_order_id;

  update public.orders set status = 'PLACED'    where id = v_order_id;
  update public.orders set status = 'ACCEPTED'  where id = v_order_id;
  update public.orders set status = 'PREPARING' where id = v_order_id;
  update public.orders set status = 'READY'     where id = v_order_id;
  update public.orders set status = 'COMPLETED' where id = v_order_id;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_order_id, v_rest_id, 500, 'CASH', 'CAPTURED', gen_random_uuid(), now())
  returning id into v_payment_id;

  v_refund_id := public.request_refund(v_payment_id, 500, 'Fel nota');

  select settled_at into v_settled from public.refunds where id = v_refund_id;
  if v_settled is null then
    raise exception 'FEL: en kontant motbokning låg kvar som väntande';
  end if;

  -- Och den går inte att radera bort ur historien.
  begin
    delete from public.refunds where id = v_refund_id;
    raise exception 'FEL: en motbokning gick att radera';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

\echo '   omdöme från bordet kräver ordernas egen session'

do $$
declare
  v_rest_id    uuid := '11111111-1111-1111-1111-111111111111';
  v_table_id   uuid;
  v_session_a  uuid;
  v_session_b  uuid;
  v_order_id   uuid;
begin
  -- Ett bord som inte redan har en öppen nota från ett tidigare test. Bordet
  -- kan bara ha en åt gången (`table_sessions_one_open_per_table`).
  select t.id into v_table_id
  from public.tables t
  where t.restaurant_id = v_rest_id
    and not exists (
      select 1 from public.table_sessions s
      where s.table_id = t.id and s.status = 'OPEN'
    )
  limit 1;

  insert into public.table_sessions (table_id, restaurant_id, status)
  values (v_table_id, v_rest_id, 'OPEN') returning id into v_session_a;

  -- En order i session A, slutförd.
  insert into public.orders (
    restaurant_id, table_id, table_session_id, type, status, idempotency_key, total_ore
  )
  values (v_rest_id, v_table_id, v_session_a, 'TABLE', 'DRAFT', gen_random_uuid(), 1200)
  returning id into v_order_id;

  update public.orders set status = 'PLACED'    where id = v_order_id;
  update public.orders set status = 'ACCEPTED'  where id = v_order_id;
  update public.orders set status = 'PREPARING' where id = v_order_id;
  update public.orders set status = 'READY'     where id = v_order_id;
  update public.orders set status = 'COMPLETED' where id = v_order_id;

  -- Notan stängs så att bordet kan få en ny session.
  update public.table_sessions set status = 'CLOSED', closed_at = now() where id = v_session_a;

  insert into public.table_sessions (table_id, restaurant_id, status)
  values (v_table_id, v_rest_id, 'OPEN') returning id into v_session_b;

  -- Nästa gäst vid samma bord ska inte kunna sätta betyg på förra gästens mat
  -- genom att skicka sitt eget sessions-id.
  begin
    insert into public.reviews (order_id, restaurant_id, table_session_id, rating_food)
    values (v_order_id, v_rest_id, v_session_b, 1);
    raise exception 'FEL: en främmande bordssession fick lämna omdöme';
  exception
    when insufficient_privilege then null;
  end;

  -- Ordernas egen session får.
  insert into public.reviews (order_id, restaurant_id, table_session_id, rating_food, comment)
  values (v_order_id, v_rest_id, v_session_a, 5, 'Bästa ćevapi i stan');

  -- Och bara en gång.
  begin
    insert into public.reviews (order_id, restaurant_id, table_session_id, rating_food)
    values (v_order_id, v_rest_id, v_session_a, 1);
    raise exception 'FEL: samma order gick att betygsätta två gånger';
  exception
    when unique_violation then null;
  end;

  -- Snittbetyget ska ha räknats om av triggern från 0010, trots att omdömet
  -- kom från en anonym gäst.
  if (select rating_count from public.restaurants where id = v_rest_id) = 0 then
    raise exception 'FEL: snittbetyget räknades inte om för ett anonymt omdöme';
  end if;
end
$$;

\echo '   ett omdöme utan avsändare finns inte'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_order_id uuid;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 1200)
  returning id into v_order_id;

  update public.orders set status = 'PLACED'    where id = v_order_id;
  update public.orders set status = 'ACCEPTED'  where id = v_order_id;
  update public.orders set status = 'PREPARING' where id = v_order_id;
  update public.orders set status = 'READY'     where id = v_order_id;
  update public.orders set status = 'COMPLETED' where id = v_order_id;

  -- Varken konto eller bordssession. Ett omdöme utan avsändare är ingen källa.
  begin
    insert into public.reviews (order_id, restaurant_id, rating_food)
    values (v_order_id, v_rest_id, 5);
    raise exception 'FEL: ett omdöme utan avsändare accepterades';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   en kupong ger en sorts rabatt, aldrig två'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  -- Både procent och belopp: en kupong ingen kan svara på vad den ger.
  begin
    insert into public.coupons (restaurant_id, code, discount_bps, discount_ore, currency)
    values (v_rest_id, 'BADA', 2500, 500, 'BAM');
    raise exception 'FEL: en kupong med både procent och belopp accepterades';
  exception
    when check_violation then null;
  end;

  -- Ingendera: en kupong som inte ger något.
  begin
    insert into public.coupons (restaurant_id, code) values (v_rest_id, 'TOM');
    raise exception 'FEL: en kupong utan rabatt accepterades';
  exception
    when check_violation then null;
  end;

  -- Fast belopp utan valuta. 500 är fem mark i Sarajevo och fem dinarer i
  -- Beograd — utan valuta betyder siffran ingenting.
  begin
    insert into public.coupons (restaurant_id, code, discount_ore) values (v_rest_id, 'UTAN', 500);
    raise exception 'FEL: ett fast belopp utan valuta accepterades';
  exception
    when check_violation then null;
  end;

  -- Fel valuta mot restaurangens.
  begin
    insert into public.coupons (restaurant_id, code, discount_ore, currency)
    values (v_rest_id, 'FELVALUTA', 500, 'EUR');
    raise exception 'FEL: en kupong i annan valuta än restaurangens accepterades';
  exception
    when check_violation then null;
  end;

  insert into public.coupons (restaurant_id, code, discount_bps)
  values (v_rest_id, 'SOMMAR25', 2500);

  -- Samma kod två gånger hos samma restaurang.
  begin
    insert into public.coupons (restaurant_id, code, discount_bps)
    values (v_rest_id, 'SOMMAR25', 1000);
    raise exception 'FEL: samma kod gick att skapa två gånger';
  exception
    when unique_violation then null;
  end;

  -- Två plattformsbreda med samma kod. `unique (restaurant_id, code)` hade
  -- inte hindrat det, eftersom null aldrig krockar med null i ett unikt index.
  insert into public.coupons (code, discount_bps, funded_by) values ('BURPVECKA', 1000, 'BURP');
  begin
    insert into public.coupons (code, discount_bps, funded_by) values ('BURPVECKA', 2000, 'BURP');
    raise exception 'FEL: två plattformsbreda kuponger med samma kod accepterades';
  exception
    when unique_violation then null;
  end;
end
$$;

\echo '   kupongens upplaga tar slut, och gränsen per gäst håller'

do $$
declare
  v_rest_id   uuid := '11111111-1111-1111-1111-111111111111';
  v_coupon_id uuid;
  v_user_id   uuid;
  v_order_a   uuid;
  v_order_b   uuid;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'kupong@example.com')
  returning id into v_user_id;

  insert into public.coupons (restaurant_id, code, discount_bps, max_redemptions, max_per_guest)
  values (v_rest_id, 'ENGANG', 1000, 1, 1)
  returning id into v_coupon_id;

  insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore, discount_ore)
  values (v_rest_id, v_user_id, 'PICKUP', 'PLACED', gen_random_uuid(), 1080, -120)
  returning id into v_order_a;

  insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore, discount_ore)
  values (v_rest_id, v_user_id, 'PICKUP', 'PLACED', gen_random_uuid(), 1080, -120)
  returning id into v_order_b;

  perform public.redeem_coupon(v_coupon_id, v_order_a, v_user_id, 120);

  -- Upplagan var ett. Räkningen sker under lås i samma transaktion som raden
  -- skrivs, annars kan två gäster ta den sista samtidigt.
  begin
    perform public.redeem_coupon(v_coupon_id, v_order_b, v_user_id, 120);
    raise exception 'FEL: kupongen gick att lösa in fler gånger än upplagan';
  exception
    when check_violation then null;
  end;

  -- Loggen går inte att skriva om.
  begin
    delete from public.coupon_redemptions where coupon_id = v_coupon_id;
    raise exception 'FEL: en inlösen gick att radera';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

\echo '   en kupong med gräns per gäst kräver ett konto'

do $$
declare
  v_rest_id   uuid := '11111111-1111-1111-1111-111111111111';
  v_coupon_id uuid;
  v_order_id  uuid;
begin
  insert into public.coupons (restaurant_id, code, discount_bps, max_per_guest)
  values (v_rest_id, 'PERGAST', 1000, 1)
  returning id into v_coupon_id;

  -- Anonym bordsgäst: det finns ingenting att räkna inlösen på. Att låta
  -- gränsen gälla ändå hade betytt att den inte gällde alls vid bordet.
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'PLACED', gen_random_uuid(), 1080)
  returning id into v_order_id;

  begin
    perform public.redeem_coupon(v_coupon_id, v_order_id, null, 120);
    raise exception 'FEL: en kupong med gräns per gäst löstes in utan konto';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   presentkortet gäller bara hos restaurangen som gav ut det'

do $$
declare
  v_zeljo   uuid := '11111111-1111-1111-1111-111111111111';
  v_annan   uuid;
  v_card    uuid;
  v_order   uuid;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Aščinica Test', 'ascinica-test', '4200000000009',
          'Bravadžiluk 11', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_annan;

  v_card := public.issue_gift_card(v_zeljo, 'A2B3C4D5E6F7', 5000, 'BAM');

  if public.gift_card_balance(v_card) <> 5000 then
    raise exception 'FEL: saldot blev % i stället för 5000', public.gift_card_balance(v_card);
  end if;

  -- En order hos en ANNAN restaurang. Spärren som gör hela konstruktionen
  -- möjlig utan tillstånd att ge ut elektroniska pengar.
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_annan, 'PICKUP', 'PLACED', gen_random_uuid(), 1200)
  returning id into v_order;

  begin
    perform public.redeem_gift_card('A2B3C4D5E6F7', v_order, 1200);
    raise exception 'FEL: presentkortet löstes in hos en annan restaurang';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   presentkortet är betalmedel, inte rabatt'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_card     uuid;
  v_order    uuid;
  v_payment  uuid;
  v_total    integer;
  v_discount integer;
  v_status   public.order_status;
begin
  v_card := public.issue_gift_card(v_rest_id, 'K2L3M4N5P6Q7', 5000, 'BAM');

  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore, items_gross_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 6200, 6200)
  returning id into v_order;

  v_payment := public.redeem_gift_card('K2L3M4N5P6Q7', v_order, 5000);

  -- Ordersumman och rabatten står orörda. Momsen räknas därmed fortfarande på
  -- hela notan — det är skillnaden mot en kupong.
  select total_ore, discount_ore into v_total, v_discount from public.orders where id = v_order;
  if v_total <> 6200 or v_discount <> 0 then
    raise exception 'FEL: presentkortet ändrade ordersumman (% / %)', v_total, v_discount;
  end if;

  if public.gift_card_balance(v_card) <> 0 then
    raise exception 'FEL: saldot blev % i stället för 0', public.gift_card_balance(v_card);
  end if;

  -- Betalningen täcker inte hela notan; 12 mark återstår. Ordern får inte
  -- lyftas ur DRAFT förrän resten kommit in.
  begin
    v_status := public.confirm_order_payment(v_payment);
    raise exception 'FEL: ordern lyftes trots att 1200 återstod (blev %)', v_status;
  exception
    when check_violation then null;
  end;

  -- Resten kontant. Nu täcker summan notan.
  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_order, v_rest_id, 1200, 'CASH', 'CAPTURED', gen_random_uuid(), now())
  returning id into v_payment;

  v_status := public.confirm_order_payment(v_payment);
  if v_status <> 'PLACED' then
    raise exception 'FEL: ordern blev % när betalningarna tillsammans täckte notan', v_status;
  end if;

  -- Ett tomt kort går inte att använda igen.
  begin
    perform public.redeem_gift_card('K2L3M4N5P6Q7', v_order, 100);
    raise exception 'FEL: ett tomt presentkort gick att lösa in';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   presentkortsloggen går inte att skriva om'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
  v_card    uuid;
begin
  v_card := public.issue_gift_card(v_rest_id, 'R2S3T4U5V6W7', 2000, 'BAM');

  begin
    update public.gift_card_transactions set amount_ore = 999999 where gift_card_id = v_card;
    raise exception 'FEL: en presentkortsrad gick att ändra';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.gift_card_transactions where gift_card_id = v_card;
    raise exception 'FEL: en presentkortsrad gick att radera';
  exception
    when insufficient_privilege then null;
  end;

  -- Kortets valuta måste vara restaurangens.
  begin
    perform public.issue_gift_card(v_rest_id, 'X2Y3Z4A5B6C7', 2000, 'EUR');
    raise exception 'FEL: ett presentkort i annan valuta än restaurangens accepterades';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   klippkortet räknar besök och börjar om efter en belöning'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
  v_user_id uuid;
  v_order   uuid;
  v_size    smallint;
  v_done    bigint;
  v_taken   bigint;
begin
  update public.restaurants set punch_card_size = 3 where id = v_rest_id;

  insert into auth.users (id, email) values (gen_random_uuid(), 'klipp@example.com')
  returning id into v_user_id;

  -- Två besök räcker inte till ett kort på tre.
  for i in 1..2 loop
    insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore)
    values (v_rest_id, v_user_id, 'PICKUP', 'COMPLETED', gen_random_uuid(), 1200);
  end loop;

  insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, v_user_id, 'PICKUP', 'PLACED', gen_random_uuid(), 1200)
  returning id into v_order;

  begin
    perform public.redeem_punch_card(v_rest_id, v_user_id, v_order, 1200);
    raise exception 'FEL: klippkortet löstes ut på två besök av tre';
  exception
    when check_violation then null;
  end;

  -- Tredje besöket fyller kortet.
  insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, v_user_id, 'PICKUP', 'COMPLETED', gen_random_uuid(), 1200);

  select size, completed_orders, rewards_redeemed
  into v_size, v_done, v_taken
  from public.punch_card_status(v_rest_id, v_user_id);

  if v_size <> 3 or v_done <> 3 or v_taken <> 0 then
    raise exception 'FEL: klippkortets läge blev % / % / %', v_size, v_done, v_taken;
  end if;

  perform public.redeem_punch_card(v_rest_id, v_user_id, v_order, 1200);

  -- Kortet börjar om. Utan avdraget för uttagna belöningar hade gästen kunnat
  -- lösa ut en till direkt.
  begin
    insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore)
    values (v_rest_id, v_user_id, 'PICKUP', 'PLACED', gen_random_uuid(), 1200)
    returning id into v_order;

    perform public.redeem_punch_card(v_rest_id, v_user_id, v_order, 1200);
    raise exception 'FEL: två belöningar gick att lösa ut på tre besök';
  exception
    when check_violation then null;
  end;

  -- Loggen går inte att skriva om.
  begin
    delete from public.punch_card_redemptions where guest_id = v_user_id;
    raise exception 'FEL: ett klippkortsuttag gick att radera';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

\echo '   klippkort kräver ett konto'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
  v_order   uuid;
begin
  update public.restaurants set punch_card_size = 3 where id = v_rest_id;

  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'PLACED', gen_random_uuid(), 1200)
  returning id into v_order;

  -- Den anonyma bordsgästen går inte att räkna besök på, och SKA inte gå att
  -- räkna besök på.
  begin
    perform public.redeem_punch_card(v_rest_id, null, v_order, 1200);
    raise exception 'FEL: klippkort löstes ut utan konto';
  exception
    when check_violation then null;
  end;

  -- Och en restaurang utan klippkort har inget att lösa ut.
  update public.restaurants set punch_card_size = null where id = v_rest_id;
  begin
    perform public.redeem_punch_card(v_rest_id, gen_random_uuid(), v_order, 1200);
    raise exception 'FEL: klippkort löstes ut hos en restaurang utan klippkort';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   ett bord kan bara stå på sin egen restaurangs ritning'

do $$
declare
  v_zeljo  uuid := '11111111-1111-1111-1111-111111111111';
  v_annan  uuid;
  v_plan_a uuid;
  v_plan_b uuid;
  v_table  uuid;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Planritning Test', 'planritning-test', '4200000000010',
          'Ferhadija 1', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_annan;

  insert into public.floor_plans (restaurant_id, name) values (v_zeljo, 'Nedre våningen')
  returning id into v_plan_a;

  insert into public.floor_plans (restaurant_id, name) values (v_annan, 'Uteserveringen')
  returning id into v_plan_b;

  select id into v_table from public.tables where restaurant_id = v_zeljo limit 1;

  -- En främmande ritning. Utan spärren går det att flytta ett bord till en
  -- annan restaurangs rum genom att skicka dess id.
  begin
    update public.tables set floor_plan_id = v_plan_b, pos_x = 5, pos_y = 5 where id = v_table;
    raise exception 'FEL: bordet placerades på en annan restaurangs ritning';
  exception
    when insufficient_privilege then null;
  end;

  -- Ritning utan position finns inte: ett sådant bord går inte att rita.
  begin
    update public.tables set floor_plan_id = v_plan_a, pos_x = null where id = v_table;
    raise exception 'FEL: ett bord på en ritning accepterades utan position';
  exception
    when check_violation then null;
  end;

  update public.tables set floor_plan_id = v_plan_a, pos_x = 5, pos_y = 8 where id = v_table;

  -- Två ritningar med samma namn hos samma restaurang.
  begin
    insert into public.floor_plans (restaurant_id, name) values (v_zeljo, 'Nedre våningen');
    raise exception 'FEL: två ritningar med samma namn accepterades';
  exception
    when unique_violation then null;
  end;

  -- Bordet blir kvar när ritningen tas bort. Ett bord är en beställningspunkt
  -- med historik och får inte försvinna för att någon ångrade en ritning.
  delete from public.floor_plans where id = v_plan_a;

  if not exists (select 1 from public.tables where id = v_table) then
    raise exception 'FEL: bordet försvann med ritningen';
  end if;

  if (select floor_plan_id from public.tables where id = v_table) is not null then
    raise exception 'FEL: bordet pekar på en borttagen ritning';
  end if;
end
$$;

\echo '   öppettider räknas i restaurangens egen tidszon'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  -- Seedrestaurangen ligger i Sarajevo. Öppet 11–14 lokal tid.
  update public.restaurants
  set opening_hours = '{"wed": [{"opens": "11:00", "closes": "14:00"}]}'::jsonb
  where id = v_rest_id;

  -- Onsdag 2026-08-19, 11:30 i Sarajevo = 09:30 UTC (CEST, UTC+2).
  if not public.is_restaurant_open(v_rest_id, '2026-08-19 09:30:00+00'::timestamptz) then
    raise exception 'FEL: stängd 11:30 lokal tid trots att passet är 11–14';
  end if;

  -- 10:30 UTC är 12:30 lokalt — fortfarande öppet.
  if not public.is_restaurant_open(v_rest_id, '2026-08-19 10:30:00+00'::timestamptz) then
    raise exception 'FEL: stängd 12:30 lokal tid';
  end if;

  -- 08:30 UTC är 10:30 lokalt — ännu inte öppet.
  if public.is_restaurant_open(v_rest_id, '2026-08-19 08:30:00+00'::timestamptz) then
    raise exception 'FEL: öppen 10:30 lokal tid trots att passet börjar 11:00';
  end if;

  -- Tidszonen ska komma från landet och inte från en hårdkodning.
  if public.country_time_zone('RS') <> 'Europe/Belgrade' then
    raise exception 'FEL: serbisk tidszon blev %', public.country_time_zone('RS');
  end if;
  if public.country_time_zone('SE') <> 'Europe/Stockholm' then
    raise exception 'FEL: svensk tidszon blev %', public.country_time_zone('SE');
  end if;
end
$$;

\echo '   ett pass över midnatt håller kafanan öppen efter tolv'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  -- Fredag 22:00 till lördag 02:00.
  update public.restaurants
  set opening_hours = '{"fri": [{"opens": "22:00", "closes": "02:00"}]}'::jsonb
  where id = v_rest_id;

  -- Fredag 2026-08-21, 23:30 lokalt = 21:30 UTC.
  if not public.is_restaurant_open(v_rest_id, '2026-08-21 21:30:00+00'::timestamptz) then
    raise exception 'FEL: stängd 23:30 på fredagen';
  end if;

  -- Lördag 01:00 lokalt = fredag 23:00 UTC. Passet ligger under fredagens
  -- nyckel men timmen hör till lördagen — det är hela poängen.
  if not public.is_restaurant_open(v_rest_id, '2026-08-21 23:00:00+00'::timestamptz) then
    raise exception 'FEL: stängd 01:00 på natten trots pass till 02:00';
  end if;

  -- Lördag 02:00 lokalt = 00:00 UTC. Stängningstiden är exklusiv.
  if public.is_restaurant_open(v_rest_id, '2026-08-22 00:00:00+00'::timestamptz) then
    raise exception 'FEL: öppen 02:00, sluttiden ska vara exklusiv';
  end if;

  -- Fredag 21:59 lokalt = 19:59 UTC. Ännu inte öppet.
  if public.is_restaurant_open(v_rest_id, '2026-08-21 19:59:00+00'::timestamptz) then
    raise exception 'FEL: öppen 21:59 trots att passet börjar 22:00';
  end if;

  -- Söndag natt hör inte till fredagens pass.
  if public.is_restaurant_open(v_rest_id, '2026-08-23 23:00:00+00'::timestamptz) then
    raise exception 'FEL: fredagens nattpass smetade ut sig till andra dagar';
  end if;
end
$$;

\echo '   söndagsnatten viker in i måndagen'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  update public.restaurants
  set opening_hours = '{"sun": [{"opens": "20:00", "closes": "01:00"}]}'::jsonb
  where id = v_rest_id;

  -- Måndag 2026-08-24 00:30 lokalt = söndag 22:30 UTC. Veckan viker runt.
  if not public.is_restaurant_open(v_rest_id, '2026-08-23 22:30:00+00'::timestamptz) then
    raise exception 'FEL: stängd 00:30 på måndagen trots söndagens nattpass';
  end if;

  -- Öppet-nu-filtret på kartsidan måste svara likadant. Två svar på samma
  -- fråga glider isär, och den dagen visar listan öppet medan ordern nekas.
  if not exists (
    select 1 from public.open_restaurant_ids('2026-08-23 22:30:00+00'::timestamptz)
    where restaurant_id = v_rest_id
  ) then
    raise exception 'FEL: open_restaurant_ids svarade något annat än is_restaurant_open';
  end if;
end
$$;

\echo '   rate limitern räknar delat och nollställs med fönstret'

do $$
declare
  v_key   text := 'test:' || gen_random_uuid()::text;
  v_at    timestamptz := '2026-08-19 12:00:30+00';
  v_ok    boolean;
  v_left  integer;
  v_reset timestamptz;
begin
  -- Tre anrop av tre tillåtna.
  for i in 1..3 loop
    select allowed, remaining into v_ok, v_left
    from public.rate_limit_hit(v_key, 3, 60, v_at);

    if not v_ok then
      raise exception 'FEL: anrop % av 3 blockerades', i;
    end if;
  end loop;

  if v_left <> 0 then
    raise exception 'FEL: remaining blev % efter tre av tre', v_left;
  end if;

  -- Fjärde anropet i samma fönster ska stoppas.
  select allowed, remaining, reset_at into v_ok, v_left, v_reset
  from public.rate_limit_hit(v_key, 3, 60, v_at);

  if v_ok then
    raise exception 'FEL: fjärde anropet släpptes igenom';
  end if;

  if v_left <> 0 then
    raise exception 'FEL: remaining gick under noll (%)', v_left;
  end if;

  -- Fönstret är avrundat nedåt till en jämn minut, alltså slutar det 12:01:00.
  if v_reset <> '2026-08-19 12:01:00+00'::timestamptz then
    raise exception 'FEL: fönstret nollställs %, väntade 12:01:00', v_reset;
  end if;

  -- Nästa fönster börjar om.
  select allowed into v_ok
  from public.rate_limit_hit(v_key, 3, 60, '2026-08-19 12:01:05+00'::timestamptz);

  if not v_ok then
    raise exception 'FEL: räknaren nollställdes inte när fönstret löpte ut';
  end if;

  -- Olika nycklar delar inte kvot. Annars slår en enda ivrig gäst ut lokalen.
  select allowed into v_ok
  from public.rate_limit_hit('annan:' || v_key, 1, 60, v_at);

  if not v_ok then
    raise exception 'FEL: en främmande nyckel påverkades av kvoten';
  end if;

  -- En orimlig gräns ska avvisas och inte tyst bli obegränsad.
  begin
    perform public.rate_limit_hit(v_key, 0, 60, v_at);
    raise exception 'FEL: gränsen noll accepterades';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   bordets nota kvitteras i ett svep och fördelas per order'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_table_id uuid;
  v_session  uuid;
  v_a        uuid;
  v_b        uuid;
  v_c        uuid;
  v_together uuid;
  v_sum      integer;
  v_rows     integer;
  v_status   public.table_session_status;
begin
  select t.id into v_table_id
  from public.tables t
  where t.restaurant_id = v_rest_id
    and not exists (
      select 1 from public.table_sessions s where s.table_id = t.id and s.status = 'OPEN'
    )
  limit 1;

  v_session := public.open_table_session(v_table_id, v_rest_id);

  -- Tre gäster vid samma bord: 1000, 2000 och 3000. Notan är 6000.
  insert into public.orders (restaurant_id, table_id, table_session_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, v_table_id, v_session, 'TABLE', 'DRAFT', gen_random_uuid(), 1000)
  returning id into v_a;
  insert into public.orders (restaurant_id, table_id, table_session_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, v_table_id, v_session, 'TABLE', 'DRAFT', gen_random_uuid(), 2000)
  returning id into v_b;
  insert into public.orders (restaurant_id, table_id, table_session_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, v_table_id, v_session, 'TABLE', 'DRAFT', gen_random_uuid(), 3000)
  returning id into v_c;

  foreach v_a in array array[v_a, v_b, v_c] loop
    update public.orders set status = 'PLACED'    where id = v_a;
    update public.orders set status = 'ACCEPTED'  where id = v_a;
    update public.orders set status = 'PREPARING' where id = v_a;
    update public.orders set status = 'READY'     where id = v_a;
    update public.orders set status = 'COMPLETED' where id = v_a;
  end loop;

  select sum(due_ore) into v_sum from public.table_session_bill(v_session);
  if v_sum <> 6000 then
    raise exception 'FEL: bordets nota blev % i stället för 6000', v_sum;
  end if;

  -- Gästen betalar 6100 — avrundning uppåt, som i verkligheten.
  v_together := public.settle_table_session(v_session, 6100);

  -- Summan av delarna måste bli exakt det som togs emot. En proportionell
  -- fördelning som avrundar var för sig tappar eller hittar på pengar.
  select sum(amount_ore), count(*) into v_sum, v_rows
  from public.payments where settled_together_id = v_together;

  if v_sum <> 6100 then
    raise exception 'FEL: fördelningen summerade till % i stället för 6100', v_sum;
  end if;

  if v_rows <> 3 then
    raise exception 'FEL: % betalrader i stället för 3', v_rows;
  end if;

  -- Ingenting kvar att betala.
  select coalesce(sum(due_ore), 0) into v_sum
  from public.table_session_bill(v_session) where due_ore > 0;
  if v_sum <> 0 then
    raise exception 'FEL: % kvar på notan efter kvittering', v_sum;
  end if;

  -- Notan är slut. Nästa sällskap ska inte ärva den.
  select status into v_status from public.table_sessions where id = v_session;
  if v_status <> 'CLOSED' then
    raise exception 'FEL: notan blev % i stället för CLOSED', v_status;
  end if;

  -- Och den går inte att kvittera en gång till.
  begin
    perform public.settle_table_session(v_session, 100);
    raise exception 'FEL: en betald nota gick att kvittera igen';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   en tyst nota ärvs inte av nästa sällskap'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_table_id uuid;
  v_first    uuid;
  v_again    uuid;
  v_third    uuid;
begin
  select t.id into v_table_id
  from public.tables t
  where t.restaurant_id = v_rest_id
    and not exists (
      select 1 from public.table_sessions s where s.table_id = t.id and s.status = 'OPEN'
    )
  limit 1;

  v_first := public.open_table_session(v_table_id, v_rest_id);

  -- Samma sällskap, en stund senare: samma nota.
  v_again := public.open_table_session(v_table_id, v_rest_id);
  if v_again <> v_first then
    raise exception 'FEL: sällskapet fick en ny nota mitt i måltiden';
  end if;

  -- Nästa dag. Notan har varit tyst i timmar.
  --
  -- Det här är det som gjorde att gäst B kunde läsa gäst A:s kvitto: sessionen
  -- är det som bevisar åtkomst, och den återanvändes i evighet.
  update public.table_sessions
  set opened_at = now() - interval '20 hours'
  where id = v_first;

  v_third := public.open_table_session(v_table_id, v_rest_id);
  if v_third = v_first then
    raise exception 'FEL: nästa sällskap ärvde förra sällskapets nota';
  end if;

  if (select status from public.table_sessions where id = v_first) <> 'CLOSED' then
    raise exception 'FEL: den utgångna notan stängdes inte';
  end if;

  -- Och bordet har fortfarande bara en öppen nota.
  if (select count(*) from public.table_sessions
      where table_id = v_table_id and status = 'OPEN') <> 1 then
    raise exception 'FEL: bordet fick fler än en öppen nota';
  end if;
end
$$;

\echo '   en notisprenumeration hör till en enhet och en restaurang'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_annan    uuid;
  v_user_id  uuid;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Push Test', 'push-test', '4200000000011',
          'Zelenih beretki 1', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_annan;

  insert into auth.users (id, email) values (gen_random_uuid(), 'push@example.com')
  returning id into v_user_id;

  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_rest_id, v_user_id, 'kitchen', true);

  insert into public.push_subscriptions (user_id, restaurant_id, endpoint, p256dh, auth)
  values (v_user_id, v_rest_id, 'https://push.example/abc', 'nyckel', 'hemlighet');

  -- En webbläsare har EN prenumeration. Samma endpoint igen är samma enhet som
  -- prenumererat om, inte en ny rad.
  begin
    insert into public.push_subscriptions (user_id, restaurant_id, endpoint, p256dh, auth)
    values (v_user_id, v_annan, 'https://push.example/abc', 'nyckel', 'hemlighet');
    raise exception 'FEL: samma endpoint gick att registrera två gånger';
  exception
    when unique_violation then null;
  end;

  -- Raden följer med när kontot försvinner. En adress till en telefon som ingen
  -- äger är en adress vi skickar till i evighet.
  delete from auth.users where id = v_user_id;

  if exists (select 1 from public.push_subscriptions where user_id = v_user_id) then
    raise exception 'FEL: prenumerationen låg kvar när kontot togs bort';
  end if;
end
$$;

\echo '   en återbetald presentkortsbetalning går tillbaka till kortet'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
  v_card    uuid;
  v_order   uuid;
  v_payment uuid;
  v_refund  uuid;
  v_status  public.payment_status;
begin
  v_card := public.issue_gift_card(v_rest_id, 'D2E3F4G5H6J7', 5000, 'BAM');

  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 5000)
  returning id into v_order;

  update public.orders set status = 'PLACED'    where id = v_order;
  update public.orders set status = 'ACCEPTED'  where id = v_order;
  update public.orders set status = 'PREPARING' where id = v_order;
  update public.orders set status = 'READY'     where id = v_order;
  update public.orders set status = 'COMPLETED' where id = v_order;

  v_payment := public.redeem_gift_card('D2E3F4G5H6J7', v_order, 5000);

  if public.gift_card_balance(v_card) <> 0 then
    raise exception 'FEL: saldot blev % efter inlösen, väntade 0', public.gift_card_balance(v_card);
  end if;

  -- Hela notan tillbaka. Värdet ska hamna på KORTET — ett presentkort som går
  -- att lösa in mot kontanter är inte längre ett begränsat nätverk, och hela
  -- skälet till att Burp får ge ut dem utan tillstånd faller.
  v_refund := public.request_refund(v_payment, 5000, 'Ordern avbröts');

  if public.gift_card_balance(v_card) <> 5000 then
    raise exception 'FEL: saldot blev % efter återbetalning, väntade 5000',
      public.gift_card_balance(v_card);
  end if;

  select status into v_status from public.payments where id = v_payment;
  if v_status <> 'REFUNDED' then
    raise exception 'FEL: betalningen blev % i stället för REFUNDED', v_status;
  end if;

  -- Och kortet går att använda igen.
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'PLACED', gen_random_uuid(), 2000)
  returning id into v_order;

  perform public.redeem_gift_card('D2E3F4G5H6J7', v_order, 2000);

  if public.gift_card_balance(v_card) <> 3000 then
    raise exception 'FEL: saldot blev % efter ny inlösen, väntade 3000',
      public.gift_card_balance(v_card);
  end if;
end
$$;

\echo '   presentkortet kan inte betala mer än vad som återstår'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
  v_card    uuid;
  v_order   uuid;
begin
  v_card := public.issue_gift_card(v_rest_id, 'M2N3P4Q5R6S7', 5000, 'BAM');

  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'COMPLETED', gen_random_uuid(), 1200)
  returning id into v_order;

  -- Ordern är redan betald kontant.
  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_order, v_rest_id, 1200, 'CASH', 'CAPTURED', gen_random_uuid(), now());

  -- Kortet ska inte kunna överbetala ordern. Överskottet fanns ingenstans att
  -- hämta, eftersom ett presentkort inte löses in mot kontanter.
  begin
    perform public.redeem_gift_card('M2N3P4Q5R6S7', v_order, 1200);
    raise exception 'FEL: presentkortet betalade en order som redan var betald';
  exception
    when check_violation then null;
  end;

  if public.gift_card_balance(v_card) <> 5000 then
    raise exception 'FEL: saldot rördes trots att inlösen avvisades';
  end if;
end
$$;

\echo '   en avbruten order lämnar tillbaka kupong, klippkort och presentkort'

do $$
declare
  v_rest_id  uuid := '11111111-1111-1111-1111-111111111111';
  v_user_id  uuid;
  v_coupon   uuid;
  v_card     uuid;
  v_order    uuid;
  v_kvar     integer;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'avbruten@example.com')
  returning id into v_user_id;

  -- En kupong som bara får användas en gång per gäst.
  insert into public.coupons (restaurant_id, code, discount_bps, max_per_guest, max_redemptions)
  values (v_rest_id, 'ENDAST1', 1000, 1, 1)
  returning id into v_coupon;

  v_card := public.issue_gift_card(v_rest_id, 'T2U3V4W5X6Y7', 4000, 'BAM');

  -- Ett fullt klippkort: tre besök av tre.
  update public.restaurants set punch_card_size = 3 where id = v_rest_id;
  for i in 1..3 loop
    insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore)
    values (v_rest_id, v_user_id, 'PICKUP', 'COMPLETED', gen_random_uuid(), 1000);
  end loop;

  -- Kortordern: ligger som utkast och förbrukar allt gästen valt.
  insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, v_user_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 4000)
  returning id into v_order;

  perform public.redeem_coupon(v_coupon, v_order, v_user_id, 100);
  perform public.redeem_punch_card(v_rest_id, v_user_id, v_order, 1000);
  perform public.redeem_gift_card('T2U3V4W5X6Y7', v_order, 4000);

  if public.gift_card_balance(v_card) <> 0 then
    raise exception 'FEL: presentkortet drogs inte';
  end if;

  -- Kortet nekas. Ordern avbryts — och allt ska tillbaka.
  update public.orders set status = 'CANCELLED' where id = v_order;

  if public.gift_card_balance(v_card) <> 4000 then
    raise exception 'FEL: presentkortets värde blev % efter avbrott, väntade 4000',
      public.gift_card_balance(v_card);
  end if;

  select count(*) into v_kvar
  from public.coupon_redemptions
  where coupon_id = v_coupon and released_at is null;
  if v_kvar <> 0 then
    raise exception 'FEL: kupongen räknas fortfarande som använd';
  end if;

  -- Raden står kvar. Historiken ska visa både att den användes och att den
  -- lämnades tillbaka.
  if not exists (select 1 from public.coupon_redemptions where order_id = v_order) then
    raise exception 'FEL: inlösenraden raderades i stället för att märkas';
  end if;

  select count(*) into v_kvar
  from public.punch_card_redemptions
  where guest_id = v_user_id and released_at is null;
  if v_kvar <> 0 then
    raise exception 'FEL: klippkortet räknas fortfarande som uttaget';
  end if;

  -- Och gästen kan använda allt igen på en ny order.
  insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, v_user_id, 'PICKUP', 'PLACED', gen_random_uuid(), 4000)
  returning id into v_order;

  perform public.redeem_coupon(v_coupon, v_order, v_user_id, 100);
  perform public.redeem_punch_card(v_rest_id, v_user_id, v_order, 1000);
  perform public.redeem_gift_card('T2U3V4W5X6Y7', v_order, 4000);
end
$$;

\echo '   en inlösen går bara att märka som återlämnad, inte skriva om'

do $$
declare
  v_rest_id uuid := '11111111-1111-1111-1111-111111111111';
  v_coupon  uuid;
  v_order   uuid;
  v_row     uuid;
begin
  insert into public.coupons (restaurant_id, code, discount_bps, max_per_guest)
  values (v_rest_id, 'OFORANDERLIG', 1000, 0)
  returning id into v_coupon;

  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'PLACED', gen_random_uuid(), 1000)
  returning id into v_order;

  perform public.redeem_coupon(v_coupon, v_order, null, 100);
  select id into v_row from public.coupon_redemptions where order_id = v_order;

  -- Beloppet är det som gör raden till bevis.
  begin
    update public.coupon_redemptions set discount_ore = 99999 where id = v_row;
    raise exception 'FEL: rabatten på en inlösen gick att skriva om';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.coupon_redemptions where id = v_row;
    raise exception 'FEL: en inlösen gick att radera';
  exception
    when insufficient_privilege then null;
  end;

  update public.coupon_redemptions set released_at = now() where id = v_row;

  -- Och bara en gång: en kupong kan inte lämnas tillbaka två gånger.
  begin
    update public.coupon_redemptions set released_at = now() where id = v_row;
    raise exception 'FEL: samma inlösen gick att lämna tillbaka två gånger';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

\echo '   avräkningen räknar periodens egna dygn i restaurangens tid'

do $$
declare
  v_rest    uuid;
  v_a       uuid;
  v_b       uuid;
  v_c       uuid;
  v_row     record;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Avräkning Test', 'avrakning-test', '4200000000022',
          'Ferhadija 12', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  -- Mitt i juni. Ligger i perioden hur man än räknar.
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, tip_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(),
          10000, 500, 10500, '2026-06-15 10:00:00+00')
  returning id into v_a;

  -- Sista kvällen, 23:30 lokal tid i Sarajevo (= 21:30 UTC). Inne.
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, tip_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(),
          20000, 0, 20000, '2026-06-30 21:30:00+00')
  returning id into v_b;

  /*
   * En timme senare: 00:30 lokal tid den 1 juli, men fortfarande 30 juni i UTC.
   *
   * Det här är hela skälet till att perioden räknas i restaurangens tidszon.
   * En avräkning som räknar i UTC lägger den här ordern i juni, och en kafana
   * som stänger efter midnatt får varje månadsskifte fel faktura.
   */
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, tip_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(),
          90000, 0, 90000, '2026-06-30 22:30:00+00')
  returning id into v_c;

  insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore)
  values (v_a, v_rest, 'GROSS_ITEMS', 10000, 340, 340),
         (v_b, v_rest, 'GROSS_ITEMS', 20000, 340, 680),
         (v_c, v_rest, 'GROSS_ITEMS', 90000, 340, 3060);

  -- Dricksen läses ur liggaren sedan 0040, inte ur `orders.tip_ore`.
  insert into public.tips (order_id, restaurant_id, amount_ore)
  values (v_a, v_rest, 500);

  select * into v_row from public.settlement_preview(v_rest, '2026-06-01', '2026-06-30');

  if v_row.orders_count <> 2 then
    raise exception 'FEL: % order i juni, väntade 2 (nattordern hörde till juli)', v_row.orders_count;
  end if;

  if v_row.gross_ore <> 30000 then
    raise exception 'FEL: bruttot blev %, väntade 30000', v_row.gross_ore;
  end if;

  if v_row.tips_ore <> 500 then
    raise exception 'FEL: dricksen blev %, väntade 500', v_row.tips_ore;
  end if;

  if v_row.fees_ore <> 1020 then
    raise exception 'FEL: avgiften blev %, väntade 1020', v_row.fees_ore;
  end if;

  if v_row.currency <> 'BAM' then
    raise exception 'FEL: valutan blev %, väntade BAM', v_row.currency;
  end if;

  -- Nattordern ska finnas i juli i stället, inte försvinna.
  select * into v_row from public.settlement_preview(v_rest, '2026-07-01', '2026-07-31');
  if v_row.orders_count <> 1 or v_row.gross_ore <> 90000 then
    raise exception 'FEL: nattordern hamnade inte i juli (% order, brutto %)',
      v_row.orders_count, v_row.gross_ore;
  end if;
end
$$;

\echo '   en helt återbetald order krediterar avgiften, en delåterbetald inte'

do $$
declare
  v_rest     uuid;
  v_hel      uuid;
  v_del      uuid;
  v_bet_hel  uuid;
  v_bet_del  uuid;
  v_row      record;
  v_status   public.order_status;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Kredit Test', 'kredit-test', '4200000000033',
          'Ferhadija 14', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 5000, 5000, '2026-06-10 10:00:00+00')
  returning id into v_hel;

  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 8000, 8000, '2026-06-12 10:00:00+00')
  returning id into v_del;

  insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore)
  values (v_hel, v_rest, 'GROSS_ITEMS', 5000, 340, 170),
         (v_del, v_rest, 'GROSS_ITEMS', 8000, 340, 272);

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_hel, v_rest, 5000, 'CASH', 'CAPTURED', gen_random_uuid(), '2026-06-10 10:05:00+00')
  returning id into v_bet_hel;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_del, v_rest, 8000, 'CASH', 'CAPTURED', gen_random_uuid(), '2026-06-12 10:05:00+00')
  returning id into v_bet_del;

  -- Hela notan tillbaka, och bara en del av den andra.
  perform public.request_refund(v_bet_hel, 5000, 'Maten kom aldrig fram');
  perform public.request_refund(v_bet_del, 2000, 'Kall förrätt');

  -- Motbokningarna avslutades nyss; flytta dem in i perioden.
  update public.refunds set settled_at = '2026-06-20 10:00:00+00' where payment_id = v_bet_hel;
  update public.refunds set settled_at = '2026-06-22 10:00:00+00' where payment_id = v_bet_del;

  select status into v_status from public.orders where id = v_hel;
  if v_status <> 'REFUNDED' then
    raise exception 'FEL: den helt återbetalda ordern blev % i stället för REFUNDED', v_status;
  end if;

  select * into v_row from public.settlement_preview(v_rest, '2026-06-01', '2026-06-30');

  /*
   * Bruttot rymmer BÅDA order.
   *
   * En helt återbetald order byter status från COMPLETED till REFUNDED och hade
   * fallit ur underlaget helt om filtret bara tog COMPLETED — samtidigt som
   * återbetalningen drogs av. Samma order hade då räknats bort två gånger.
   */
  if v_row.orders_count <> 2 or v_row.gross_ore <> 13000 then
    raise exception 'FEL: % order och brutto %, väntade 2 och 13000',
      v_row.orders_count, v_row.gross_ore;
  end if;

  if v_row.cash_ore <> 13000 then
    raise exception 'FEL: kontanterna blev %, väntade 13000', v_row.cash_ore;
  end if;

  if v_row.refunds_ore <> 7000 then
    raise exception 'FEL: återbetalt blev %, väntade 7000', v_row.refunds_ore;
  end if;

  -- Bara den hela ordern krediterar. Delåterbetalningen upphäver inte att
  -- måltiden såldes — gästen satt kvar och åt resten.
  if v_row.fee_credit_ore <> 170 then
    raise exception 'FEL: krediten blev %, väntade 170 (bara den hela ordern)',
      v_row.fee_credit_ore;
  end if;

  if v_row.amount_due_ore <> 272 then
    raise exception 'FEL: att fakturera blev %, väntade 272', v_row.amount_due_ore;
  end if;
end
$$;

\echo '   en stängd period är oföränderlig och överlappar ingen annan'

do $$
declare
  v_rest uuid;
  v_id   uuid;
  v_due  integer;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Period Test', 'period-test', '4200000000044',
          'Ferhadija 16', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 10000, 10000, '2026-06-15 10:00:00+00')
  returning id into v_id;

  insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore)
  values (v_id, v_rest, 'GROSS_ITEMS', 10000, 340, 340);

  v_id := public.close_settlement_period(v_rest, '2026-06-01', '2026-06-30');

  select amount_due_ore into v_due from public.settlements where id = v_id;
  if v_due <> 340 then
    raise exception 'FEL: att fakturera blev %, väntade 340', v_due;
  end if;

  -- Samma period igen, och en som bara delvis överlappar. Ett unikt index på
  -- (restaurang, start, slut) hade släppt igenom den andra, och sex dagar hade
  -- fakturerats två gånger.
  begin
    perform public.close_settlement_period(v_rest, '2026-06-01', '2026-06-30');
    raise exception 'FEL: samma period gick att stänga två gånger';
  exception
    when exclusion_violation then null;
  end;

  begin
    perform public.close_settlement_period(v_rest, '2026-06-15', '2026-06-20');
    raise exception 'FEL: en överlappande period gick att stänga';
  exception
    when exclusion_violation then null;
  end;

  -- Maj ligger bredvid och ska gå bra.
  perform public.close_settlement_period(v_rest, '2026-05-01', '2026-05-31');

  -- Ett utkast får räknas om.
  update public.settlements set fees_ore = 500 where id = v_id;

  -- Skickad är skickad.
  update public.settlements set status = 'INVOICED', invoice_number = 'B-2026-0001'
  where id = v_id;

  if (select invoiced_at from public.settlements where id = v_id) is null then
    raise exception 'FEL: invoiced_at sattes inte av triggern';
  end if;

  begin
    update public.settlements set fees_ore = 1 where id = v_id;
    raise exception 'FEL: en skickad avräkning gick att räkna om';
  exception
    when check_violation then null;
  end;

  begin
    delete from public.settlements where id = v_id;
    raise exception 'FEL: en skickad avräkning gick att radera';
  exception
    when insufficient_privilege then null;
  end;

  -- Statusmaskinen: PAID är slutläge.
  update public.settlements set status = 'PAID' where id = v_id;

  if (select paid_at from public.settlements where id = v_id) is null then
    raise exception 'FEL: paid_at sattes inte av triggern';
  end if;

  begin
    update public.settlements set status = 'VOID' where id = v_id;
    raise exception 'FEL: en betald avräkning gick att makulera';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   en period som inte är slut går inte att fakturera'

do $$
declare
  v_rest uuid;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Framtid Test', 'framtid-test', '4200000000055',
          'Ferhadija 18', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  -- Innevarande dygn är inte slut. Order som läggs i kväll hade annars aldrig
  -- hamnat i någon avräkning alls — överlappsspärren gör att perioden inte kan
  -- köras om.
  begin
    perform public.close_settlement_period(
      v_rest, (now() at time zone 'Europe/Sarajevo')::date, (now() at time zone 'Europe/Sarajevo')::date
    );
    raise exception 'FEL: en pågående period gick att fakturera';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   dricksen knyts till betalningen som gör notan slut — även kontant'

do $$
declare
  v_rest    uuid := '11111111-1111-1111-1111-111111111111';
  v_order   uuid;
  v_card    uuid;
  v_cash    uuid;
  v_gift    uuid;
  v_pid     uuid;
begin
  -- Nota på 10000 med 1000 i dricks. Presentkortet tar 5000, kontanterna 6000.
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, tip_ore, total_ore)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 10000, 1000, 11000)
  returning id into v_order;

  insert into public.tips (order_id, restaurant_id, amount_ore)
  values (v_order, v_rest, 1000);

  v_card := public.issue_gift_card(v_rest, 'K3L4M5N6P7Q8', 5000, 'BAM');
  v_gift := public.redeem_gift_card('K3L4M5N6P7Q8', v_order, 5000);

  -- Halva notan betald. Dricksen ligger kvar i det som återstår.
  select payment_id into v_pid from public.tips where order_id = v_order;
  if v_pid is not null then
    raise exception 'FEL: dricksen knöts till en betalning som inte gjorde notan slut';
  end if;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_order, v_rest, 6000, 'CASH', 'CAPTURED', gen_random_uuid(), now())
  returning id into v_cash;

  -- Kontantvägen har ingen webhook att haka på och gick förut tomhänt.
  select payment_id into v_pid from public.tips where order_id = v_order;
  if v_pid is distinct from v_cash then
    raise exception 'FEL: dricksen knöts till % i stället för kontantraden %', v_pid, v_cash;
  end if;

  -- Och den flyttar sig inte när något annat händer med betalningen.
  begin
    update public.tips set payment_id = v_gift where order_id = v_order;
    raise exception 'FEL: dricksen gick att knyta om till en annan betalning';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

\echo '   dricks på en avbruten eller återbetald order räknas inte'

do $$
declare
  v_rest    uuid := '11111111-1111-1111-1111-111111111111';
  v_draft   uuid;
  v_paid    uuid;
  v_payment uuid;
  v_kvar    integer;
begin
  -- 1. Ett utkast som aldrig betalades. Dricks på mat ingen fick.
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, tip_ore, total_ore)
  values (v_rest, 'PICKUP', 'DRAFT', gen_random_uuid(), 5000, 500, 5500)
  returning id into v_draft;

  insert into public.tips (order_id, restaurant_id, amount_ore)
  values (v_draft, v_rest, 500);

  update public.orders set status = 'CANCELLED' where id = v_draft;

  if (select released_at from public.tips where order_id = v_draft) is null then
    raise exception 'FEL: dricksen stod kvar på en avbruten order';
  end if;

  -- 2. En nota som betalats och sedan lämnats tillbaka i sin helhet.
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, tip_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 4000, 400, 4400, now())
  returning id into v_paid;

  insert into public.tips (order_id, restaurant_id, amount_ore)
  values (v_paid, v_rest, 400);

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_paid, v_rest, 4400, 'CASH', 'CAPTURED', gen_random_uuid(), now())
  returning id into v_payment;

  -- En DELåterbetalning rör inte dricksen: ordern är fortfarande genomförd.
  perform public.request_refund(v_payment, 1000, 'Kall förrätt');

  if (select released_at from public.tips where order_id = v_paid) is not null then
    raise exception 'FEL: en delåterbetalning tog dricksen';
  end if;

  -- Resten tillbaka. Nu är hela notan borta och dricksen med den.
  perform public.request_refund(v_payment, 3400, 'Gästen blev sjuk');

  if (select status from public.orders where id = v_paid) <> 'REFUNDED' then
    raise exception 'FEL: ordern blev inte REFUNDED av den andra motbokningen';
  end if;

  if (select released_at from public.tips where order_id = v_paid) is null then
    raise exception 'FEL: dricksen stod kvar efter att hela notan lämnats tillbaka';
  end if;

  -- Raden står kvar. Historiken ska visa både att dricksen togs emot och att
  -- den gick tillbaka.
  select count(*) into v_kvar from public.tips where order_id in (v_draft, v_paid);
  if v_kvar <> 2 then
    raise exception 'FEL: % dricksrader kvar i stället för 2 — de raderades', v_kvar;
  end if;

  -- Och de räknas inte längre.
  if (select tips_ore from public.restaurant_tips_summary(
        v_rest, now() - interval '1 hour', now() + interval '1 hour')) <> 0 then
    raise exception 'FEL: återlämnad dricks räknas fortfarande som att fördela';
  end if;
end
$$;

\echo '   dricksliggaren går inte att skriva om'

do $$
declare
  v_rest  uuid := '11111111-1111-1111-1111-111111111111';
  v_order uuid;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, tip_ore, total_ore)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 2000, 200, 2200)
  returning id into v_order;

  insert into public.tips (order_id, restaurant_id, amount_ore)
  values (v_order, v_rest, 200);

  -- Beloppet är det som gör raden till bevis.
  begin
    update public.tips set amount_ore = 99999 where order_id = v_order;
    raise exception 'FEL: dricksbeloppet gick att skriva om';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.tips where order_id = v_order;
    raise exception 'FEL: en dricksrad gick att radera';
  exception
    when insufficient_privilege then null;
  end;

  update public.tips set released_at = now() where order_id = v_order;

  begin
    update public.tips set released_at = now() where order_id = v_order;
    raise exception 'FEL: samma dricks gick att lämna tillbaka två gånger';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

\echo '   statistiken och avräkningen läser samma dricks'

do $$
declare
  v_rest      uuid;
  v_kvar      uuid;
  v_borta     uuid;
  v_payment   uuid;
  v_stat      bigint;
  v_settle    bigint;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Dricks Test', 'dricks-test', '4200000000066',
          'Ferhadija 20', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  -- En nota som står kvar, och en som lämnas tillbaka i sin helhet.
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, tip_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 10000, 1000, 11000,
          '2026-06-15 10:00:00+00')
  returning id into v_kvar;

  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, tip_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 5000, 500, 5500,
          '2026-06-16 10:00:00+00')
  returning id into v_borta;

  insert into public.tips (order_id, restaurant_id, amount_ore)
  values (v_kvar, v_rest, 1000), (v_borta, v_rest, 500);

  insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore)
  values (v_kvar, v_rest, 'GROSS_ITEMS', 10000, 340, 340),
         (v_borta, v_rest, 'GROSS_ITEMS', 5000, 340, 170);

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_borta, v_rest, 5500, 'CASH', 'CAPTURED', gen_random_uuid(), '2026-06-16 10:05:00+00')
  returning id into v_payment;

  perform public.request_refund(v_payment, 5500, 'Hela notan tillbaka');

  select tips_ore into v_stat
  from public.restaurant_revenue_summary(v_rest, '2026-06-01', '2026-07-01');

  select tips_ore into v_settle
  from public.settlement_preview(v_rest, '2026-06-01', '2026-06-30');

  -- Statistiken räknar bara COMPLETED, avräkningen tar med REFUNDED för att
  -- bruttot ska stämma. Dricksen ska ändå bli densamma: den återlämnade räknas
  -- inte på något av ställena.
  if v_stat <> 1000 then
    raise exception 'FEL: statistiken sa % i dricks, väntade 1000', v_stat;
  end if;

  if v_settle <> 1000 then
    raise exception 'FEL: avräkningen sa % i dricks, väntade 1000', v_settle;
  end if;
end
$$;

\echo '   en gäst kan raderas trots att loggarna är oföränderliga'

do $$
declare
  v_rest    uuid := '11111111-1111-1111-1111-111111111111';
  v_user    uuid;
  v_order   uuid;
  v_coupon  uuid;
  v_review  uuid;
  v_summary jsonb;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'radera@example.com')
  returning id into v_user;

  update public.restaurants set punch_card_size = 2 where id = v_rest;

  insert into public.coupons (restaurant_id, code, discount_bps, max_per_guest)
  values (v_rest, 'RADERA10', 1000, 5)
  returning id into v_coupon;

  -- Tre genomförda order ger lojalitetspoäng och fyller klippkortet.
  for i in 1..3 loop
    insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key,
                               items_gross_ore, total_ore)
    values (v_rest, v_user, 'PICKUP', 'DRAFT', gen_random_uuid(), 10000, 10000)
    returning id into v_order;

    update public.orders set status = 'PLACED'    where id = v_order;
    update public.orders set status = 'ACCEPTED'  where id = v_order;
    update public.orders set status = 'PREPARING' where id = v_order;
    update public.orders set status = 'READY'     where id = v_order;
    update public.orders set status = 'COMPLETED' where id = v_order;
  end loop;

  -- En fjärde order som tar ut belöningen och använder kupongen.
  insert into public.orders (restaurant_id, guest_id, type, status, idempotency_key,
                             items_gross_ore, total_ore)
  values (v_rest, v_user, 'PICKUP', 'PLACED', gen_random_uuid(), 10000, 10000)
  returning id into v_order;

  perform public.redeem_punch_card(v_rest, v_user, v_order, 1000);
  perform public.redeem_coupon(v_coupon, v_order, v_user, 1000);

  insert into public.reviews (restaurant_id, user_id, order_id, rating_food, comment)
  values (v_rest, v_user,
          (select id from public.orders
           where guest_id = v_user and status = 'COMPLETED' limit 1),
          5, 'Bäst i stan, och jag heter Ivan Ivanović')
  returning id into v_review;

  insert into public.favorites (user_id, restaurant_id) values (v_user, v_rest);
  insert into public.addresses (user_id, street_address, postal_code, city)
  values (v_user, 'Ferhadija 1', '71000', 'Sarajevo');

  -- Exporten måste innehålla allt innan något raderas.
  select public.export_guest_data(v_user) into v_summary;

  if jsonb_array_length(v_summary -> 'orders') <> 4 then
    raise exception 'FEL: exporten hade % order, väntade 4',
      jsonb_array_length(v_summary -> 'orders');
  end if;
  if jsonb_array_length(v_summary -> 'reviews') <> 1
     or jsonb_array_length(v_summary -> 'addresses') <> 1
     or jsonb_array_length(v_summary -> 'favourites') <> 1
     or jsonb_array_length(v_summary -> 'coupons_used') <> 1
     or jsonb_array_length(v_summary -> 'punch_card_rewards') <> 1
     or jsonb_array_length(v_summary -> 'loyalty') <> 1 then
    raise exception 'FEL: exporten saknade något: %', v_summary;
  end if;

  -- Fritexten gästen skrev ska stå som hon skrev den.
  if v_summary #>> '{reviews,0,comment}' not like '%Ivan%' then
    raise exception 'FEL: exporten tappade omdömets text';
  end if;

  /*
   * Raderingen. Före migration 0041 föll den på fyra olika spärrar i tur och
   * ordning — omdömets check, lojalitetsloggen, klippkortet och kupongen.
   */
  select public.erase_guest(v_user) into v_summary;

  if exists (select 1 from auth.users where id = v_user) then
    raise exception 'FEL: kontot fanns kvar';
  end if;

  -- Bokföringen står kvar, utan köpare.
  if (select count(*) from public.orders where guest_id = v_user) <> 0 then
    raise exception 'FEL: order pekade fortfarande på gästen';
  end if;

  if (v_summary ->> 'orders_anonymised')::integer <> 4 then
    raise exception 'FEL: kvittot sa % avidentifierade order, väntade 4',
      v_summary ->> 'orders_anonymised';
  end if;

  -- Omdömet: betyget kvar, orden borta, författaren borta.
  if not exists (
    select 1 from public.reviews
    where id = v_review
      and user_id is null
      and comment is null
      and anonymised_at is not null
      and rating_food = 5
  ) then
    raise exception 'FEL: omdömet avidentifierades inte som avsett';
  end if;

  -- Loggarna står kvar och är fortfarande oföränderliga.
  if (select count(*) from public.punch_card_redemptions
      where restaurant_id = v_rest and guest_id is null) < 1 then
    raise exception 'FEL: klippkortsuttaget försvann i stället för att lossas';
  end if;

  if (select count(*) from public.coupon_redemptions
      where coupon_id = v_coupon and guest_id is null) <> 1 then
    raise exception 'FEL: kuponginlösen försvann i stället för att lossas';
  end if;

  if (select count(*) from public.loyalty_accounts where user_id is null) < 1 then
    raise exception 'FEL: lojalitetskontot raderades i stället för att lossas';
  end if;

  -- Det rent personliga är borta.
  if exists (select 1 from public.addresses where user_id = v_user)
     or exists (select 1 from public.favorites where user_id = v_user)
     or exists (select 1 from public.profiles where id = v_user) then
    raise exception 'FEL: personuppgifter låg kvar';
  end if;

  -- Och en avidentifierad rad går inte att knyta till någon igen.
  begin
    update public.coupon_redemptions
    set guest_id = '11111111-1111-1111-1111-111111111111'
    where coupon_id = v_coupon;
    raise exception 'FEL: en avidentifierad inlösen gick att knyta till en person';
  exception
    when insufficient_privilege then null;
    when foreign_key_violation then null;
  end;
end
$$;

\echo '   personal raderas inte utan att anställningen avslutas först'

do $$
declare
  v_rest uuid := '11111111-1111-1111-1111-111111111111';
  v_user uuid;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'anstalld@example.com')
  returning id into v_user;

  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_rest, v_user, 'staff', true);

  begin
    perform public.erase_guest(v_user);
    raise exception 'FEL: en anställd raderades, och tog sin anställning med sig';
  exception
    when check_violation then null;
  end;

  -- Utan anställning går det.
  delete from public.staff where user_id = v_user;
  perform public.erase_guest(v_user);

  if exists (select 1 from auth.users where id = v_user) then
    raise exception 'FEL: kontot fanns kvar efter att anställningen tagits bort';
  end if;
end
$$;

\echo '   saldot räknas likadant i databasen som i @burp/core'

do $$
declare
  v_user    uuid;
  v_account uuid;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'saldo@example.com')
  returning id into v_user;

  insert into public.loyalty_accounts (user_id, restaurant_id)
  values (v_user, null)
  returning id into v_account;

  /*
   * Exakt de fall loyalty.test.ts kör mot calculateBalance().
   *
   * Regeln fanns bara i TypeScript fram till migration 0042, och GDPR-exporten
   * rapporterade därför ett annat saldo än kontosidan. Det här testet är det
   * som håller de två i takt.
   */

  -- 500 som gick ut, 200 som lever. Bara de levande räknas.
  insert into public.loyalty_transactions (account_id, kind, points, expires_at)
  values (v_account, 'EARN', 500, now() - interval '1 day'),
         (v_account, 'EARN', 200, now() + interval '90 days');

  if public.loyalty_balance(v_account) <> 200 then
    raise exception 'FEL: saldot blev %, väntade 200', public.loyalty_balance(v_account);
  end if;

  -- Poäng utan utgångsdatum lever för alltid.
  insert into public.loyalty_transactions (account_id, kind, points)
  values (v_account, 'ADJUSTMENT', 50);

  if public.loyalty_balance(v_account) <> 250 then
    raise exception 'FEL: saldot blev %, väntade 250', public.loyalty_balance(v_account);
  end if;

  -- Saldot går aldrig under noll.
  insert into public.loyalty_transactions (account_id, kind, points)
  values (v_account, 'REDEEM', -1000);

  if public.loyalty_balance(v_account) <> 0 then
    raise exception 'FEL: saldot blev negativt (%)', public.loyalty_balance(v_account);
  end if;
end
$$;

\echo '   jobbet bokför utgången en gång, och aldrig mer än saldot'

do $$
declare
  v_user   uuid;
  v_a      uuid;
  v_b      uuid;
  v_result record;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'jobb@example.com')
  returning id into v_user;

  insert into public.loyalty_accounts (user_id, restaurant_id)
  values (v_user, null)
  returning id into v_a;

  insert into public.loyalty_accounts (user_id, restaurant_id)
  values (v_user, '11111111-1111-1111-1111-111111111111')
  returning id into v_b;

  -- Konto A: 300 mognade, 100 lever.
  insert into public.loyalty_transactions (account_id, kind, points, expires_at)
  values (v_a, 'EARN', 300, now() - interval '1 day'),
         (v_a, 'EARN', 100, now() + interval '90 days');

  -- Konto B: 400 mognade, men 350 är redan inlösta. Bara 50 finns kvar att
  -- boka bort — utan taket mot saldot hade kontot hamnat på minus 350.
  insert into public.loyalty_transactions (account_id, kind, points, expires_at)
  values (v_b, 'EARN', 400, now() - interval '1 day');
  insert into public.loyalty_transactions (account_id, kind, points)
  values (v_b, 'REDEEM', -350);

  select * into v_result from public.expire_loyalty_points();

  if v_result.points_expired <> 350 then
    raise exception 'FEL: jobbet bokförde % poäng, väntade 350 (300 + 50)',
      v_result.points_expired;
  end if;

  if public.loyalty_balance(v_a) <> 100 then
    raise exception 'FEL: konto A blev %, väntade 100', public.loyalty_balance(v_a);
  end if;

  -- Rå summa, inte den filtrerade: den ska vara noll och inte negativ.
  if (select sum(points) from public.loyalty_transactions where account_id = v_b) <> 0 then
    raise exception 'FEL: konto B:s logg summerar till %, väntade 0',
      (select sum(points) from public.loyalty_transactions where account_id = v_b);
  end if;

  -- En andra körning ska inte bokföra samma utgång igen.
  select * into v_result from public.expire_loyalty_points();

  if v_result.points_expired <> 0 then
    raise exception 'FEL: andra körningen bokförde % poäng till', v_result.points_expired;
  end if;

  if public.loyalty_balance(v_a) <> 100 then
    raise exception 'FEL: konto A ändrades av andra körningen (%)', public.loyalty_balance(v_a);
  end if;
end
$$;

\echo '   exporten visar samma saldo som gästen ser'

do $$
declare
  v_user    uuid;
  v_account uuid;
  v_json    jsonb;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'export@example.com')
  returning id into v_user;

  insert into public.loyalty_accounts (user_id, restaurant_id)
  values (v_user, null)
  returning id into v_account;

  insert into public.loyalty_transactions (account_id, kind, points, expires_at)
  values (v_account, 'EARN', 500, now() - interval '30 days'),
         (v_account, 'EARN', 200, now() + interval '90 days');

  select public.export_guest_data(v_user) into v_json;

  -- Före 0042 summerade exporten loggen rakt av och sa 700.
  if (v_json #>> '{loyalty,0,balance_points}')::integer <> 200 then
    raise exception 'FEL: exporten sa % poäng, kontosidan visar 200',
      v_json #>> '{loyalty,0,balance_points}';
  end if;

  -- Händelserna ska ändå finnas med i sin helhet. Gästen har rätt till
  -- underlaget, inte bara till slutsumman.
  if jsonb_array_length(v_json #> '{loyalty,0,transactions}') <> 2 then
    raise exception 'FEL: exporten tappade poänghändelser';
  end if;
end
$$;

\echo '   hela pengavägen stämmer över alla ytor'

/*
 * Avstämning tvärs över migration 0027, 0039 och 0040.
 *
 * Varje funktion har egna tester. Det här testet finns för det ingen av dem kan
 * fånga: att de säger SAMMA sak om samma order. Tre gånger under bygget har
 * felet varit just det — samma fråga besvarad på två ställen med olika svar —
 * och varje gång upptäcktes det av en slump snarare än av ett test.
 *
 * `smoke.sh` skulle göra det här mot en körande app. Det går inte på maskinen
 * bygget sker på, och en avstämning som bara går att köra någon annanstans är
 * ingen avstämning.
 */
do $$
declare
  v_rest    uuid;
  v_order   uuid;
  v_payment uuid;
  v_stat    record;
  v_settle  record;
  v_tips    record;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Avstämning Test', 'avstamning-test', '4200000000077',
          'Ferhadija 22', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  -- En nota: 100,00 KM mat och 10,00 KM dricks. Avgiften är 3,40 % av maten.
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, items_vat_ore, tip_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(),
          10000, 1453, 1000, 11000, '2026-06-15 10:00:00+00')
  returning id into v_order;

  insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore)
  values (v_order, v_rest, 'GROSS_ITEMS', 10000, 340, 340);

  insert into public.tips (order_id, restaurant_id, amount_ore)
  values (v_order, v_rest, 1000);

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, status, idempotency_key, captured_at)
  values (v_order, v_rest, 11000, 'CASH', 'CAPTURED', gen_random_uuid(),
          '2026-06-15 10:20:00+00')
  returning id into v_payment;

  -- ── Före återbetalningen ──────────────────────────────────────────────────

  select * into v_stat
  from public.restaurant_revenue_summary(v_rest, '2026-06-01', '2026-07-01');

  select * into v_settle
  from public.settlement_preview(v_rest, '2026-06-01', '2026-06-30');

  select * into v_tips
  from public.restaurant_tips_summary(v_rest, '2026-06-01', '2026-07-01');

  if v_stat.items_gross_ore <> v_settle.gross_ore then
    raise exception 'FEL: statistiken säger % i omsättning, avräkningen %',
      v_stat.items_gross_ore, v_settle.gross_ore;
  end if;

  if v_stat.tips_ore <> v_settle.tips_ore or v_stat.tips_ore <> v_tips.tips_ore then
    raise exception 'FEL: dricksen är %, % och % på tre ytor',
      v_stat.tips_ore, v_settle.tips_ore, v_tips.tips_ore;
  end if;

  if v_stat.fees_ore <> v_settle.fees_ore then
    raise exception 'FEL: avgiften är % i statistiken och % i avräkningen',
      v_stat.fees_ore, v_settle.fees_ore;
  end if;

  -- Dricksen ligger i sedlarna, inte bland det obetalda.
  if v_tips.cash_ore <> 1000 or v_tips.pending_ore <> 0 then
    raise exception 'FEL: dricksen delades % kontant och % obetald',
      v_tips.cash_ore, v_tips.pending_ore;
  end if;

  -- Kontantraden är hela notan, dricksen inräknad. Avgiften räknas bara på
  -- maten: dricks är aldrig i avgiftsunderlaget (regel 8).
  if v_settle.cash_ore <> 11000 then
    raise exception 'FEL: kassan tog emot %, väntade 11000', v_settle.cash_ore;
  end if;

  if v_settle.amount_due_ore <> 340 then
    raise exception 'FEL: att fakturera blev %, väntade 340', v_settle.amount_due_ore;
  end if;

  -- ── Hela notan tillbaka ───────────────────────────────────────────────────

  perform public.request_refund(v_payment, 11000, 'Gästen blev sjuk');
  update public.refunds set settled_at = '2026-06-16 10:00:00+00' where payment_id = v_payment;

  select * into v_stat
  from public.restaurant_revenue_summary(v_rest, '2026-06-01', '2026-07-01');

  select * into v_settle
  from public.settlement_preview(v_rest, '2026-06-01', '2026-06-30');

  select * into v_tips
  from public.restaurant_tips_summary(v_rest, '2026-06-01', '2026-07-01');

  -- Statistiken räknar bara COMPLETED. En återbetald order är inte omsättning.
  if v_stat.orders_count <> 0 or v_stat.items_gross_ore <> 0 or v_stat.tips_ore <> 0 then
    raise exception 'FEL: statistiken räknade fortfarande den återbetalda ordern (% order, % brutto, % dricks)',
      v_stat.orders_count, v_stat.items_gross_ore, v_stat.tips_ore;
  end if;

  /*
   * Avräkningen tar med REFUNDED i bruttot med flit.
   *
   * Föll den ur skulle måltiden räknas bort en gång av bruttot och en gång av
   * återbetalningen. Bruttot står alltså kvar — men dricksen gick tillbaka till
   * gästen och krediten tar bort avgiften.
   */
  if v_settle.gross_ore <> 10000 then
    raise exception 'FEL: avräkningens brutto blev %, väntade 10000', v_settle.gross_ore;
  end if;

  if v_settle.tips_ore <> 0 or v_tips.tips_ore <> 0 then
    raise exception 'FEL: dricksen stod kvar efter återbetalningen (% respektive %)',
      v_settle.tips_ore, v_tips.tips_ore;
  end if;

  if v_settle.refunds_ore <> 11000 then
    raise exception 'FEL: återbetalt blev %, väntade 11000', v_settle.refunds_ore;
  end if;

  if v_settle.fee_credit_ore <> 340 then
    raise exception 'FEL: krediten blev %, väntade 340', v_settle.fee_credit_ore;
  end if;

  -- Det som räknas: Burp fakturerar ingenting för en måltid som lämnats
  -- tillbaka i sin helhet.
  if v_settle.amount_due_ore <> 0 then
    raise exception 'FEL: Burp fakturerade % för en helt återbetald måltid',
      v_settle.amount_due_ore;
  end if;
end
$$;

\echo '   ett presentkort med en kod som inte går att lösa in ges inte ut'

do $$
declare
  v_rest uuid := '11111111-1111-1111-1111-111111111111';
begin
  -- Nolla och etta finns inte i presentkortets alfabet. De läses som O och I
  -- när koden sägs högt, och kortet hade aldrig gått att lösa in.
  begin
    perform public.issue_gift_card(v_rest, 'A0B3C4D5E6F7', 5000, 'BAM');
    raise exception 'FEL: ett kort med en nolla i koden gavs ut';
  exception
    when check_violation then null;
  end;

  begin
    perform public.issue_gift_card(v_rest, 'A1B3C4D5E6F7', 5000, 'BAM');
    raise exception 'FEL: ett kort med en etta i koden gavs ut';
  exception
    when check_violation then null;
  end;

  -- Fel längd är samma sak: koden trycks i tre grupper om fyra.
  begin
    perform public.issue_gift_card(v_rest, 'A2B3C4D5', 5000, 'BAM');
    raise exception 'FEL: ett kort med åtta tecken gavs ut';
  exception
    when check_violation then null;
  end;

  -- Och en giltig kod går fortfarande igenom.
  perform public.issue_gift_card(v_rest, 'W2X3Y4Z5A6B7', 5000, 'BAM');

  if public.gift_card_balance(
       (select id from public.gift_cards where code = 'W2X3Y4Z5A6B7')) <> 5000 then
    raise exception 'FEL: det giltiga kortet fick fel saldo';
  end if;
end
$$;

\echo '   en nota kan delas mellan sedlar och terminal, men inte dubbleras'

do $$
declare
  v_rest  uuid := '11111111-1111-1111-1111-111111111111';
  v_order uuid;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 10000, 10000, now())
  returning id into v_order;

  -- Halva i kortläsaren, resten i sedlar. Ett vanligt sätt att betala, och det
  -- gamla indexet (en rad per order) hade gjort det omöjligt.
  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, method, status, idempotency_key, captured_at)
  values (v_order, v_rest, 6000, 'TERMINAL', 'card_present', 'CAPTURED', gen_random_uuid(), now());

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, method, status, idempotency_key, captured_at)
  values (v_order, v_rest, 4000, 'CASH', 'cash', 'CAPTURED', gen_random_uuid(), now());

  -- Samma betalsätt två gånger är däremot ett dubbeltryck.
  begin
    insert into public.payments
      (order_id, restaurant_id, amount_ore, provider, method, status, idempotency_key, captured_at)
    values (v_order, v_rest, 100, 'TERMINAL', 'card_present', 'CAPTURED', gen_random_uuid(), now());
    raise exception 'FEL: samma order kvitterades två gånger i terminalen';
  exception
    when unique_violation then null;
  end;

  -- En terminalrad utan tidpunkt är inte avstämbar mot ett kassapass.
  begin
    insert into public.orders (restaurant_id, type, status, idempotency_key,
                               items_gross_ore, total_ore, completed_at)
    values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 5000, 5000, now())
    returning id into v_order;

    insert into public.payments
      (order_id, restaurant_id, amount_ore, provider, method, status, idempotency_key)
    values (v_order, v_rest, 5000, 'TERMINAL', 'card_present', 'CAPTURED', gen_random_uuid());
    raise exception 'FEL: en terminalbetalning utan tidpunkt gick igenom';
  exception
    when check_violation then null;
  end;
end
$$;

\echo '   en terminalbetalning återbetalas utan att någon leverantör tillfrågas'

do $$
declare
  v_rest    uuid := '11111111-1111-1111-1111-111111111111';
  v_order   uuid;
  v_payment uuid;
  v_refund  uuid;
  v_status  public.refund_status;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 8000, 8000, now())
  returning id into v_order;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, method, status, idempotency_key, captured_at)
  values (v_order, v_rest, 8000, 'TERMINAL', 'card_present', 'CAPTURED', gen_random_uuid(), now())
  returning id into v_payment;

  v_refund := public.request_refund(v_payment, 8000, 'Fel rätt');

  -- Pengarna lämnas tillbaka i terminalen av personalen. En PENDING-rad hade
  -- väntat på en webhook som aldrig kommer.
  select status into v_status from public.refunds where id = v_refund;
  if v_status <> 'SUCCEEDED' then
    raise exception 'FEL: motbokningen blev % i stället för SUCCEEDED', v_status;
  end if;

  if (select status from public.payments where id = v_payment) <> 'REFUNDED' then
    raise exception 'FEL: betalningen markerades inte som återbetald';
  end if;
end
$$;

\echo '   bordets nota kan kvitteras i terminalen, men inte som vad som helst'

do $$
declare
  v_rest     uuid := '11111111-1111-1111-1111-111111111111';
  v_table_id uuid;
  v_session  uuid;
  v_order    uuid;
  v_together uuid;
  v_rows     integer;
begin
  -- Eget bord i stället för att leta upp ett ledigt. Tidigare test i filen
  -- öppnar notor på seedens bord, och ett `limit 1` som inte hittar något ger
  -- ett null som faller långt senare med ett fel som pekar helt fel.
  insert into public.tables (restaurant_id, table_number, zone, qr_public_id, status)
  values (v_rest, 'T-TERM', 'Test', 'T4RM99', 'ACTIVE')
  returning id into v_table_id;

  v_session := public.open_table_session(v_table_id, v_rest);

  insert into public.orders (restaurant_id, table_id, table_session_id, type, status,
                             idempotency_key, total_ore)
  values (v_rest, v_table_id, v_session, 'TABLE', 'DRAFT', gen_random_uuid(), 4000)
  returning id into v_order;

  update public.orders set status = 'PLACED'    where id = v_order;
  update public.orders set status = 'ACCEPTED'  where id = v_order;
  update public.orders set status = 'PREPARING' where id = v_order;
  update public.orders set status = 'READY'     where id = v_order;
  update public.orders set status = 'COMPLETED' where id = v_order;

  -- Ett kortflöde genom Burp skrivs av webhooken och hör inte hemma här.
  begin
    perform public.settle_table_session(v_session, 4000, null, 'STRIPE');
    raise exception 'FEL: bordets nota gick att kvittera som STRIPE';
  exception
    when check_violation then null;
  end;

  v_together := public.settle_table_session(v_session, 4000, null, 'TERMINAL');

  select count(*) into v_rows
  from public.payments
  where settled_together_id = v_together and provider = 'TERMINAL';

  if v_rows <> 1 then
    raise exception 'FEL: % terminalrader skrevs, väntade 1', v_rows;
  end if;

  if (select method from public.payments where settled_together_id = v_together)
     <> 'card_present' then
    raise exception 'FEL: betalsättet på raden blev inte card_present';
  end if;
end
$$;

\echo '   ingen tabell läcker mellan restauranger — svepet går över hela schemat'

/*
 * Det generella hyresgästtestet.
 *
 * De andra RLS-testerna kontrollerar en tabell i taget, vilket betyder att en
 * ny tabell är oskyddad tills någon kommer ihåg att skriva ett test för den.
 * Det här svepet frågar KATALOGEN vilka tabeller som bär `restaurant_id` och
 * kontrollerar dem allihop. En tabell som läggs till i morgon täcks utan att
 * någon rör den här filen — och en som saknar policy faller direkt.
 *
 * ── Vad som räknas som läckage ─────────────────────────────────────────────
 *
 * Inte "B ser rader som tillhör A". Menyer, priser, omdömen och godkända bilder
 * är PUBLIKA — hela marknadsplatsen bygger på att vem som helst kan läsa dem,
 * och en restaurangägare är också vem som helst.
 *
 * Invarianten är i stället: **B får inte se mer av A än en anonym besökare
 * ser.** Det fångar det som faktiskt är hemligt — order, betalningar, avgifter,
 * personal, presentkort — utan att en allmän meny räknas som ett läckage. Och
 * den behöver ingen lista över undantag som någon måste hålla aktuell.
 *
 * Två riktningar mäts, och båda behövs:
 *
 *   1. B ser inte mer än anon. Det är läckaget.
 *   2. A:s egen ägare MÅSTE se sina rader. Utan den kontrollen skulle en policy
 *      som nekar allting räknas som godkänd, och testet vore värdelöst.
 */
do $$
declare
  v_a         uuid := '11111111-1111-1111-1111-111111111111';
  v_b         uuid;
  v_owner_a   uuid;
  v_owner_b   uuid;
  v_tbl       text;
  v_leaked    bigint;
  v_public    bigint;
  v_own       bigint;
  v_total     bigint;
  v_checked   integer := 0;
  v_with_data integer := 0;
  v_blind     text[] := '{}';
  v_leaks     text[] := '{}';
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Hyresgäst B', 'hyresgast-b', '4200000000088',
          'Ferhadija 24', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_b;

  insert into auth.users (id, email) values (gen_random_uuid(), 'agare-a@example.com')
  returning id into v_owner_a;
  insert into auth.users (id, email) values (gen_random_uuid(), 'agare-b@example.com')
  returning id into v_owner_b;

  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_a, v_owner_a, 'owner', true), (v_b, v_owner_b, 'owner', true);

  for v_tbl in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a
      on a.attrelid = c.oid and a.attname = 'restaurant_id' and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public'
      and c.relkind = 'r'
      -- Tabeller som ägs av ett tillägg är inte våra.
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    order by c.relname
  loop
    v_checked := v_checked + 1;

    -- Som ägaren (superuser här) — hur mycket finns det att gömma?
    execute format('select count(*) from public.%I where restaurant_id = $1', v_tbl)
      into v_total using v_a;

    if v_total = 0 then
      continue;  -- Ingenting att läcka. Räknas inte som bevis åt något håll.
    end if;

    v_with_data := v_with_data + 1;

    /*
     * Identiteten sätts som `request.jwt.claim.sub`, inte som JSON.
     *
     * Stubben i verify-schema.sh läser bara den formen; Supabases riktiga
     * auth.uid() läser båda. Att sätta fel form ger en tyst null — alltså en
     * anonym användare — och då hade svepet "passerat" för att INGEN såg
     * någonting. Kontrollen att ägaren ser sina egna rader är det som avslöjar
     * en sådan uppsättning, och den gjorde det.
     */

    -- Som en anonym besökare. Det här är måttstocken: vad som ändå är publikt.
    execute 'set local role anon';
    perform set_config('request.jwt.claim.sub', '', true);

    execute format('select count(*) from public.%I where restaurant_id = $1', v_tbl)
      into v_public using v_a;

    -- Som restaurang B:s ägare.
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', v_owner_b::text, true);

    execute format('select count(*) from public.%I where restaurant_id = $1', v_tbl)
      into v_leaked using v_a;

    -- Som restaurang A:s egen ägare.
    perform set_config('request.jwt.claim.sub', v_owner_a::text, true);

    execute format('select count(*) from public.%I where restaurant_id = $1', v_tbl)
      into v_own using v_a;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);

    if v_leaked > v_public then
      v_leaks := v_leaks
        || format('%s (%s rader mot anons %s)', v_tbl, v_leaked, v_public);
    end if;

    if v_own = 0 then
      v_blind := v_blind || v_tbl;
    end if;
  end loop;

  if array_length(v_leaks, 1) > 0 then
    raise exception 'FEL: restaurang B såg mer av A än en anonym besökare i %',
      array_to_string(v_leaks, ', ');
  end if;

  /*
   * Blinda tabeller är inte ett läckage men nästan alltid ett fel.
   *
   * Ägaren som inte ser sina egna rader betyder antingen en saknad policy eller
   * en som filtrerar på fel kolumn. Båda upptäcks annars först när en sida står
   * tom i produktion — och då läses det som att datan är borta.
   *
   * Två undantag, båda medvetna:
   *
   * `rate_limit_hits` är plattformens räknare och har ingen ägare att visa den
   * för.
   *
   * `loyalty_accounts` har policy för gästen och för Burp men ingen för
   * restaurangen — den ska inte kunna bläddra i vilka gäster som är med i
   * programmet. Ingen kod skapar restaurangbundna konton i dag heller;
   * poängen ligger i Burps globala program. Frågan tas när Fas 3 byggs, och
   * står i docs/TODO.md så att den inte upptäcks som ett hål då.
   */
  v_blind := array_remove(v_blind, 'rate_limit_hits');
  v_blind := array_remove(v_blind, 'loyalty_accounts');

  if array_length(v_blind, 1) > 0 then
    raise exception 'FEL: ägaren ser inte sina egna rader i %', array_to_string(v_blind, ', ');
  end if;

  -- Ett svep som inte hittade något att kontrollera bevisar ingenting.
  if v_with_data < 8 then
    raise exception 'FEL: bara % av % tabeller hade data att gömma — svepet säger inget',
      v_with_data, v_checked;
  end if;

  raise notice '      % tabeller med restaurant_id, varav % med data att gömma',
    v_checked, v_with_data;
end
$$;

\echo '   händelseloggen visar vem som rörde pengarna, och bara för rätt roll'

do $$
declare
  v_rest     uuid := '11111111-1111-1111-1111-111111111111';
  v_owner    uuid;
  v_waiter   uuid;
  v_order    uuid;
  v_refunded uuid;
  v_payment  uuid;
  v_rows     integer;
  v_kind     text;
  v_actor    text;
  v_reason   text;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'agare-logg@example.com')
  returning id into v_owner;
  insert into auth.users (id, email) values (gen_random_uuid(), 'servitor-logg@example.com')
  returning id into v_waiter;

  update public.profiles set full_name = 'Amira Ägare' where id = v_owner;

  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_rest, v_owner, 'owner', true), (v_rest, v_waiter, 'staff', true);

  -- En nota som betalas och sedan lämnas tillbaka av ägaren.
  insert into public.orders (restaurant_id, type, status, idempotency_key,
                             items_gross_ore, total_ore, completed_at)
  values (v_rest, 'PICKUP', 'COMPLETED', gen_random_uuid(), 9000, 9000, now())
  returning id into v_refunded;

  insert into public.payments
    (order_id, restaurant_id, amount_ore, provider, method, status, idempotency_key, captured_at)
  values (v_refunded, v_rest, 9000, 'CASH', 'cash', 'CAPTURED', gen_random_uuid(), now())
  returning id into v_payment;

  perform public.request_refund(v_payment, 9000, 'Gästen fick fel rätt', v_owner);

  -- Och en order som avbryts.
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest, 'PICKUP', 'PLACED', gen_random_uuid(), 4000)
  returning id into v_order;

  update public.orders set status = 'CANCELLED' where id = v_order;

  -- ── Som ägaren ────────────────────────────────────────────────────────────
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  select count(*) into v_rows
  from public.restaurant_money_events(v_rest, now() - interval '1 hour', now() + interval '1 hour');

  if v_rows < 2 then
    raise exception 'FEL: loggen visade % rader, väntade minst 2', v_rows;
  end if;

  select kind, actor_name, reason into v_kind, v_actor, v_reason
  from public.restaurant_money_events(v_rest, now() - interval '1 hour', now() + interval '1 hour')
  -- Filtrerar på ORDERN och inte bara på sorten. Tidigare test i samma
  -- transaktion har lämnat andra återbetalningar hos samma restaurang, och ett
  -- `limit 1` hade plockat vilken som helst av dem.
  where kind = 'REFUND' and order_id = v_refunded;

  -- Namnet är hela poängen. Det ligger i `profiles`, som ägaren inte får läsa
  -- direkt — funktionen är SECURITY DEFINER just för det.
  if v_actor <> 'Amira Ägare' then
    raise exception 'FEL: återbetalningen tillskrevs "%", väntade Amira Ägare', v_actor;
  end if;

  if v_reason <> 'Gästen fick fel rätt' then
    raise exception 'FEL: skälet blev "%"', v_reason;
  end if;

  -- ── Som servitören ────────────────────────────────────────────────────────
  --
  -- Hon står med i listan; den ska ändå läsas av den som har ansvar för
  -- pengarna, inte av alla som förekommer i den.
  perform set_config('request.jwt.claim.sub', v_waiter::text, true);

  begin
    perform public.restaurant_money_events(
      v_rest, now() - interval '1 hour', now() + interval '1 hour');
    raise exception 'FEL: servitören fick läsa händelseloggen';
  exception
    when insufficient_privilege then null;
  end;

  -- ── Som en främling ───────────────────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);

  begin
    perform public.restaurant_money_events(
      v_rest, now() - interval '1 hour', now() + interval '1 hour');
    raise exception 'FEL: en utomstående fick läsa händelseloggen';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end
$$;

\echo '   chefen kan inte bjuda in någon till sin egen nivå'

do $$
declare
  v_rest    uuid;
  v_owner   uuid;
  v_manager uuid;
  v_waiter  uuid;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Personal Test', 'personal-test', '4200000000099',
          'Ferhadija 26', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  insert into auth.users (id, email) values (gen_random_uuid(), 'agare-p@example.com')
  returning id into v_owner;
  insert into auth.users (id, email) values (gen_random_uuid(), 'chef-p@example.com')
  returning id into v_manager;
  insert into auth.users (id, email) values (gen_random_uuid(), 'servitor-p@example.com')
  returning id into v_waiter;

  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_rest, v_owner, 'owner', true),
         (v_rest, v_manager, 'manager', true),
         (v_rest, v_waiter, 'staff', true);

  execute 'set local role authenticated';

  -- ── Ägaren får bjuda in vem som helst ─────────────────────────────────────
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform public.invite_staff(v_rest, 'ny-agare@example.com', 'owner',
                              repeat('a', 43));
  perform public.invite_staff(v_rest, 'ny-kock@example.com', 'kitchen',
                              repeat('b', 43));

  -- ── Chefen får bjuda in servitör och kock, men inte högre ─────────────────
  perform set_config('request.jwt.claim.sub', v_manager::text, true);
  perform public.invite_staff(v_rest, 'ny-servitor@example.com', 'staff',
                              repeat('c', 43));

  begin
    perform public.invite_staff(v_rest, 'smyg-agare@example.com', 'owner',
                                repeat('d', 43));
    raise exception 'FEL: chefen bjöd in en ägare';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.invite_staff(v_rest, 'smyg-chef@example.com', 'manager',
                                repeat('e', 43));
    raise exception 'FEL: chefen bjöd in en till chef';
  exception
    when insufficient_privilege then null;
  end;

  -- ── Servitören bjuder inte in någon ───────────────────────────────────────
  perform set_config('request.jwt.claim.sub', v_waiter::text, true);
  begin
    perform public.invite_staff(v_rest, 'kompis@example.com', 'kitchen',
                                repeat('f', 43));
    raise exception 'FEL: servitören bjöd in någon';
  exception
    when insufficient_privilege then null;
  end;

  -- ── En utomstående når ingenting ──────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.invite_staff(v_rest, 'inkraktare@example.com', 'owner',
                                repeat('g', 43));
    raise exception 'FEL: en utomstående bjöd in en ägare';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end
$$;

\echo '   inbjudan gäller en adress, en gång, och inte för evigt'

do $$
declare
  v_rest   uuid;
  v_owner  uuid;
  v_right  uuid;
  v_wrong  uuid;
  v_late   uuid;
  v_token  text := repeat('h', 43);
  v_id     uuid;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Inbjudan Test', 'inbjudan-test', '4200000000111',
          'Ferhadija 28', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  insert into auth.users (id, email) values (gen_random_uuid(), 'agare-i@example.com')
  returning id into v_owner;
  insert into auth.users (id, email) values (gen_random_uuid(), 'ratt@example.com')
  returning id into v_right;
  insert into auth.users (id, email) values (gen_random_uuid(), 'fel@example.com')
  returning id into v_wrong;

  -- Kontot för den utgångna inbjudan skapas HÄR, innan rollbytet. Som
  -- `authenticated` går det inte att skriva i schemat `auth` — och felet kommer
  -- långt senare, på en rad som ser orelaterad ut.
  insert into auth.users (id, email) values (gen_random_uuid(), 'sen@example.com')
  returning id into v_late;

  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_rest, v_owner, 'owner', true);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_id := public.invite_staff(v_rest, 'RATT@example.com', 'staff', v_token);

  -- Fel adress med rätt länk. Det här är fallet där länken läckt.
  perform set_config('request.jwt.claim.sub', v_wrong::text, true);
  begin
    perform public.accept_staff_invitation(v_token);
    raise exception 'FEL: en läckt länk gick att lösa in av fel person';
  exception
    when insufficient_privilege then null;
  end;

  -- Rätt adress. Versalerna i inbjudan ska inte spela roll.
  perform set_config('request.jwt.claim.sub', v_right::text, true);
  perform public.accept_staff_invitation(v_token);

  if not exists (
    select 1 from public.staff
    where restaurant_id = v_rest and user_id = v_right and role = 'staff' and is_active
  ) then
    raise exception 'FEL: anställningen skapades inte';
  end if;

  -- Samma länk en gång till.
  begin
    perform public.accept_staff_invitation(v_token);
    raise exception 'FEL: samma inbjudan gick att lösa in två gånger';
  exception
    when no_data_found then null;
  end;

  -- En utgången inbjudan.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_token := repeat('j', 43);
  v_id := public.invite_staff(v_rest, 'sen@example.com', 'kitchen', v_token);

  /*
   * Åldrandet görs som superuser.
   *
   * `staff_invitations` har ingen UPDATE-policy — raderna ändras bara av
   * funktionerna. Ett `update` som `authenticated` träffar därför noll rader
   * UTAN att klaga, och testet trodde att inbjudan gått ut när den fortfarande
   * var giltig. Att den vägrade är rätt beteende; det var uppsättningen som var
   * fel.
   */
  execute 'reset role';
  update public.staff_invitations set expires_at = now() - interval '1 day' where id = v_id;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claim.sub', v_late::text, true);

  begin
    perform public.accept_staff_invitation(v_token);
    raise exception 'FEL: en utgången inbjudan gick att lösa in';
  exception
    when no_data_found then null;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end
$$;

\echo '   den sista ägaren går varken att degradera eller stänga av'

do $$
declare
  v_rest    uuid;
  v_owner   uuid;
  v_second  uuid;
  v_manager uuid;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Sista Ägaren', 'sista-agaren', '4200000000122',
          'Ferhadija 30', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  insert into auth.users (id, email) values (gen_random_uuid(), 'ensam@example.com')
  returning id into v_owner;
  insert into auth.users (id, email) values (gen_random_uuid(), 'andra@example.com')
  returning id into v_second;
  insert into auth.users (id, email) values (gen_random_uuid(), 'chef-s@example.com')
  returning id into v_manager;

  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_rest, v_owner, 'owner', true),
         (v_rest, v_manager, 'manager', true);

  execute 'set local role authenticated';

  -- Chefen får inte röra en ägare alls.
  perform set_config('request.jwt.claim.sub', v_manager::text, true);
  begin
    perform public.set_staff_role(v_rest, v_owner, 'staff');
    raise exception 'FEL: chefen degraderade ägaren';
  exception
    when insufficient_privilege then null;
  end;

  -- Ägaren får inte heller — hen är den enda.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  begin
    perform public.set_staff_role(v_rest, v_owner, 'manager');
    raise exception 'FEL: den sista ägaren degraderade sig själv';
  exception
    when check_violation then null;
  end;

  begin
    perform public.set_staff_active(v_rest, v_owner, false);
    raise exception 'FEL: den sista ägaren stängde av sig själv';
  exception
    when check_violation then null;
  end;

  -- Med en andra ägare på plats går det.
  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_rest, v_second, 'owner', true);

  perform public.set_staff_active(v_rest, v_owner, false);

  if (select is_active from public.staff where restaurant_id = v_rest and user_id = v_owner) then
    raise exception 'FEL: anställningen avslutades inte';
  end if;

  -- Raden står kvar. Den är det som kopplar en kvitterad nota till en människa.
  if not exists (
    select 1 from public.staff where restaurant_id = v_rest and user_id = v_owner
  ) then
    raise exception 'FEL: anställningen raderades i stället för att avslutas';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end
$$;

\echo '   kocken sätter sitt eget språk, och ingenting annat'

do $$
declare
  v_rest    uuid;
  v_kitchen uuid;
  v_owner   uuid;
begin
  insert into public.restaurants (
    name, slug, org_number, street_address, postal_code, city, status, country, currency
  )
  values ('Kockens Språk', 'kockens-sprak', '4200000000123',
          'Ferhadija 31', '71000', 'Sarajevo', 'ACTIVE', 'BA', 'BAM')
  returning id into v_rest;

  insert into auth.users (id, email) values (gen_random_uuid(), 'kock-sprak@example.com')
  returning id into v_kitchen;
  insert into auth.users (id, email) values (gen_random_uuid(), 'agare-sprak@example.com')
  returning id into v_owner;

  insert into public.staff (restaurant_id, user_id, role, is_active)
  values (v_rest, v_owner, 'owner', true),
         (v_rest, v_kitchen, 'kitchen', true);

  -- Ingen har valt något ännu. NULL och inte 'sv' — appen ska kunna skilja
  -- "har inte valt" från "valde svenska", annars kan språket aldrig följa
  -- restaurangens land.
  if (select locale from public.staff where user_id = v_kitchen) is not null then
    raise exception 'FEL: språket fick ett default i schemat';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_kitchen::text, true);

  -- Kocken får sätta sitt eget språk trots att bara ägaren får skriva i staff.
  perform public.set_staff_locale('bs');

  if (select locale from public.staff where user_id = v_kitchen) is distinct from 'bs' then
    raise exception 'FEL: kocken kunde inte sätta sitt eget språk';
  end if;

  -- Ägarens rad rördes inte. Funktionen tar inget användar-id och kan därför
  -- inte fås att peka någon annanstans än på auth.uid().
  if (select locale from public.staff where user_id = v_owner) is not null then
    raise exception 'FEL: kocken satte språk på ägarens rad';
  end if;

  -- Det som ovanstående INTE fick kosta: en väg in i tabellen. Kocken ska
  -- fortfarande inte kunna röra sin egen roll. Utan den här kontrollen hade
  -- en policy "får uppdatera sin egen rad" sett ut att fungera lika bra —
  -- och den hade låtit kocken skriva role i samma andetag.
  update public.staff set role = 'owner' where user_id = v_kitchen;
  if (select role from public.staff where user_id = v_kitchen) = 'owner' then
    raise exception 'FEL: kocken befordrade sig själv';
  end if;

  -- Ett okänt språk faller på villkoret i stället för att skrivas tyst.
  begin
    perform public.set_staff_locale('kl');
    raise exception 'FEL: ett okänt språk accepterades';
  exception
    when check_violation then null;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end
$$;

rollback;
