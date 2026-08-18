-- 0026 — Kortbetalning: restaurangens betalkonto, valutan på betalningen och
-- de spärrar som gör en webhook ofarlig (öppen fråga 5).
--
-- Beslutet 2026-08-17: **restaurangen äger sitt eget inlösenavtal.** Pengarna
-- går från gästen till restaurangen, Burp rör dem aldrig. Det är inte en
-- teknisk detalj — att förmedla pengar åt någon annan är tillståndspliktigt, och
-- Bosnien och Serbien ligger utanför EU/EES där ett sådant tillstånd tar
-- 6–18 månader. Modellen gör att kortbetalning kan byggas nu i stället för då.
--
-- Stripe finns i Kroatien och Sverige men INTE i Bosnien eller Serbien. Monri
-- täcker hela regionen och läggs på samma gränssnitt när avtalet finns.
-- Schemat namnger därför ingen leverantör: `provider` är text, som i 0006.

-- ── Restaurangens betalkonto ────────────────────────────────────────────────
--
-- Egen tabell och inte kolumner på `restaurants`, av två skäl. En restaurang
-- kan byta leverantör — Stripe i dag, Monri i morgon — och då ska det gamla
-- kontot ligga kvar så att gamla betalningar går att slå upp. Och ett konto har
-- en egen livscykel: det ansöks, granskas och godkänns av leverantören, medan
-- restaurangen är godkänd av oss.

create type public.payment_account_status as enum ('PENDING', 'ACTIVE', 'DISABLED');

