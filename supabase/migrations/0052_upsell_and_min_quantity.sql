-- 0052 — Merförsäljning, drycker och minsta antal.
--
-- Tre små ändringar som hör ihop: de handlar alla om vad menyn får säga om en
-- rätt utöver namn och pris.
--
-- ── Minsta antal ────────────────────────────────────────────────────────────
--
-- Punjene paprike sätts inte i ugnen för en portion. Restaurangen ska kunna
-- säga "den här lagas i sats om fyra" utan att ta bort rätten ur menyn eller
-- höja priset till en nivå som ser ut som ett misstag.
--
-- Regeln gäller BESTÄLLNINGEN och inte raden — två med fyllning och två utan
-- är fyra portioner för köket. Den summeringen ligger i `buildPricedLines`
-- (@burp/core) och kontrolleras av `POST /api/orders`. Kolumnen här är sanningen
-- om vad som gäller; kontrollen finns i koden därför att den behöver se hela
-- ordern och inte en rad i taget.
--
-- Taket är 99 därför att orderschemat inte tar emot mer per rad. En gräns på
-- 100 hade gjort rätten omöjlig att beställa, vilket ser ut som en bugg och
-- är ett datafel.

alter table public.menu_items
  add column min_quantity smallint not null default 1
    check (min_quantity between 1 and 99);

comment on column public.menu_items.min_quantity is
  'Minsta antal portioner i samma beställning. 1 = ingen begränsning. Summeras över orderns rader i buildPricedLines — annars går regeln att gå runt genom att välja olika tillval.';

-- ── Drycker ─────────────────────────────────────────────────────────────────
--
-- Kundvagnen ska kunna föreslå något att dricka. Vilken avdelning som är
-- drycker kan inte gissas ur namnet: menyn skrivs på restaurangens eget språk,
-- och "Pića", "Getränke" och "Dryck" är samma sak för en gäst men tre
-- strängar för en jämförelse. Restaurangen får säga det själv i stället.

alter table public.menu_categories
  add column is_drinks boolean not null default false;

comment on column public.menu_categories.is_drinks is
  'Avdelningen innehåller dryck. Sätts av restaurangen; gissas aldrig ur namnet, som är skrivet på restaurangens eget språk.';

-- ── Förslag i kundvagnen ────────────────────────────────────────────────────
--
-- "Vill du ha något till?" — restaurangens egna förslag, inte en algoritm.
-- Den som lagar maten vet att ćevapi går med jogurt och att baklava säljs sist.
--
-- Förslaget är ett förslag om VAD, aldrig om vad det kostar. Priset hämtas ur
-- menyn som alltid när ordern läggs (regel 2). Tabellen bär därför inget
-- belopp, och ska aldrig göra det.

create table public.item_upsells (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  source_item_id    uuid not null,
  suggested_item_id uuid not null,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),

  -- En rätt föreslår inte sig själv.
  constraint item_upsells_not_self check (source_item_id <> suggested_item_id),

  -- Samma par en gång. Utan den kan samma dryck hamna tre gånger i listan
  -- efter tre klick i dashboarden.
  constraint item_upsells_unique unique (source_item_id, suggested_item_id)
);

-- ── Båda rätterna måste höra till restaurangen på raden ─────────────────────
--
-- En vanlig FK mot `menu_items(id)` säger bara att rätten finns. Den hindrar
-- inte att en restaurang pekar ut en annan restaurangs rätt som förslag —
-- vilket hade visat en rätt gästen inte kan beställa, från ett kök som aldrig
-- får biljetten.
--
-- Sammansatt FK löser det i datan i stället för i en trigger: `(id,
-- restaurant_id)` måste finnas som par, och `restaurant_id` är samma kolumn i
-- båda referenserna. Det kräver en unik nyckel på paret i `menu_items`, som
-- är gratis — `id` är redan primärnyckel.

alter table public.menu_items
  add constraint menu_items_id_restaurant_key unique (id, restaurant_id);

alter table public.item_upsells
  add constraint item_upsells_source_fk
    foreign key (source_item_id, restaurant_id)
    references public.menu_items(id, restaurant_id) on delete cascade,
  add constraint item_upsells_suggested_fk
    foreign key (suggested_item_id, restaurant_id)
    references public.menu_items(id, restaurant_id) on delete cascade;

create index item_upsells_source_idx on public.item_upsells (source_item_id, sort_order);

comment on table public.item_upsells is
  'Restaurangens egna förslag i kundvagnen: "till ćevapi föreslå jogurt". Bär aldrig pris — priset hämtas ur menyn när ordern läggs (regel 2).';

-- ── RLS och grants ──────────────────────────────────────────────────────────
--
-- Samma modell som `options`: publik läsning, skrivning för ägare och chef.
-- Förslagen visas för en anonym gäst vid bordet och är lika publika som
-- menyn de pekar på.
--
-- Ny tabell = ny policy, alltid (regel 4). Grants kommer från default
-- privileges i 0012, men skrivs ut ändå — den migration som förlitar sig på
-- ett default är den som faller när defaultet ändras.

alter table public.item_upsells enable row level security;

create policy item_upsells_select_public on public.item_upsells
  for select to anon, authenticated using (true);

create policy item_upsells_write_staff on public.item_upsells
  for all to authenticated
  using (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]))
  with check (public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[]));

grant select on public.item_upsells to anon;
grant select, insert, update, delete on public.item_upsells to authenticated;
grant all on public.item_upsells to service_role;
