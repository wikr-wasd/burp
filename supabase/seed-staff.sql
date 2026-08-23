-- Testkonton för personalytorna. KÖRS INTE AUTOMATISKT.
--
-- Ligger separat från seed.sql därför att den här filen skriver i `auth`-schemat,
-- som bara finns i Supabase. seed.sql ska förbli portabel så att
-- scripts/verify-schema.sh kan köra den mot en vanlig PostgreSQL.
--
-- Kör efter `supabase db reset`:
--
--     psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/seed-staff.sql
--
-- eller klistra in i Supabase Studio → SQL Editor.
--
-- ⚠️ KÖR ALDRIG MOT PRODUKTION. Lösenorden nedan står i klartext i ett
-- publikt repo och kontona är avsiktligt enkla att gissa.

do $$
declare
  v_restaurant_id uuid := '11111111-1111-1111-1111-111111111111';
  v_owner_id      uuid;
  v_kitchen_id    uuid;
  v_platform_id   uuid;
begin
  if not exists (select 1 from public.restaurants where id = v_restaurant_id) then
    raise exception 'Kör supabase/seed.sql först — restaurangen saknas.';
  end if;

  -- Supabase Auth lagrar lösenord som bcrypt i auth.users.encrypted_password.
  -- `crypt(..., gen_salt('bf'))` ger samma format som Auth själv skriver.
  --
  -- Notera: ingen ON CONFLICT (email) här. auth.users har inget vanligt
  -- unique-constraint på email utan ett *partiellt* unikt index
  -- (`where is_sso_user = false`), och ett partiellt index kan inte backa en
  -- ON CONFLICT-specifikation. Vi slår upp först och infogar bara om raden
  -- saknas — samma idempotens, utan att förlita sig på ett constraint som
  -- inte finns.
  select id into v_owner_id from auth.users where email = 'agare@burp.test';
  if v_owner_id is null then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      -- Utan default och nullbara i schemat, men GoTrue läser dem som vanliga
      -- strängar. Lämnas de NULL svarar Auth 500 "Database error querying
      -- schema" på varje inloggningsförsök.
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'agare@burp.test', crypt('burp1234', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Test Ägare"}'::jsonb,
      '', '', '', ''
    )
    returning id into v_owner_id;
  end if;

  select id into v_kitchen_id from auth.users where email = 'kock@burp.test';
  if v_kitchen_id is null then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      -- Utan default och nullbara i schemat, men GoTrue läser dem som vanliga
      -- strängar. Lämnas de NULL svarar Auth 500 "Database error querying
      -- schema" på varje inloggningsförsök.
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'kock@burp.test', crypt('burp1234', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Test Kock"}'::jsonb,
      '', '', '', ''
    )
    returning id into v_kitchen_id;
  end if;

  -- Konton som skapats av en tidigare version av den här filen har NULL i
  -- token-kolumnerna och kan inte logga in. Städa dem i efterhand.
  update auth.users
  set confirmation_token      = coalesce(confirmation_token, ''),
      recovery_token          = coalesce(recovery_token, ''),
      email_change_token_new  = coalesce(email_change_token_new, ''),
      email_change            = coalesce(email_change, '')
  where id in (v_owner_id, v_kitchen_id);

  -- GoTrue vill ha en identitetsrad per inloggningsmetod. Utan den kan
  -- lösenordsinloggning nekas, och användarobjektet saknar sina identiteter.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  select
    u.id::text, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
    'email', now(), now(), now()
  from auth.users u
  where u.email in ('agare@burp.test', 'kock@burp.test')
    and not exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'email'
    );

  -- Burps egen backoffice. Ligger i platform_admins, inte i staff — en
  -- plattformsadmin ska inte synas i någon restaurangs personallista.
  select id into v_platform_id from auth.users where email = 'burp@burp.test';
  if v_platform_id is null then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'burp@burp.test', crypt('burp1234', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Burp Backoffice"}'::jsonb,
      '', '', '', ''
    )
    returning id into v_platform_id;
  end if;

  update auth.users
  set confirmation_token      = coalesce(confirmation_token, ''),
      recovery_token          = coalesce(recovery_token, ''),
      email_change_token_new  = coalesce(email_change_token_new, ''),
      email_change            = coalesce(email_change, '')
  where id = v_platform_id;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  select
    u.id::text, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
    'email', now(), now(), now()
  from auth.users u
  where u.id = v_platform_id
    and not exists (
      select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
    );

  insert into public.platform_admins (user_id, role, note)
  values (v_platform_id, 'owner', 'Testkonto för lokal utveckling')
  on conflict (user_id) do update set role = excluded.role;

  -- Kopplingen till restaurangen. Det är den här raden RLS frågar efter.
  insert into public.staff (restaurant_id, user_id, role)
  values (v_restaurant_id, v_owner_id, 'owner')
  on conflict (restaurant_id, user_id) do update set role = excluded.role;

  insert into public.staff (restaurant_id, user_id, role)
  values (v_restaurant_id, v_kitchen_id, 'kitchen')
  on conflict (restaurant_id, user_id) do update set role = excluded.role;

  raise notice 'Testkonton klara — alla med lösenordet burp1234:';
  raise notice '  agare@burp.test    → /dashboard (ägare, ser allt)';
  raise notice '  kock@burp.test     → /kok (kock, bara köksskärmen)';
  raise notice '  burp@burp.test     → /backoffice (Burps egen personal)';
end
$$;

