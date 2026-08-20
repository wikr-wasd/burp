-- 0046 — Vem får bjuda in vem, och hur en anställd faktiskt kommer in.
--
-- `staff` har funnits sedan 0002 med `invited_by` och allt, men det fanns ingen
-- väg att lägga till någon. Personal skapades bara av `seed-staff.sql` och av
-- `admin_create_restaurant`, vars egen kommentar säger "Ägaren knyts senare via
-- personalfliken" — en flik som inte existerade.
--
-- Följden är att en restaurang i praktiken har exakt de konton Burp skapade åt
-- den. Det går inte att anställa någon, och det går inte att ta bort någon som
-- slutat. Det senare är det allvarliga: en uppsagd servitör behåller åtkomst
-- till kassan tills någon kör SQL.
--
-- ── Hierarkin ───────────────────────────────────────────────────────────────
--
--   owner    bjuder in vem som helst, även en annan ägare
--   manager  bjuder in `staff` och `kitchen` — aldrig owner eller manager
--   staff    bjuder inte in någon
--   kitchen  bjuder inte in någon
--
-- Chefen kan alltså inte höja någon till sin egen nivå, och därmed inte heller
-- sig själv via en omväg. Regeln gäller lika för att ÄNDRA en roll som för att
-- bjuda in: annars vore den meningslös, eftersom en chef kunde bjuda in en
-- servitör och sedan göra hen till ägare.
--
-- ── Den sista ägaren ────────────────────────────────────────────────────────
--
-- En restaurang utan aktiv ägare är en restaurang ingen kan administrera —
-- menyn går inte att ändra, personal inte att lägga till, och avräkningen inte
-- att läsa. Den sista ägaren går därför varken att inaktivera eller degradera.
-- Vill man byta ägare bjuder man in den nya först.

create type public.invitation_status as enum ('PENDING', 'ACCEPTED', 'REVOKED');

create table public.staff_invitations (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  -- Adressen inbjudan gäller. Jämförs alltid i gemener: en inbjudan till
  -- Anna@exempel.se ska lösas in av anna@exempel.se.
  email          text not null,
  role           public.staff_role not null,

  /*
   * Länkens hemlighet, lagrad som hash.
   *
   * Till skillnad från presentkortets kod läses den här aldrig högt — den
   * klistras in ur ett mail. Då finns ingen anledning att spara den i klartext,
   * och en läckt databasdump ska inte innehålla giltiga inbjudningar till
   * varenda restaurang.
   *
   * `sha256()` och inte pgcrypto:s `digest()`. Den senare ligger i schemat
   * `extensions` hos Supabase men i `public` i verify-schema.sh, och en
   * funktion med `search_path = public` hade fungerat i testet och fallit i
   * produktion. `sha256` är inbyggd sedan PostgreSQL 11 och finns överallt.
   */
  token_hash     bytea not null,

  invited_by     uuid references auth.users(id) on delete set null,
  status         public.invitation_status not null default 'PENDING',

  expires_at     timestamptz not null,
  accepted_at    timestamptz,
  accepted_by    uuid references auth.users(id) on delete set null,

  created_at     timestamptz not null default now()
);

create unique index staff_invitations_token_key on public.staff_invitations (token_hash);

-- En öppen inbjudan per adress och restaurang. Två samtidiga till samma person
-- betyder att den ena länken tyst slutar gälla, och den som klickar på fel
-- undrar varför.
create unique index staff_invitations_open_key
  on public.staff_invitations (restaurant_id, lower(email))
  where status = 'PENDING';

create index staff_invitations_restaurant_idx
  on public.staff_invitations (restaurant_id, created_at desc);

alter table public.staff_invitations enable row level security;

