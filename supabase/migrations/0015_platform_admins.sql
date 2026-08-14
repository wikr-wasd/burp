-- 0015 — Plattformsroll för Burps egen backoffice (avsnitt 1, punkt 3).
--
-- Fram till nu binder `staff` en användare till EN restaurang, och hela
-- RLS-modellen bygger på det. Burps egen personal — den som godkänner nya
-- restauranger, sätter avgifter och hanterar utbetalningar — fanns inte i
-- modellen alls.
--
-- Frestelsen är att lägga Burp-personalen i `staff` på varje restaurang. Det
-- vore fel av två skäl: listan måste då uppdateras varje gång en restaurang
-- ansluter, och en Burp-anställd skulle synas som personal i restaurangens
-- egen personallista.
--
-- I stället ett eget begrepp med egna policies som läggs VID SIDAN AV de
-- befintliga. RLS-policies är additiva (OR), så restaurangernas egna regler
-- är oförändrade — plattformsadmin får en egen väg in, inte en bredare.

create type public.platform_role as enum (
  'support',   -- läser order och restauranger för att hjälpa till
  'admin',     -- godkänner restauranger, sätter avgifter, modererar media
  'owner'      -- allt, inklusive att utse andra plattformsadmins
);

create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        public.platform_role not null default 'support',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger platform_admins_touch before update on public.platform_admins
  for each row execute function public.touch_updated_at();

comment on table public.platform_admins is
  'Burps egen personal. Skild från public.staff, som binder någon till en enskild restaurang. En rad här ger åtkomst över hela plattformen.';

-- ── Hjälpfunktioner ─────────────────────────────────────────────────────────
--
-- Samma mönster som is_staff_of(): SECURITY DEFINER för att undvika rekursion
-- när en policy på platform_admins själv behöver fråga platform_admins, och
-- STABLE så att Postgres kan anropa den en gång per query i stället för en
-- gång per rad.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and role = any(p_roles)
  );
$$;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.has_platform_role(public.platform_role[]) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_platform_role(public.platform_role[]) to authenticated;

-- ── Policies på tabellen själv ──────────────────────────────────────────────

alter table public.platform_admins enable row level security;

-- Var och en ser sin egen rad, plattformsadmin ser alla. Utan den första delen
-- kan gränssnittet inte ens visa vem du är utan att först veta att du får det.
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- Bara plattformsägaren utser nya. En admin som kunde det skulle kunna
-- befordra sig själv till owner.
create policy platform_admins_write_owner on public.platform_admins
  for all to authenticated
  using (public.has_platform_role(array['owner']::public.platform_role[]))
  with check (public.has_platform_role(array['owner']::public.platform_role[]));

-- ── Åtkomst över plattformen ────────────────────────────────────────────────
--
-- Additiva policies. Restaurangernas egna regler rörs inte; det här är en
-- parallell väg in för Burps personal.

-- Restauranger: backoffice måste se även PENDING och SUSPENDED, som den
-- publika policyn döljer.
create policy restaurants_select_platform on public.restaurants
  for select to authenticated using (public.is_platform_admin());

-- Godkännande och avgiftsavtal. Support får läsa men inte ändra.
create policy restaurants_update_platform on public.restaurants
  for update to authenticated
  using (public.has_platform_role(array['admin', 'owner']::public.platform_role[]))
  with check (public.has_platform_role(array['admin', 'owner']::public.platform_role[]));

create policy restaurants_insert_platform on public.restaurants
  for insert to authenticated
  with check (public.has_platform_role(array['admin', 'owner']::public.platform_role[]));

create policy staff_select_platform on public.staff
  for select to authenticated using (public.is_platform_admin());

-- Order och pengar: LÄSNING bara. Burp ska kunna svara på "vad hände med min
-- beställning" utan att kunna ändra en restaurangs order eller avgifter i
-- efterhand. Rättelser sker genom en ny rad, aldrig genom att skriva om en gammal.
create policy orders_select_platform on public.orders
  for select to authenticated using (public.is_platform_admin());