create table public.restaurant_payment_accounts (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,

  provider            text not null,
  -- Leverantörens id för kontot, t.ex. `acct_…` hos Stripe.
  external_account_id text not null,

  -- Valutan kontot avräknar i. Måste stämma med restaurangens, annars tar
  -- kontot emot pengar i en valuta menyn inte är prissatt i.
  currency            public.currency_code not null,

  status              public.payment_account_status not null default 'PENDING',

  -- Vad leverantören säger att kontot får göra. Sparas rått så att "varför kan
  -- de inte ta kort" går att svara på utan att logga in i leverantörens portal.
  capabilities        jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Ett konto per leverantör och restaurang. Två Stripe-konton på samma
-- restaurang betyder att hälften av betalningarna hamnar fel.
create unique index restaurant_payment_accounts_provider_key
  on public.restaurant_payment_accounts (restaurant_id, provider);

-- Webhooken slår upp kontot på leverantörens id, inte på vårt.
create unique index restaurant_payment_accounts_external_key
  on public.restaurant_payment_accounts (provider, external_account_id);

create trigger restaurant_payment_accounts_touch
  before update on public.restaurant_payment_accounts
  for each row execute function public.touch_updated_at();

-- Valutan får inte glida isär från restaurangens. Ett konto i euro på en
-- restaurang som prissätter i mark tar emot rätt siffra i fel valuta, och det
-- syns först i avräkningen.
create or replace function public.enforce_payment_account_currency()
returns trigger
language plpgsql
as $$
declare
  restaurant_currency public.currency_code;
begin
  select currency into restaurant_currency
  from public.restaurants
  where id = new.restaurant_id;

  if restaurant_currency is null then
    raise exception 'Restaurangen % saknar valuta', new.restaurant_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.currency <> restaurant_currency then
    raise exception 'Betalkontots valuta (%) måste vara samma som restaurangens (%)',
      new.currency, restaurant_currency
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger restaurant_payment_accounts_currency
  before insert or update on public.restaurant_payment_accounts
  for each row execute function public.enforce_payment_account_currency();

alter table public.restaurant_payment_accounts enable row level security;

-- Bara ägaren och chefen. Kontot är restaurangens ekonomi, inte personalens —
-- samma gräns som statistiksidan drar. Skrivning sker alltid genom servern med
-- service role, som talar med leverantören först; en INSERT-policy hade låtit
-- en ägare skriva in ett `acct_…` som ingen leverantör känner till.
create policy restaurant_payment_accounts_select_owner
  on public.restaurant_payment_accounts
  for select to authenticated
  using (
    public.has_role_at(restaurant_id, array['owner', 'manager']::public.staff_role[])
  );

create policy restaurant_payment_accounts_select_platform
  on public.restaurant_payment_accounts
  for select to authenticated
  using (public.is_platform_admin());

comment on table public.restaurant_payment_accounts is
  'Restaurangens eget inlösenavtal hos en betalleverantör. Burp håller aldrig gästens pengar — se docs/OPEN-QUESTIONS.md fråga 5.';

-- ── Valutan på betalningen ──────────────────────────────────────────────────
--
-- `payments.currency` var `char(3) default 'SEK'` från 0006, alltså från innan
-- marknaden var bestämd. Två fel följde av det: en betalning kunde få en annan
-- valuta än sin order trots att valutan är fryst där (0020), och 'SEK' var
-- default för en plattform vars huvudmarknad är Bosnien.
--
-- Valutan är inte ett val. Den följer av ordern, precis som orderns valuta
-- följer av restaurangen.

update public.payments p
set currency = o.currency::text
from public.orders o
where o.id = p.order_id
  and p.currency is distinct from o.currency::text;

alter table public.payments
  alter column currency drop default;

alter table public.payments
  alter column currency type public.currency_code
  using currency::public.currency_code;

create or replace function public.set_payment_currency()
returns trigger
language plpgsql
as $$
begin
  select currency into new.currency
  from public.orders
  where id = new.order_id;

  if new.currency is null then
    raise exception 'Ordern % saknar valuta', new.order_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger payments_set_currency
  before insert on public.payments
  for each row execute function public.set_payment_currency();

comment on column public.payments.currency is
  'Ärvs från ordern av trigger. Aldrig satt av anroparen — en betalning i annan valuta än sin order går inte att stämma av.';

-- ── Betalningens statusmaskin ───────────────────────────────────────────────
--
--   PENDING → AUTHORIZED → CAPTURED → REFUNDED / PARTIALLY_REFUNDED
--      │           │
--      └───────────┴──→ FAILED
--
-- Samma regel finns i packages/core/src/payment.ts. Koden är för snabb
-- feedback, triggern är garantin: webhookar kommer i oordning, kommer två
-- gånger och kommer från internet.

create or replace function public.enforce_payment_status_transition()
returns trigger
language plpgsql
as $$
declare
  allowed public.payment_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'PENDING'            then array['AUTHORIZED', 'CAPTURED', 'FAILED']
    when 'AUTHORIZED'         then array['CAPTURED', 'FAILED']
    when 'CAPTURED'           then array['REFUNDED', 'PARTIALLY_REFUNDED']
    when 'PARTIALLY_REFUNDED' then array['REFUNDED', 'PARTIALLY_REFUNDED']
    else array[]::text[]
  end::public.payment_status[];

  if not (new.status = any (allowed)) then
    raise exception 'Betalningen kan inte gå från % till %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Vad som ALDRIG får ändras på en betalning.
--
-- Raden är ett kvitto på att pengar rörde sig. Beloppet, ordern, restaurangen
-- och leverantören är det som gör den till bevis; ändras något av dem är
-- avstämningen värdelös. Statusen och tidsstämplarna måste däremot kunna
-- ändras — en betalning capturas och återbetalas.
--
-- Triggern gäller även service role, som annars kringgår allt.
create or replace function public.guard_payment_update()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id
     or new.order_id <> old.order_id
     or new.restaurant_id <> old.restaurant_id
     or new.amount_ore <> old.amount_ore
     or new.currency <> old.currency
     or new.provider <> old.provider
     or new.idempotency_key <> old.idempotency_key
     or new.created_at <> old.created_at then
    raise exception 'En betalningsrad får bara ändra status, tidpunkt, felorsak och leverantörssvar'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger payments_guard_update
  before update on public.payments
  for each row execute function public.guard_payment_update();

create trigger payments_status_transition
  before update on public.payments
  for each row execute function public.enforce_payment_status_transition();

-- En betalningsrad tas aldrig bort. Samma princip som order_events och
-- loyalty_transactions: en logg man kan radera ur är ingen logg.
create trigger payments_no_delete
  before delete on public.payments
  for each row execute function public.reject_mutation();

-- Ingen UPDATE-policy för `authenticated`, med flit. Kortbetalningar flyttas
-- bara av webhooken, som kör med service role och inte behöver någon policy.
-- Kassans kontantrader ligger kvar orörbara som i 0024.

-- ── Händelseliggare för webhookar ───────────────────────────────────────────
--
-- Leverantörer garanterar leverans MINST en gång, inte exakt en gång. Samma
-- händelse kommer igen efter en timeout, efter en omstart, eller för att någon
-- tryckte "skicka om" i leverantörens portal.
--
-- Utan den här tabellen hade en omsänd `payment_intent.succeeded` skickat ännu
-- ett brev till köket om samma order. Unikt index på leverantörens eget
-- händelse-id gör dubbletten till en krock i databasen i stället för en
-- bedömning i kod.

create table public.payment_events (
  id           bigint generated always as identity primary key,
  provider     text not null,
  -- Leverantörens id för händelsen, t.ex. `evt_…`.
  event_id     text not null,
  kind         text not null,
  payment_id   uuid references public.payments(id) on delete set null,
  payload      jsonb not null default '{}'::jsonb,
  received_at  timestamptz not null default now()
);

create unique index payment_events_provider_event_key
  on public.payment_events (provider, event_id);

create index payment_events_payment_idx on public.payment_events (payment_id);

alter table public.payment_events enable row level security;

-- Ingen läser den här från klienten. Den finns för att kunna svara på "varför
-- blev ordern inte betald" och skrivs bara av webhooken med service role.
-- Plattformens support får läsa; ingen annan.
create policy payment_events_select_platform on public.payment_events
  for select to authenticated
  using (public.is_platform_admin());

create trigger payment_events_no_update
  before update on public.payment_events
  for each row execute function public.reject_mutation();

create trigger payment_events_no_delete
  before delete on public.payment_events
  for each row execute function public.reject_mutation();

comment on table public.payment_events is
  'Varje webhook som tagits emot, en gång. Unikt index på (provider, event_id) gör en omsändning till en krock i stället för en dubblerad order.';

-- ── Kortorderns väg in ──────────────────────────────────────────────────────
--
-- En kortorder skapas i DRAFT och lyfts till PLACED först när betalningen är
-- bekräftad. Köket ska aldrig se en obetald order.
--
-- Funktionen körs av webhooken med service role. Den är SECURITY DEFINER av
-- samma skäl som place_order: den ska kunna göra exakt det här och ingenting
-- annat, oavsett vem som anropar den.

create or replace function public.confirm_order_payment(
  p_payment_id uuid,
  p_method     text default null
)
returns public.order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_next    public.order_status;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Okänd betalning %', p_payment_id using errcode = 'no_data_found';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;

  -- Betalningen kontrolleras mot ordern, inte mot vad leverantören påstår.
  -- En webhook kommer från internet och kan gälla fel belopp.
  if v_payment.amount_ore < v_order.total_ore then
    raise exception 'Betalningen (%) täcker inte ordern (%)',
      v_payment.amount_ore, v_order.total_ore
      using errcode = 'check_violation';
  end if;

  if v_payment.status <> 'CAPTURED' then
    update public.payments
    set status      = 'CAPTURED',
        captured_at = coalesce(captured_at, now()),
        method      = coalesce(p_method, method)
    where id = p_payment_id;
  end if;

  -- Dricksraden skapas av place_order utan betalning, eftersom ordern läggs
  -- innan den betalas. Kopplingen görs här, så att frågan "vem betalade in den
  -- här dricksen och hur" har ett svar när personalen ska fördela den.
  update public.tips
  set payment_id = p_payment_id
  where order_id = v_payment.order_id
    and payment_id is null;

  -- Redan lyft. En omsänd händelse ska inte lägga ordern igen.
  if v_order.status <> 'DRAFT' then
    return v_order.status;
  end if;

  select case
           when coalesce((r.order_policy ->> 'autoAccept')::boolean, false)
           then 'ACCEPTED'::public.order_status
           else 'PLACED'::public.order_status
         end
  into v_next
  from public.restaurants r
  where r.id = v_order.restaurant_id;

  update public.orders
  set status    = 'PLACED',
      placed_at = coalesce(placed_at, now())
  where id = v_order.id;

  -- PLACED → ACCEPTED är ett eget steg i statusmaskinen och måste tas separat,
  -- annars avvisar triggern hoppet.
  if v_next = 'ACCEPTED' then
    update public.orders
    set status = 'ACCEPTED', accepted_at = now()
    where id = v_order.id;
  end if;

  return v_next;
end;
$$;

revoke execute on function public.confirm_order_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text) to service_role;