/*
 * ── Resten av rollerna ─────────────────────────────────────────────────────
 *
 * Tillagt 2026-08-23. Fram till dess fanns tre konton: ägare, kock och Burps
 * egen personal. Det gick alltså inte att prova
 *
 *   - vad en CHEF ser som en ägare inte ser, eller tvärtom,
 *   - vad en SERVITÖR är utestängd från,
 *   - eller gästens sidor över huvud taget — det fanns ingen gäst.
 *
 * Hjälpfunktionen finns för att de tre första kontona skrevs som varsitt
 * trettiorads-block, och tre till hade gjort filen dubbelt så lång utan att
 * säga något nytt. Den behåller samma försiktighet: ingen ON CONFLICT på
 * e-post, eftersom auth.users har ett PARTIELLT unikt index som inte kan backa
 * en ON CONFLICT-specifikation.
 */

create or replace function pg_temp.seed_user(p_email text) returns uuid as $seed$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, crypt('burp1234', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
  );

  -- Utan identiteten vägrar GoTrue lösenordsinloggning. Raden i auth.users
  -- räcker inte, och felet syns först vid ett riktigt inloggningsförsök.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  return v_id;
end;
$seed$ language plpgsql;

do $$
declare
  v_restaurant_id uuid := '11111111-1111-1111-1111-111111111111';
  v_manager_id    uuid;
  v_waiter_id     uuid;
  v_guest_id      uuid;
  v_account_id    uuid;
  v_order_id      uuid;
  v_currency      public.currency_code;
begin
  select currency into v_currency from public.restaurants where id = v_restaurant_id;

  v_manager_id := pg_temp.seed_user('chef@burp.test');
  v_waiter_id  := pg_temp.seed_user('servitor@burp.test');
  v_guest_id   := pg_temp.seed_user('gast@burp.test');

  insert into public.staff (restaurant_id, user_id, role)
  values (v_restaurant_id, v_manager_id, 'manager')
  on conflict (restaurant_id, user_id) do update set role = excluded.role;

  insert into public.staff (restaurant_id, user_id, role)
  values (v_restaurant_id, v_waiter_id, 'staff')
  on conflict (restaurant_id, user_id) do update set role = excluded.role;

  /*
   * Gästen får INGEN staff-rad och ingen platform_admins-rad.
   *
   * Det är hela poängen med kontot: det ska bevisa att en vanlig kund kommer
   * in, hamnar på /konto och blir utkastad från /dashboard, /kok och
   * /backoffice. Ett testkonto som råkar vara personal provar inget av det.
   */

  -- ── Gästens innehåll ──────────────────────────────────────────────────────
  --
  -- Ett konto utan historik är ett skal: /konto visar "inga beställningar",
  -- poängrutan uteblir, favoriterna är tomma och adressboken likaså. Då går
  -- ingen av de fyra sidorna att bedöma. Det som läggs in nedan är minsta
  -- möjliga för att var och en ska visa något.

  insert into public.favorites (user_id, restaurant_id)
  values (v_guest_id, v_restaurant_id)
  on conflict do nothing;

  insert into public.addresses (user_id, label, street_address, postal_code, city, is_default)
  select v_guest_id, 'Hem', 'Ferhadija 12', '71000', 'Sarajevo', true
  where not exists (select 1 from public.addresses where user_id = v_guest_id);

  -- Poängkontot är Burps globala, alltså utan restaurang. `getLoyalty()` letar
  -- på `restaurant_id is null` och hittar ingenting annat.
  select id into v_account_id
  from public.loyalty_accounts
  where user_id = v_guest_id and restaurant_id is null;

  if v_account_id is null then
    insert into public.loyalty_accounts (user_id, restaurant_id)
    values (v_guest_id, null)
    returning id into v_account_id;

    -- Två rader och inte en: saldot RÄKNAS ur loggen (regel 7), och en enda
    -- rad hade inte visat att summeringen fungerar. Den ena går ut om tre
    -- veckor, så att varningen om poäng som snart försvinner också syns.
    insert into public.loyalty_transactions (account_id, kind, points, description, expires_at)
    values
      (v_account_id, 'EARN', 240, 'Tidigare beställningar', now() + interval '11 months'),
      (v_account_id, 'EARN',  60, 'Ćevapi på Baščaršija',   now() + interval '21 days');
  end if;

  -- En avslutad order, så att historiken och omdömesknappen har något att visa.
  if not exists (select 1 from public.orders where guest_id = v_guest_id) then
    insert into public.orders (
      restaurant_id, guest_id, type, status, currency, idempotency_key,
      items_gross_ore, total_ore, placed_at, completed_at, guest_locale
    )
    values (
      v_restaurant_id, v_guest_id, 'PICKUP', 'COMPLETED', v_currency, gen_random_uuid(),
      1850, 1850, now() - interval '3 days', now() - interval '3 days' + interval '25 minutes',
      'bs'
    )
    returning id into v_order_id;

    -- Orderraden. Utan den står kvittot utan innehåll, och historiken visar en
    -- summa utan att säga vad som köptes.
    insert into public.order_items (order_id, restaurant_id, menu_item_id, name_snapshot, unit_price_ore, vat_rate_bps, quantity, line_gross_ore)
    select v_order_id, v_restaurant_id, mi.id, mi.name, 1850, mi.vat_rate_bps, 1, 1850
    from public.menu_items mi
    join public.menu_categories mc on mc.id = mi.category_id
    join public.menus m on m.id = mc.menu_id
    where m.restaurant_id = v_restaurant_id
    order by mi.name
    limit 1;
  end if;

  raise notice '  chef@burp.test     / burp1234  → /dashboard (chef)';
  raise notice '  servitor@burp.test / burp1234  → /dashboard (servitör, ser minst)';
  raise notice '  gast@burp.test     / burp1234  → /konto (kund — ingen personalyta alls)';
end
$$;
