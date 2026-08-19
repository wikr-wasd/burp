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

rollback;
