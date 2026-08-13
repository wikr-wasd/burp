-- 0009 — Row Level Security på varje tabell (avsnitt 12).
--
-- Modellen i korthet:
--
--   ANON (gäst utan konto)
--     Läser publik restaurang- och menydata. Inget annat.
--     QR-beställning går INTE via anon-rollen — gästen har ingen auth.uid()
--     att skriva en policy mot. Servern verifierar bordstokenet och agerar via
--     service role (se apps/web/src/lib/table-session.ts).
--
--   AUTHENTICATED (gäst med konto)
--     Ser sina egna order, adresser, poäng, recensioner och favoriter.
--
--   PERSONAL (rad i public.staff)
--     Ser bara sin egen restaurang. Rollen avgör hur mycket:
--       owner    allt
--       manager  drift och meny
--       staff    order och bord
--       kitchen  bara köksskärmen
--
--   SERVICE ROLE
--     Kringgår allt. Används där RLS inte räcker och varje anrop måste då
--     filtrera på restaurant_id själv.
--
-- Ny tabell = ny policy, alltid, innan tabellen börjar användas.

-- ── Hjälpfunktioner ─────────────────────────────────────────────────────────
--
-- SECURITY DEFINER krävs: en policy på `orders` som frågar `staff` skulle
-- annars utlösa `staff`-policyn, som frågar `staff` igen — oändlig rekursion.
-- Funktionen kör därför som ägaren och läser `staff` utan RLS.
--
-- STABLE gör att Postgres kan anropa den en gång per query i stället för en
-- gång per rad. På en orderlista med 500 rader är skillnaden mätbar.

create or replace function public.is_staff_of(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
  select exists (
    select 1 from public.staff
    where restaurant_id = p_restaurant_id
      and user_id = auth.uid()
      and is_active
      and role = any(p_roles)
  );
$$;

revoke execute on function public.is_staff_of(uuid) from public;
revoke execute on function public.has_role_at(uuid, public.staff_role[]) from public;
grant execute on function public.is_staff_of(uuid) to authenticated;
grant execute on function public.has_role_at(uuid, public.staff_role[]) to authenticated;

-- ── Slå på RLS överallt ─────────────────────────────────────────────────────

alter table public.profiles              enable row level security;
alter table public.restaurants           enable row level security;
alter table public.locations             enable row level security;
alter table public.staff                 enable row level security;
alter table public.menus                 enable row level security;
alter table public.menu_categories       enable row level security;
alter table public.menu_items            enable row level security;
alter table public.option_groups         enable row level security;
alter table public.options               enable row level security;
alter table public.item_availability     enable row level security;
alter table public.tables                enable row level security;
alter table public.table_sessions        enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_item_options    enable row level security;
alter table public.order_events          enable row level security;
alter table public.payments              enable row level security;
alter table public.tips                  enable row level security;
alter table public.fees                  enable row level security;
alter table public.payouts               enable row level security;
alter table public.register_receipts     enable row level security;
alter table public.addresses             enable row level security;
alter table public.loyalty_accounts      enable row level security;
alter table public.loyalty_transactions  enable row level security;
alter table public.reviews               enable row level security;
alter table public.favorites             enable row level security;
alter table public.media                 enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── restaurants ─────────────────────────────────────────────────────────────

-- Publik läsning av aktiva restauranger. Det här är vad SEO-sidorna
-- (burp.se/r/{stad}/{slug}) läser — offentlig data ska inte kräva service role.
create policy restaurants_select_public on public.restaurants
  for select to anon, authenticated using (status = 'ACTIVE');

-- Personal ser sin egen restaurang oavsett status, så att en pausad
-- restaurang fortfarande går att administrera.
create policy restaurants_select_staff on public.restaurants
  for select to authenticated using (public.is_staff_of(id));

-- Bara ägare och chef får ändra. Att skapa och ta bort restauranger är Burps
-- backoffice-ansvar och görs via service role.
create policy restaurants_update_owner on public.restaurants
  for update to authenticated
  using (public.has_role_at(id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(id, array['owner', 'manager']::public.staff_role[]));

-- ── locations och staff ─────────────────────────────────────────────────────

create policy locations_select_public on public.locations
  for select to anon, authenticated using (is_active);

create policy locations_all_staff on public.locations
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

-- Personal ser sina kollegor på samma restaurang.
create policy staff_select_colleagues on public.staff
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff_of(restaurant_id));

-- Bara ägaren bjuder in och tar bort personal. En chef som kunde göra det
-- skulle kunna ge sig själv ägarrollen.
create policy staff_write_owner on public.staff
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner']::public.staff_role[]));

-- ── Meny ────────────────────────────────────────────────────────────────────
-- Publikt läsbar när den är publicerad; skrivbar av ägare och chef.

create policy menus_select_public on public.menus
  for select to anon, authenticated using (status = 'PUBLISHED');
create policy menus_all_staff on public.menus
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy menu_categories_select_public on public.menu_categories
  for select to anon, authenticated using (true);
create policy menu_categories_all_staff on public.menu_categories
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy menu_items_select_public on public.menu_items
  for select to anon, authenticated using (status = 'PUBLISHED');
create policy menu_items_select_staff on public.menu_items
  for select to authenticated using (public.is_staff_of(restaurant_id));
create policy menu_items_write_staff on public.menu_items
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy option_groups_select_public on public.option_groups
  for select to anon, authenticated using (true);
create policy option_groups_write_staff on public.option_groups
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy options_select_public on public.options
  for select to anon, authenticated using (true);
create policy options_write_staff on public.options
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy item_availability_select_public on public.item_availability
  for select to anon, authenticated using (true);
create policy item_availability_write_staff on public.item_availability
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

-- ── Bord ────────────────────────────────────────────────────────────────────
--
-- INGEN publik läsning. Kunde anon läsa `tables` skulle hela QR-skyddet falla:
-- en angripare hämtade helt enkelt alla qr_public_id ur tabellen i stället för
-- att gissa dem. Gästens uppslag går via service role efter HMAC-verifiering.

create policy tables_all_staff on public.tables
  for all to authenticated
  using (public.is_staff_of(restaurant_id))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy table_sessions_select_staff on public.table_sessions
  for select to authenticated using (public.is_staff_of(restaurant_id));
create policy table_sessions_write_staff on public.table_sessions
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager', 'staff']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager', 'staff']::public.staff_role[]));

