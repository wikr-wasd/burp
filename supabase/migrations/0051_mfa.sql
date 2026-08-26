-- 0051 — Tvåstegsverifiering, och varför den måste stå i databasen.
--
-- Inloggningen har varit e-post och lösenord. Ett lösenord som läcker ger
-- full tillgång till menyn, priserna, personallistan, orderhistoriken och
-- avräkningen — alltså till restaurangens pengar och till dess gästers
-- uppgifter. Andra faktorn är det billigaste skyddet som finns mot det.
--
-- ── Varför TOTP och inte SMS ────────────────────────────────────────────────
--
-- SMS-koder faller för SIM-swap, kräver ett avtal med en SMS-leverantör och
-- kostar per meddelande i BA och RS. TOTP — Google Authenticator och alla
-- andra — är gratis, starkare, och stöds direkt av Supabase Auth. Ingen
-- kolumn här bär något SMS-spår, med flit.
--
-- ── Varför i RLS och inte bara i gränssnittet ───────────────────────────────
--
-- En kontroll i proxy:n eller i `requireStaff()` gäller den som går genom
-- appen. Den som har lösenordet har också en access-token, och med den går
-- PostgREST att anropa direkt. Då är en spärr i React ingen spärr alls.
--
-- Grinden läggs därför i de fyra funktioner som varje personal- och
-- plattformspolicy redan bygger på. Ett ställe, inte trettio policyer — och
-- den dagen en ny policy skrivs ärver den kravet utan att någon minns det.
--
-- ── NULL-fallet: den som inte registrerat någon faktor ──────────────────────
--
-- Kravet gäller den som HAR en verifierad faktor. Det är inte en eftergift
-- utan det enda som fungerar under införandet: en obligatorisk andra faktor
-- från och med den här migrationen hade låst ute varenda befintlig anställd
-- samtidigt, inklusive seed-personalen som röktestet loggar in som.
--
-- Att göra den obligatorisk är ett beslut för den dag alla ägare registrerat
-- sig, och då är ändringen en rad här — inte ett nytt system.

-- ── Är kravet uppfyllt? ─────────────────────────────────────────────────────
--
-- SECURITY DEFINER av samma skäl som `is_staff_of`: `auth.mfa_factors` är inte
-- läsbar för `authenticated` och ska inte vara det.
--
-- STABLE så att Postgres anropar den en gång per fråga och inte en gång per
-- rad. Den ligger i den varmaste kodvägen som finns i schemat.

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1
      from auth.mfa_factors
      where user_id = auth.uid()
        and status = 'verified'
    );
$$;

comment on function public.mfa_satisfied is
  'Sann när sessionen nått aal2, eller när användaren inte har någon verifierad andra faktor. Grinden bakom is_staff_of, has_role_at, is_platform_admin och has_platform_role — en spärr enbart i appen kringgås genom att anropa PostgREST direkt.';

-- RLS utan GRANT är verkningslös, och det gäller funktioner lika mycket som
-- tabeller: utan EXECUTE svarar PostgREST 404. Migration 0012 finns för att
-- det felet redan begåtts en gång.
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

-- ── De fyra grindarna ───────────────────────────────────────────────────────
--
-- Funktionerna är oförändrade så när som på ett `and`. De skrivs om i sin
-- helhet i stället för att lindas in i en ny funktion, därför att en wrapper
-- hade lämnat originalet kvar och anropbart — och den dagen någon råkar
-- använda originalet är kravet borta utan att något ser fel ut.
--
-- Grinden gäller LÄSNING lika mycket som skrivning. Poängen med andra faktorn
-- är att ett stulet lösenord inte ska visa gästernas uppgifter eller
-- restaurangens omsättning; en spärr som bara stoppar skrivningar hade
-- skyddat fel sak.

create or replace function public.is_staff_of(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mfa_satisfied() and exists (
    select 1 from public.staff
    where restaurant_id = p_restaurant_id
      and user_id = auth.uid()
      and is_active
  );
$$;

create or replace function public.has_role_at(p_restaurant_id uuid, p_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mfa_satisfied() and exists (
    select 1 from public.staff
    where restaurant_id = p_restaurant_id
      and user_id = auth.uid()
      and is_active
      and role = any(p_roles)
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mfa_satisfied() and exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

create or replace function public.has_platform_role(p_roles public.platform_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mfa_satisfied() and exists (
    select 1 from public.platform_admins
    where user_id = auth.uid()
      and role = any(p_roles)
  );
$$;

-- ── Loggen över säkerhetsåtgärder ───────────────────────────────────────────
--
-- Supabase har inga reservkoder. Den som byter telefon utan att först
-- registrera den nya låser ut sig, och någon hos Burp måste kunna ta bort
-- faktorn. Det är en åtgärd som ger tillbaka full åtkomst till en restaurang,
-- och den får aldrig gå att göra spårlöst.
--
-- Oföränderlig av samma skäl som `order_events` och `loyalty_transactions`
-- (regel 6): en logg som går att rätta i efterhand är ingen logg.

create table public.security_events (
  id          uuid primary key default gen_random_uuid(),
  -- Vem åtgärden gällde.
  user_id     uuid references auth.users(id) on delete set null,
  -- Vem som utförde den. NULL bara om kontot senare raderats.
  actor_id    uuid references auth.users(id) on delete set null,
  kind        text not null check (kind in ('MFA_FACTOR_RESET')),
  note        text,
  created_at  timestamptz not null default now()
);

create index security_events_user_idx on public.security_events (user_id, created_at desc);

comment on table public.security_events is
  'Oföränderlig logg över säkerhetsåtgärder som en människa hos Burp utfört åt någon annan. Skrivs bara av service role; UPDATE och DELETE är blockerade av trigger.';

alter table public.security_events enable row level security;

-- Läsning: plattformsadmin. Ingen skrivpolicy alls — raden skrivs av service
-- role, som kringgår RLS ändå, och en INSERT-policy hade bara antytt att
-- någon annan får skriva här.
create policy security_events_select_platform on public.security_events
  for select to authenticated using (public.is_platform_admin());

-- Ny tabell = ny policy OCH grant. Policyn utan grant hade varit verkningslös.
grant select on public.security_events to authenticated;
grant select, insert on public.security_events to service_role;

create or replace function public.block_security_event_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'security_events är oföränderlig';
end;
$$;

create trigger security_events_immutable
  before update or delete on public.security_events
  for each row execute function public.block_security_event_change();
