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

  -- Kopplingen till restaurangen. Det är den här raden RLS frågar efter.
  insert into public.staff (restaurant_id, user_id, role)
  values (v_restaurant_id, v_owner_id, 'owner')
  on conflict (restaurant_id, user_id) do update set role = excluded.role;

  insert into public.staff (restaurant_id, user_id, role)
  values (v_restaurant_id, v_kitchen_id, 'kitchen')
  on conflict (restaurant_id, user_id) do update set role = excluded.role;

  raise notice 'Testkonton klara:';
  raise notice '  agare@burp.test / burp1234  → /dashboard (ägare, ser allt)';
  raise notice '  kock@burp.test  / burp1234  → /kok (kock, bara köksskärmen)';
end
$$;
