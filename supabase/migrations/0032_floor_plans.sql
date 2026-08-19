-- 0032 — Restaurangen ritar sin egen bordsplacering.
--
-- I dag är bord en lista. Önskemålet är en planritning: dra ut bord, sätta dem
-- i en sal, se vilka som är upptagna i rummets faktiska form.
--
-- Nyttan syns först i Översikten. Ett rutnät av bordsnummer säger vilket bord
-- som ropar, men inte VAR det står — och en servitör som ska gå dit tänker i
-- rummet och inte i en lista. Med planritningen blir "bord 7 väntar" en punkt
-- man kan gå till.
--
-- Koordinaterna är i ett eget rutnät, inte i pixlar. Ritytan skalas till
-- skärmen; hade positionerna lagrats i pixlar hade planritningen ritats om
-- varje gång någon bytte från telefon till surfplatta.

create type public.table_shape as enum ('ROUND', 'SQUARE', 'RECT');

create table public.floor_plans (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  -- "Nedre våningen", "Uteserveringen". En restaurang har oftast två eller tre.
  name           text not null check (length(btrim(name)) between 1 and 60),

  -- Ritytans storlek i rutnätsenheter. Standard är 40×30, vilket rymmer ett
  -- normalt rum utan att borden blir prickar.
  width          smallint not null default 40 check (width between 10 and 200),
  height         smallint not null default 30 check (height between 10 and 200),

  sort_order     smallint not null default 0,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index floor_plans_name_key on public.floor_plans (restaurant_id, name);
create index floor_plans_restaurant_idx on public.floor_plans (restaurant_id, sort_order);

create trigger floor_plans_touch before update on public.floor_plans
  for each row execute function public.touch_updated_at();

alter table public.floor_plans enable row level security;

-- Servitören läser — det är hon som ska hitta bordet. Ägare och chef ritar.
create policy floor_plans_select_staff on public.floor_plans
  for select to authenticated
  using (
    public.has_role_at(
      restaurant_id,
      array['owner', 'manager', 'staff', 'kitchen']::public.staff_role[]
    )
  );

create policy floor_plans_write_management on public.floor_plans
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

comment on table public.floor_plans is
  'En ritning per våning eller uteservering. Koordinaterna på tables är i rutnätsenheter, inte pixlar.';

-- ── Bordets plats ───────────────────────────────────────────────────────────

alter table public.tables
  add column floor_plan_id uuid references public.floor_plans(id) on delete set null,
  -- Null = bordet finns men är inte utplacerat. Det ska INTE vara ett fel:
  -- borden skapades innan ritningen fanns, och en restaurang som lägger till
  -- ett bord mitt i ett pass ska slippa öppna planritningen först.
  add column pos_x smallint check (pos_x between 0 and 200),
  add column pos_y smallint check (pos_y between 0 and 200),
  add column rotation smallint not null default 0 check (rotation between 0 and 359),
  add column shape public.table_shape not null default 'ROUND',
  -- Bordets storlek i rutnätsenheter. Ett fyrasitsigt runt bord och en
  -- åttamannalångbord ska inte ritas lika stora.
  add column width smallint not null default 4 check (width between 1 and 40),
  add column height smallint not null default 4 check (height between 1 and 40);

create index tables_floor_plan_idx on public.tables (floor_plan_id)
  where floor_plan_id is not null;

comment on column public.tables.pos_x is
  'Rutnätsposition på ritningen. Null = bordet är inte utplacerat och visas i listan bredvid.';

-- Ritningen måste tillhöra samma restaurang som bordet. Utan det går det att
-- flytta ett bord till en annan restaurangs ritning genom att skicka dess id.
create or replace function public.enforce_table_floor_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant uuid;
begin
  if new.floor_plan_id is null then
    return new;
  end if;

  select restaurant_id into v_restaurant from public.floor_plans where id = new.floor_plan_id;

  if v_restaurant is distinct from new.restaurant_id then
    raise exception 'Ritningen hör till en annan restaurang'
      using errcode = 'insufficient_privilege';
  end if;

  -- Ett utplacerat bord måste ha en position. Halvvägs finns inte: ett bord
  -- med ritning men utan koordinater går inte att rita någonstans.
  if new.pos_x is null or new.pos_y is null then
    raise exception 'Ett bord på en ritning måste ha en position'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger tables_floor_plan
  before insert or update on public.tables
  for each row execute function public.enforce_table_floor_plan();

-- ── Spara en ritning i ett svep ─────────────────────────────────────────────
--
-- Redigeraren flyttar flera bord innan någon trycker Spara. Att skriva dem en
-- och en hade betytt att ett avbrott mitt i lämnar halva rummet flyttat — och
-- den som ritar ser inte skillnaden förrän nästa gång sidan laddas.

create or replace function public.save_floor_plan_positions(
  p_floor_plan_id uuid,
  p_positions     jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant uuid;
  v_row        jsonb;
  v_count      integer := 0;
begin
  select restaurant_id into v_restaurant from public.floor_plans where id = p_floor_plan_id;
  if v_restaurant is null then
    raise exception 'Okänd ritning %', p_floor_plan_id using errcode = 'no_data_found';
  end if;

  -- Rollkontrollen görs här och inte bara i anropande kod: funktionen är
  -- SECURITY DEFINER och kringgår därmed RLS.
  if not public.has_role_at(v_restaurant, array['owner', 'manager']::public.staff_role[]) then
    raise exception 'Bara ägare och chef får rita om lokalen'
      using errcode = 'insufficient_privilege';
  end if;

  for v_row in select * from jsonb_array_elements(p_positions)
  loop
    update public.tables
    set floor_plan_id = case
          when (v_row->>'placed')::boolean then p_floor_plan_id
          else null
        end,
        pos_x    = case when (v_row->>'placed')::boolean then (v_row->>'x')::smallint end,
        pos_y    = case when (v_row->>'placed')::boolean then (v_row->>'y')::smallint end,
        rotation = coalesce((v_row->>'rotation')::smallint, rotation),
        shape    = coalesce((v_row->>'shape')::public.table_shape, shape),
        width    = coalesce((v_row->>'width')::smallint, width),
        height   = coalesce((v_row->>'height')::smallint, height)
    where id = (v_row->>'id')::uuid
      -- Bordet måste vara restaurangens eget. Utan det går det att flytta
      -- någon annans bord genom att skicka dess id.
      and restaurant_id = v_restaurant;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.save_floor_plan_positions(uuid, jsonb) from public, anon;
grant execute on function public.save_floor_plan_positions(uuid, jsonb)
  to authenticated, service_role;

comment on function public.save_floor_plan_positions is
  'Skriver alla bordspositioner i EN transaktion. Ett avbrott mitt i får inte lämna halva rummet flyttat.';