-- ── Order ───────────────────────────────────────────────────────────────────

-- Gästen ser sina egna order. En anonym bordsorder har guest_id = null och
-- syns därför inte här — den når gästen via bordssessionens cookie i stället.
create policy orders_select_own on public.orders
  for select to authenticated using (guest_id = auth.uid());

-- All personal ser restaurangens order, kocken inkluderad — köksskärmen är
-- hela hans arbetsyta.
create policy orders_select_staff on public.orders
  for select to authenticated using (public.is_staff_of(restaurant_id));

-- Statusändringar görs av personal. Kocken får uppdatera (READY-knappen på
-- köksskärmen) men inte skapa eller radera order.
create policy orders_update_staff on public.orders
  for update to authenticated
  using (public.is_staff_of(restaurant_id))
  with check (public.is_staff_of(restaurant_id));

-- Order SKAPAS aldrig direkt av klienten. Den vägen går via place_order()
-- i migration 0010, som räknar om priset på servern. Fanns en INSERT-policy
-- här skulle en gäst kunna skriva in sin egen totalsumma.

create policy order_items_select on public.order_items
  for select to authenticated
  using (
    public.is_staff_of(restaurant_id)
    or exists (select 1 from public.orders o where o.id = order_id and o.guest_id = auth.uid())
  );

create policy order_item_options_select on public.order_item_options
  for select to authenticated
  using (
    public.is_staff_of(restaurant_id)
    or exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id and o.guest_id = auth.uid()
    )
  );

-- Loggen är läsbar för personal men har medvetet INGEN update- eller
-- delete-policy. En logg som går att skriva om i efterhand är värdelös.
create policy order_events_select_staff on public.order_events
  for select to authenticated using (public.is_staff_of(restaurant_id));

-- ── Pengar ──────────────────────────────────────────────────────────────────
--
-- Enbart läsning, och bara för ägare och chef. Personal vid kassan behöver se
-- ordern, inte marginalen. Alla skrivningar sker via webhooks från
-- betalleverantören med service role.

create policy payments_select_owner on public.payments
  for select to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy tips_select_staff on public.tips
  for select to authenticated using (public.is_staff_of(restaurant_id));

create policy fees_select_owner on public.fees
  for select to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

create policy payouts_select_owner on public.payouts
  for select to authenticated
  using (public.has_role_at(restaurant_id, array['owner']::public.staff_role[]));

create policy register_receipts_select_owner on public.register_receipts
  for select to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

-- ── Gästdata ────────────────────────────────────────────────────────────────

create policy addresses_own on public.addresses
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy loyalty_accounts_own on public.loyalty_accounts
  for select to authenticated using (user_id = auth.uid());

-- Läsning bara. Poäng får aldrig skrivas av klienten — de delas ut av
-- triggers och bakgrundsjobb.
create policy loyalty_transactions_own on public.loyalty_transactions
  for select to authenticated
  using (exists (
    select 1 from public.loyalty_accounts a
    where a.id = account_id and a.user_id = auth.uid()
  ));

create policy favorites_own on public.favorites
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Recensioner ─────────────────────────────────────────────────────────────

create policy reviews_select_public on public.reviews
  for select to anon, authenticated using (is_published);

-- Gästen får skriva en recension på sin EGEN order. Att ordern måste vara
-- COMPLETED kontrolleras av trigger i migration 0010 — en WITH CHECK kan inte
-- ge ett begripligt felmeddelande.
create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.guest_id = auth.uid() and o.status = 'COMPLETED'
    )
  );

create policy reviews_update_own on public.reviews
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Restaurangen svarar offentligt. Policyn tillåter update på hela raden —
-- att bara `response` får ändras enforcas av trigger i migration 0010.
create policy reviews_respond_staff on public.reviews
  for update to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

-- ── Media ───────────────────────────────────────────────────────────────────

-- Bara godkänd media är publik (avsnitt 8.3).
create policy media_select_public on public.media
  for select to anon, authenticated using (status = 'APPROVED');

create policy media_select_staff on public.media
  for select to authenticated using (public.is_staff_of(restaurant_id));

create policy media_write_staff on public.media
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));
