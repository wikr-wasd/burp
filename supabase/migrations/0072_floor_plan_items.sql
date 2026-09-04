-- 0072 — Rummet, inte bara borden.
--
-- Migration 0032 gav restaurangen en ritning att dra ut bord på. Det som
-- saknades var allt annat som gör en ritning igenkännbar: baren, väggen,
-- dörren, trappan, toaletten, växterna som avgränsar uteserveringen. Utan dem
-- är ritningen ett rutnät med prickar i, och den som ska hitta bord 7 känner
-- inte igen sitt eget rum.
--
-- Sorterna är en FAST lista och inte fritext, av samma skäl som bordens
-- egenskaper i migration 0054 och allergenerna i 0071: orden översätts. En
-- restaurang som skriver "šank", en som skriver "bar" och en som skriver
-- "Theke" hade annars byggt tre olika saker som ingen kan rita likadant.
--
-- Undantaget är TEXT, som ÄR restaurangens egen text — "Bašta",
-- "Övervåningen". Den står kvar som den skrivits och översätts aldrig, precis
-- som restaurangens andra egna ord.
--
-- ── Stolarna finns inte här ─────────────────────────────────────────────────
--
-- Ett bord har redan `capacity`. Stolarna RÄKNAS fram ur platsantalet och
-- bordets form (`seatPositions()` i @burp/core) i stället för att lagras. Ett
-- lagrat stolsläge hade gett två sanningar om samma bord — fyra platser, tre
-- utritade stolar — och ingenting i Burp adresserar en enskild stol: notan,
-- QR-koden och bokningen hör alla till bordet.

create type public.floor_item_kind as enum (
  'BAR',
  'WALL',
  'DOOR',
  'WINDOW',
  'PLANT',
  'STAIRS',
  'WC',
  'KITCHEN',
  'TEXT'
);

create table public.floor_plan_items (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  -- Inredningen hör till ritningen och inte till restaurangen i stort. Tas
  -- ritningen bort finns det inget rum kvar att stå i — till skillnad från
  -- borden, som är beställningspunkter med historik och blir kvar.
  floor_plan_id  uuid not null references public.floor_plans(id) on delete cascade,

  kind           public.floor_item_kind not null,
  label          text check (length(btrim(label)) between 1 and 40),

  pos_x          smallint not null check (pos_x between 0 and 200),
  pos_y          smallint not null check (pos_y between 0 and 200),
  width          smallint not null default 4 check (width between 1 and 200),
  height         smallint not null default 2 check (height between 1 and 200),
  rotation       smallint not null default 0 check (rotation between 0 and 359),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- En etikett utan text är en tom ruta mitt i rummet.
  constraint floor_plan_items_text_needs_label
    check (kind <> 'TEXT' or label is not null)
);

create index floor_plan_items_plan_idx on public.floor_plan_items (floor_plan_id);

create trigger floor_plan_items_touch before update on public.floor_plan_items
  for each row execute function public.touch_updated_at();

-- Ritningen måste tillhöra samma restaurang som saken. Utan spärren går det
-- att möblera någon annans lokal genom att skicka dess ritnings-id — samma
-- hål som `enforce_table_floor_plan()` stängde för borden.
create or replace function public.enforce_floor_item_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.floor_plans where id = new.floor_plan_id;

  if v_restaurant is distinct from new.restaurant_id then
    raise exception 'Ritningen hör till en annan restaurang'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger floor_plan_items_plan
  before insert or update on public.floor_plan_items
  for each row execute function public.enforce_floor_item_plan();

alter table public.floor_plan_items enable row level security;

-- Servitören och köket LÄSER — det är de som ska hitta i rummet. Ägare och
-- chef möblerar.
create policy floor_plan_items_select_staff on public.floor_plan_items
  for select to authenticated
  using (
    public.has_role_at(
      restaurant_id,
      array['owner', 'manager', 'staff', 'kitchen']::public.staff_role[]
    )
  );

create policy floor_plan_items_write_management on public.floor_plan_items
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