create policy order_items_select_platform on public.order_items
  for select to authenticated using (public.is_platform_admin());

create policy order_events_select_platform on public.order_events
  for select to authenticated using (public.is_platform_admin());

create policy fees_select_platform on public.fees
  for select to authenticated using (public.is_platform_admin());

create policy payments_select_platform on public.payments
  for select to authenticated using (public.is_platform_admin());

create policy tips_select_platform on public.tips
  for select to authenticated using (public.is_platform_admin());

create policy payouts_select_platform on public.payouts
  for select to authenticated using (public.is_platform_admin());

-- Media: moderering är uttryckligen Burps ansvar (avsnitt 8.3). Här krävs
-- alltså skrivrätt, till skillnad från order och pengar.
create policy media_select_platform on public.media
  for select to authenticated using (public.is_platform_admin());

create policy media_moderate_platform on public.media
  for update to authenticated
  using (public.has_platform_role(array['admin', 'owner']::public.platform_role[]))
  with check (public.has_platform_role(array['admin', 'owner']::public.platform_role[]));

-- Menyer läses för att kunna felsöka en beställning och för att granska
-- innehåll. Ingen skrivrätt — menyn är restaurangens.
create policy menus_select_platform on public.menus
  for select to authenticated using (public.is_platform_admin());

create policy menu_items_select_platform on public.menu_items
  for select to authenticated using (public.is_platform_admin());

create policy reviews_select_platform on public.reviews
  for select to authenticated using (public.is_platform_admin());

-- Betyg under en tröskel ska larma supporten (avsnitt 7), och supporten måste
-- kunna dölja en recension som bryter mot reglerna.
create policy reviews_moderate_platform on public.reviews
  for update to authenticated
  using (public.has_platform_role(array['admin', 'owner']::public.platform_role[]))
  with check (public.has_platform_role(array['admin', 'owner']::public.platform_role[]));

grant select, insert, update, delete on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;

-- ── Plattformsöversikt ──────────────────────────────────────────────────────
--
-- Burps egen siffra: hur mycket som omsätts över plattformen och vad Burp
-- tjänar på det. SECURITY INVOKER som all annan statistik, så RLS avgör vad
-- som räknas — en restaurangägare som anropar den ser bara sin egen omsättning,
-- vilket är ofarligt och inte värt en extra spärr.

create or replace function public.platform_summary(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  restaurants_total    bigint,
  restaurants_active   bigint,
  restaurants_pending  bigint,
  orders_count         bigint,
  gmv_ore              bigint,
  burp_revenue_ore     bigint,
  tips_ore             bigint
)
language sql
stable
as $$
  select
    (select count(*) from public.restaurants)                              as restaurants_total,
    (select count(*) from public.restaurants where status = 'ACTIVE')      as restaurants_active,
    (select count(*) from public.restaurants where status = 'PENDING')     as restaurants_pending,
    coalesce(count(o.id), 0)                                               as orders_count,
    -- GMV: det som gick genom plattformen, inte det Burp behöll.
    coalesce(sum(o.items_gross_ore), 0)::bigint                            as gmv_ore,
    coalesce((select sum(f.fee_ore) from public.fees f
              join public.orders fo on fo.id = f.order_id
              where fo.status = 'COMPLETED'
                and fo.completed_at >= p_from and fo.completed_at < p_to), 0)::bigint
                                                                           as burp_revenue_ore,
    coalesce(sum(o.tip_ore), 0)::bigint                                    as tips_ore
  from public.orders o
  where o.status = 'COMPLETED'
    and o.completed_at >= p_from
    and o.completed_at < p_to;
$$;

revoke execute on function public.platform_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.platform_summary(timestamptz, timestamptz) to authenticated, service_role;

comment on function public.platform_summary is
  'Översikt för Burps backoffice. GMV är det som gick genom plattformen; burp_revenue_ore är det Burp behöll.';
