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
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    'agare@burp.test', crypt('burp1234', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test Ägare"}'::jsonb
  )
  on conflict (email) do nothing
  returning id into v_owner_id;

  if v_owner_id is null then
    select id into v_owner_id from auth.users where email = 'agare@burp.test';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    'kock@burp.test', crypt('burp1234', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test Kock"}'::jsonb
  )
  on conflict (email) do nothing
  returning id into v_kitchen_id;

  if v_kitchen_id is null then
    select id into v_kitchen_id from auth.users where email = 'kock@burp.test';
  end if;

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