comment on function public.confirm_order_payment is
  'Lyfter en kortorder från DRAFT till PLACED när betalningen bekräftats. Idempotent: en omsänd webhook ger samma order, inte en ny.';

-- Motsvarande väg när betalningen inte gick igenom.
create or replace function public.fail_order_payment(
  p_payment_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_status  public.order_status;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Okänd betalning %', p_payment_id using errcode = 'no_data_found';
  end if;

  if v_payment.status in ('PENDING', 'AUTHORIZED') then
    update public.payments
    set status         = 'FAILED',
        failed_at      = now(),
        failure_reason = p_reason
    where id = p_payment_id;
  end if;

  select status into v_status from public.orders where id = v_payment.order_id;

  -- Bara utkastet avbryts. En order som redan hunnit bli lagd hör till köket,
  -- och den frågan löses av personalen och inte av en webhook.
  if v_status = 'DRAFT' then
    update public.orders
    set status = 'CANCELLED', cancelled_at = now()
    where id = v_payment.order_id;
  end if;
end;
$$;

revoke execute on function public.fail_order_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_order_payment(uuid, text) to service_role;

-- ── place_order måste tåla ett utkast ───────────────────────────────────────
--
-- Funktionen satte `placed_at = now()` på varje order, oavsett status. Det var
-- korrekt så länge varje order lades direkt; en kortorder skapas i DRAFT och
-- ska inte ha en läggtidpunkt förrän den faktiskt lagts — annars visar kvittot
-- och statistiken att ordern lades klockan sju medan gästen aldrig betalade.
--
-- Samma sak med händelsen: `ORDER_PLACED` på en order som ligger i DRAFT är en
-- osanning i den logg som ska gå att lita på.
--
-- Resten är oförändrat från 0010.

create or replace function public.place_order(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id       uuid;
  v_existing_id    uuid;
  v_item           jsonb;
  v_option         jsonb;
  v_order_item_id  uuid;
  v_restaurant_id  uuid := (p_payload->>'restaurant_id')::uuid;
  v_idempotency    uuid := (p_payload->>'idempotency_key')::uuid;
  v_status         public.order_status := (p_payload->>'status')::public.order_status;
begin
  select id into v_existing_id
  from public.orders
  where restaurant_id = v_restaurant_id and idempotency_key = v_idempotency;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.orders (
    restaurant_id, guest_id, table_id, table_session_id, type, status, note, scheduled_for,
    items_gross_ore, items_vat_ore, vat_by_rate, delivery_fee_ore, discount_ore,
    tip_ore, total_ore, idempotency_key, placed_at, accepted_at
  )
  values (
    v_restaurant_id,
    nullif(p_payload->>'guest_id', '')::uuid,
    nullif(p_payload->>'table_id', '')::uuid,
    nullif(p_payload->>'table_session_id', '')::uuid,
    (p_payload->>'type')::public.order_type,
    v_status,
    p_payload->>'note',
    nullif(p_payload->>'scheduled_for', '')::timestamptz,
    (p_payload->>'items_gross_ore')::integer,
    (p_payload->>'items_vat_ore')::integer,
    coalesce(p_payload->'vat_by_rate', '{}'::jsonb),
    (p_payload->>'delivery_fee_ore')::integer,
    (p_payload->>'discount_ore')::integer,
    (p_payload->>'tip_ore')::integer,
    (p_payload->>'total_ore')::integer,
    v_idempotency,
    -- Ett utkast är inte lagt. Tidpunkten sätts av statustriggern när
    -- betalningen bekräftas.
    case when v_status <> 'DRAFT' then now() end,
    case when v_status = 'ACCEPTED' then now() end
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_payload->'lines')
  loop
    insert into public.order_items (
      order_id, restaurant_id, menu_item_id, name_snapshot,
      unit_price_ore, vat_rate_bps, quantity, line_gross_ore, note
    )
    values (
      v_order_id,
      v_restaurant_id,
      (v_item->>'menu_item_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'unit_price_ore')::integer,
      (v_item->>'vat_rate_bps')::integer,
      (v_item->>'quantity')::smallint,
      (v_item->>'line_gross_ore')::integer,
      v_item->>'note'
    )
    returning id into v_order_item_id;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb))
    loop
      insert into public.order_item_options (
        order_item_id, restaurant_id, option_id, name_snapshot, price_ore
      )
      values (
        v_order_item_id,
        v_restaurant_id,
        (v_option->>'option_id')::uuid,
        v_option->>'name_snapshot',
        (v_option->>'price_ore')::integer
      );
    end loop;
  end loop;

  insert into public.fees (order_id, restaurant_id, base, base_amount_ore, bps, fee_ore)
  values (
    v_order_id,
    v_restaurant_id,
    (p_payload->>'fee_base')::public.fee_base,
    (p_payload->>'fee_base_amount_ore')::integer,
    (p_payload->>'fee_bps')::integer,
    (p_payload->>'fee_ore')::integer
  );

  if (p_payload->>'tip_ore')::integer > 0 then
    insert into public.tips (order_id, restaurant_id, amount_ore)
    values (v_order_id, v_restaurant_id, (p_payload->>'tip_ore')::integer);
  end if;

  insert into public.order_events (
    order_id, restaurant_id, event_type, to_status, actor_kind, payload
  )
  values (
    v_order_id, v_restaurant_id,
    case when v_status = 'DRAFT' then 'ORDER_DRAFTED' else 'ORDER_PLACED' end,
    v_status,
    case when auth.uid() is null then 'GUEST' else 'STAFF' end,
    jsonb_build_object('total_ore', (p_payload->>'total_ore')::integer)
  );

  return v_order_id;
end;
$$;

revoke execute on function public.place_order(jsonb) from public, anon, authenticated;