-- Ägare och chef ser husets inbjudningar. Servitören gör det inte — vem som är
-- på väg in är en driftsfråga.
create policy staff_invitations_select_management on public.staff_invitations
  for select to authenticated
  using (
    public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

create policy staff_invitations_select_platform on public.staff_invitations
  for select to authenticated
  using (public.is_platform_admin());

-- Ingen INSERT-, UPDATE- eller DELETE-policy. Raderna skrivs av funktionerna
-- nedan, som kontrollerar hierarkin. En policy hade behövt uttrycka samma regel
-- en gång till i ett annat språk.

comment on table public.staff_invitations is
  'Öppna inbjudningar till en restaurangs personal. Länken bär en hemlighet som lagras som hash — den läses aldrig högt, till skillnad från presentkortets kod.';

-- ── Vem får bjuda in vem ────────────────────────────────────────────────────

create or replace function public.can_grant_role(
  p_granter public.staff_role,
  p_target  public.staff_role
)
returns boolean
language sql
immutable
as $$
  select case p_granter
    when 'owner'   then true
    -- Chefen kan inte höja någon till sin egen nivå, och därmed inte heller
    -- sig själv via en omväg.
    when 'manager' then p_target in ('staff', 'kitchen')
    else false
  end;
$$;

comment on function public.can_grant_role is
  'Hierarkin för att bjuda in och för att ändra roll. Samma regel för båda — annars kunde en chef bjuda in en servitör och sedan göra hen till ägare.';

/*
 * Rollen anroparen har hos restaurangen, eller null.
 *
 * Egen funktion därför att de fyra funktionerna nedan behöver den, och en
 * kopierad `select role from staff where ...` i var och en är fyra ställen att
 * glömma `is_active` på.
 */
create or replace function public.my_role_at(p_restaurant_id uuid)
returns public.staff_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.staff
  where restaurant_id = p_restaurant_id
    and user_id = auth.uid()
    and is_active;
$$;

revoke execute on function public.my_role_at(uuid) from public, anon;
grant execute on function public.my_role_at(uuid) to authenticated, service_role;

-- ── Bjuda in ────────────────────────────────────────────────────────────────

create or replace function public.invite_staff(
  p_restaurant_id uuid,
  p_email         text,
  p_role          public.staff_role,
  p_token         text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mine public.staff_role := public.my_role_at(p_restaurant_id);
  v_id   uuid;
begin
  if v_mine is null or not public.can_grant_role(v_mine, p_role) then
    raise exception 'Du får inte bjuda in någon som %', p_role
      using errcode = 'insufficient_privilege';
  end if;

  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'En inbjudan behöver en e-postadress' using errcode = 'check_violation';
  end if;

  if p_token is null or length(p_token) < 32 then
    raise exception 'Inbjudningslänken är för kort för att vara hemlig'
      using errcode = 'check_violation';
  end if;

  -- Redan anställd? Då är det en rolländring och inte en inbjudan.
  if exists (
    select 1 from public.staff s
    join auth.users u on u.id = s.user_id
    where s.restaurant_id = p_restaurant_id
      and lower(u.email) = lower(btrim(p_email))
      and s.is_active
  ) then
    raise exception 'Personen arbetar redan här' using errcode = 'unique_violation';
  end if;

  insert into public.staff_invitations (
    restaurant_id, email, role, token_hash, invited_by, expires_at
  )
  values (
    p_restaurant_id, lower(btrim(p_email)), p_role,
    sha256(convert_to(p_token, 'UTF8')), auth.uid(),
    -- En vecka. Längre gör en glömd länk till en permanent bakdörr; kortare
    -- hinner inte över en semester.
    now() + interval '7 days'
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.invite_staff(uuid, text, public.staff_role, text)
  from public, anon;
grant execute on function public.invite_staff(uuid, text, public.staff_role, text)
  to authenticated, service_role;

-- ── Lösa in ─────────────────────────────────────────────────────────────────

create or replace function public.accept_staff_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.staff_invitations%rowtype;
  v_email      text;
begin
  if auth.uid() is null then
    raise exception 'Logga in först' using errcode = 'insufficient_privilege';
  end if;

  select * into v_invitation
  from public.staff_invitations
  where token_hash = sha256(convert_to(p_token, 'UTF8'))
  for update;

  -- Okänd, använd och återkallad ger samma svar. En länk som säger "den här
  -- inbjudan är förbrukad" bekräftar att den funnits.
  if not found or v_invitation.status <> 'PENDING' then
    raise exception 'Inbjudan gäller inte längre' using errcode = 'no_data_found';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'Inbjudan har gått ut' using errcode = 'no_data_found';
  end if;

  select lower(email) into v_email from auth.users where id = auth.uid();

  /*
   * Adressen måste stämma.
   *
   * Utan kontrollen räcker det att länken läcker — vidarebefordrad i ett mail,
   * kvar i en webbläsarhistorik — för att vem som helst ska kunna ta sig in i
   * restaurangens kassa. Med den är länken värdelös för alla utom den den
   * skickades till.
   */
  if v_email is distinct from v_invitation.email then
    raise exception 'Inbjudan gäller en annan e-postadress'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.staff (restaurant_id, user_id, role, is_active, invited_by)
  values (v_invitation.restaurant_id, auth.uid(), v_invitation.role, true, v_invitation.invited_by)
  on conflict (restaurant_id, user_id) do update
    set role = excluded.role, is_active = true;

  update public.staff_invitations
  set status = 'ACCEPTED', accepted_at = now(), accepted_by = auth.uid()
  where id = v_invitation.id;

  return v_invitation.restaurant_id;
end;
$$;

revoke execute on function public.accept_staff_invitation(text) from public, anon;
grant execute on function public.accept_staff_invitation(text) to authenticated, service_role;

create or replace function public.revoke_staff_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.staff_invitations%rowtype;
  v_mine       public.staff_role;
begin
  select * into v_invitation from public.staff_invitations where id = p_invitation_id;
  if not found then
    raise exception 'Okänd inbjudan' using errcode = 'no_data_found';
  end if;

  v_mine := public.my_role_at(v_invitation.restaurant_id);

  if v_mine is null or not public.can_grant_role(v_mine, v_invitation.role) then
    raise exception 'Du får inte återkalla den här inbjudan'
      using errcode = 'insufficient_privilege';
  end if;

  update public.staff_invitations
  set status = 'REVOKED'
  where id = p_invitation_id and status = 'PENDING';
end;
$$;

revoke execute on function public.revoke_staff_invitation(uuid) from public, anon;
grant execute on function public.revoke_staff_invitation(uuid) to authenticated, service_role;

-- ── Ändra och avsluta ───────────────────────────────────────────────────────

create or replace function public.set_staff_role(
  p_restaurant_id uuid,
  p_user_id       uuid,
  p_role          public.staff_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mine    public.staff_role := public.my_role_at(p_restaurant_id);
  v_current public.staff_role;
begin
  select role into v_current
  from public.staff
  where restaurant_id = p_restaurant_id and user_id = p_user_id;

  if v_current is null then
    raise exception 'Personen arbetar inte här' using errcode = 'no_data_found';
  end if;

  -- Både den nuvarande och den nya rollen måste ligga inom räckhåll. Annars
  -- kunde en chef degradera en ägare och sedan bjuda in sig själv som ägare.
  if v_mine is null
     or not public.can_grant_role(v_mine, v_current)
     or not public.can_grant_role(v_mine, p_role) then
    raise exception 'Du får inte ändra den rollen' using errcode = 'insufficient_privilege';
  end if;

  if v_current = 'owner' and p_role <> 'owner' then
    perform public.assert_not_last_owner(p_restaurant_id, p_user_id);
  end if;

  update public.staff set role = p_role
  where restaurant_id = p_restaurant_id and user_id = p_user_id;
end;
$$;

create or replace function public.set_staff_active(
  p_restaurant_id uuid,
  p_user_id       uuid,
  p_active        boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mine    public.staff_role := public.my_role_at(p_restaurant_id);
  v_current public.staff_role;
begin
  select role into v_current
  from public.staff
  where restaurant_id = p_restaurant_id and user_id = p_user_id;

  if v_current is null then
    raise exception 'Personen arbetar inte här' using errcode = 'no_data_found';
  end if;

  if v_mine is null or not public.can_grant_role(v_mine, v_current) then
    raise exception 'Du får inte ändra den anställningen'
      using errcode = 'insufficient_privilege';
  end if;

  if not p_active and v_current = 'owner' then
    perform public.assert_not_last_owner(p_restaurant_id, p_user_id);
  end if;

  /*
   * Anställningen avslutas, den raderas inte.
   *
   * Raden är det som kopplar en kvitterad nota till en människa. Försvinner
   * den går `refunds.created_by` och `order_events.actor_id` fortfarande att
   * följa, men inte till någon som syns i personallistan — och
   * händelseloggen tappar sitt svar på "vem".
   */
  update public.staff set is_active = p_active
  where restaurant_id = p_restaurant_id and user_id = p_user_id;
end;
$$;

/*
 * Den sista ägaren går inte att ta bort.
 *
 * En restaurang utan aktiv ägare kan ingen administrera: menyn går inte att
 * ändra, personal inte att lägga till, avräkningen inte att läsa. Felet skulle
 * dessutom upptäckas av någon som just förlorat sin åtkomst och därför inte kan
 * rätta det själv.
 */
create or replace function public.assert_not_last_owner(
  p_restaurant_id uuid,
  p_user_id       uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.staff
    where restaurant_id = p_restaurant_id
      and role = 'owner'
      and is_active
      and user_id <> p_user_id
  ) then
    raise exception 'Restaurangen måste ha minst en ägare. Bjud in en ny först.'
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke execute on function public.set_staff_role(uuid, uuid, public.staff_role)
  from public, anon;
revoke execute on function public.set_staff_active(uuid, uuid, boolean) from public, anon;
revoke execute on function public.assert_not_last_owner(uuid, uuid) from public, anon;

grant execute on function public.set_staff_role(uuid, uuid, public.staff_role)
  to authenticated, service_role;
grant execute on function public.set_staff_active(uuid, uuid, boolean)
  to authenticated, service_role;
grant execute on function public.assert_not_last_owner(uuid, uuid)
  to authenticated, service_role;

-- ── Personallistan ──────────────────────────────────────────────────────────
--
-- Samma skäl som händelseloggen i 0045: namnet ligger i `profiles`, som bara
-- går att läsa om sig själv. Funktionen är SECURITY DEFINER och kontrollerar
-- rollen själv.

create or replace function public.restaurant_staff(p_restaurant_id uuid)
returns table (
  user_id   uuid,
  email     text,
  full_name text,
  role      public.staff_role,
  is_active boolean,
  is_me     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.my_role_at(p_restaurant_id) is null and not public.is_platform_admin() then
    raise exception 'Du arbetar inte här' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    s.user_id,
    u.email::text,
    pr.full_name,
    s.role,
    s.is_active,
    s.user_id = auth.uid()
  from public.staff s
  join auth.users u on u.id = s.user_id
  left join public.profiles pr on pr.id = s.user_id
  where s.restaurant_id = p_restaurant_id
  order by s.is_active desc, s.role, u.email;
end;
$$;

revoke execute on function public.restaurant_staff(uuid) from public, anon;
grant execute on function public.restaurant_staff(uuid) to authenticated, service_role;

comment on function public.restaurant_staff is
  'Restaurangens personal med namn och e-post. SECURITY DEFINER därför att profiles bara går att läsa om sig själv — rollkontrollen sker i funktionen.';