-- RLS utan GRANT är verkningslös: policyn gäller, men rollen har inga
-- tabellrättigheter alls. Migration 0012 finns för att det felet redan begåtts.
grant select, insert, update, delete on public.floor_plan_items to authenticated;
grant all on public.floor_plan_items to service_role;

comment on table public.floor_plan_items is
  'Inredningen på en ritning: bar, vägg, dörr, trappa, växt. Stolar finns inte här — de räknas ur bordets capacity.';

-- ── Hela rummet sparas i ETT svep ───────────────────────────────────────────
--
-- Ersätter `save_floor_plan_positions` från migration 0032. Redigeraren
-- flyttar bord, möblerar och ändrar rummets storlek innan någon trycker Spara,
-- och ett avbrott mitt i får inte lämna borden flyttade men baren kvar där den
-- stod. Två anrop hade varit två transaktioner.

drop function if exists public.save_floor_plan_positions(uuid, jsonb);

create or replace function public.save_floor_plan_layout(
  p_floor_plan_id uuid,
  p_tables        jsonb,
  p_items         jsonb,
  p_width         smallint default null,
  p_height        smallint default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant uuid;
  v_row        jsonb;
  v_id         uuid;
  v_keep       uuid[] := '{}';
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

  if p_width is not null and p_height is not null then
    update public.floor_plans
    set width = p_width, height = p_height
    where id = p_floor_plan_id;
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_tables, '[]'::jsonb))
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
        height   = coalesce((v_row->>'height')::smallint, height),
        -- Platsantalet ritar stolarna. Det ändras här därför att den som
        -- ritar SER bordet: att en fyrsitsare blivit en sexa upptäcks i
        -- rummet, inte i en lista.
        capacity = coalesce((v_row->>'capacity')::smallint, capacity)
    where id = (v_row->>'id')::uuid
      -- Bordet måste vara restaurangens eget. Utan det går det att flytta
      -- någon annans bord genom att skicka dess id.
      and restaurant_id = v_restaurant;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  for v_row in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_id := coalesce((v_row->>'id')::uuid, gen_random_uuid());

    insert into public.floor_plan_items (
      id, restaurant_id, floor_plan_id, kind, label, pos_x, pos_y, width, height, rotation
    )
    values (
      v_id,
      v_restaurant,
      p_floor_plan_id,
      (v_row->>'kind')::public.floor_item_kind,
      nullif(btrim(coalesce(v_row->>'label', '')), ''),
      (v_row->>'x')::smallint,
      (v_row->>'y')::smallint,
      (v_row->>'width')::smallint,
      (v_row->>'height')::smallint,
      coalesce((v_row->>'rotation')::smallint, 0)
    )
    on conflict (id) do update
    set kind          = excluded.kind,
        label         = excluded.label,
        floor_plan_id = excluded.floor_plan_id,
        pos_x         = excluded.pos_x,
        pos_y         = excluded.pos_y,
        width         = excluded.width,
        height        = excluded.height,
        rotation      = excluded.rotation
    -- Ett id som redan finns hos NÅGON ANNAN restaurang får inte skrivas över
    -- av en upsert. Utan raden här hade en klient som gissar ett id kunnat
    -- flytta en annan lokals bar.
    where public.floor_plan_items.restaurant_id = v_restaurant;

    v_keep := v_keep || v_id;
  end loop;

  -- Det som tagits bort i redigeraren tas bort här. Skickas ingen lista alls
  -- (p_items = null) rörs inredningen inte — då är det bara borden som sparas.
  if p_items is not null then
    delete from public.floor_plan_items
    where floor_plan_id = p_floor_plan_id
      and not (id = any (v_keep));
  end if;

  return v_count;
end;
$$;

revoke execute on function public.save_floor_plan_layout(uuid, jsonb, jsonb, smallint, smallint)
  from public, anon;
grant execute on function public.save_floor_plan_layout(uuid, jsonb, jsonb, smallint, smallint)
  to authenticated, service_role;

comment on function public.save_floor_plan_layout is
  'Skriver bordens platser, inredningen och rummets storlek i EN transaktion. Ett avbrott mitt i får inte lämna halva rummet flyttat.';
