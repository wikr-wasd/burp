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
        'name_snapshot', 'Margherita',
        'unit_price_ore', 12900,
        'vat_rate_bps', 1200,
        'quantity', 1,
        'line_gross_ore', 14400,
        'note', 'utan basilika',
        'options', jsonb_build_array(
          jsonb_build_object('option_id', null, 'name_snapshot', 'Extra ost', 'price_ore', 1500)
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
  v_snitt    numeric;
  v_antal    integer;
begin
  insert into public.orders (restaurant_id, type, status, idempotency_key, total_ore)
  values (v_rest_id, 'PICKUP', 'DRAFT', gen_random_uuid(), 12900)
  returning id into v_order_id;

  update public.orders set status = 'PLACED' where id = v_order_id;

  -- Ordern är inte klar än — betyget ska avvisas.
  begin
    insert into public.reviews (order_id, restaurant_id, rating_food) values (v_order_id, v_rest_id, 5);
    raise exception 'FEL: betyg gick att lämna på en order som inte var genomförd';
  exception
    when check_violation then null;
  end;

  update public.orders set status = 'ACCEPTED'  where id = v_order_id;
  update public.orders set status = 'PREPARING' where id = v_order_id;
  update public.orders set status = 'READY'     where id = v_order_id;
  update public.orders set status = 'COMPLETED' where id = v_order_id;

  insert into public.reviews (order_id, restaurant_id, rating_food) values (v_order_id, v_rest_id, 4);

  -- Snittbetyget ska ha cachats på restaurangen av triggern.
  select rating_average, rating_count into v_snitt, v_antal
  from public.restaurants where id = v_rest_id;

  if v_antal <> 1 or v_snitt <> 4.0 then
    raise exception 'FEL: snittbetyget blev % över % omdömen, förväntade 4.0 över 1', v_snitt, v_antal;
  end if;

  -- Ett betyg per order.
  begin
    insert into public.reviews (order_id, restaurant_id, rating_food) values (v_order_id, v_rest_id, 1);
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
  -- Seed-restaurangen har lunch 11–14 på tisdagar. 2026-08-11 är en tisdag.
  if not public.is_restaurant_open(v_rest_id, '2026-08-11 12:00:00+02'::timestamptz) then
    raise exception 'FEL: restaurangen räknades som stängd mitt i lunchen';
  end if;

  if public.is_restaurant_open(v_rest_id, '2026-08-11 15:00:00+02'::timestamptz) then
    raise exception 'FEL: restaurangen räknades som öppen mellan lunch och kväll';
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

  if v_slug <> 'malmo' then
    raise exception 'FEL: city_slug blev "%" i stället för "malmo"', v_slug;
  end if;
end
$$;

\echo '   lojalitetsloggen är oföränderlig'

do $$
declare
  v_account_id uuid;
  v_user_id    uuid;
begin
  insert into auth.users (email) values ('test@example.com') returning id into v_user_id;

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
  insert into auth.users (email, raw_user_meta_data)
  values ('ny@example.com', '{"full_name": "Ny Gäst"}'::jsonb)
  returning id into v_user_id;

  if not exists (
    select 1 from public.profiles where id = v_user_id and full_name = 'Ny Gäst'
  ) then
    raise exception 'FEL: profilen skapades inte när kontot registrerades';
  end if;
end
$$;

rollback;
