-- 0036 — Webbpush: köket får något som låter även när skärmen inte är uppe.
--
-- Köksskärmen har redan ett ljudlarm. Det räcker så länge surfplattan står på
-- hela passet — men den lilla restaurangen har ingen surfplatta, bara en
-- telefon i fickan, och brevet som skickas i dag hamnar i en inkorg ingen
-- öppnar en fredag kväll.
--
-- Webbpush och inte en leverantör: VAPID-nycklarna genereras av oss, och
-- webbläsarens egen pushtjänst gör resten. Ingen ny avtalspart, ingen kostnad
-- per meddelande, och ingenting som slutar fungera för att ett abonnemang går ut.
--
-- Prenumerationen är knuten till en WEBBLÄSARE, inte till en person. Samma
-- kock kan ha en telefon och en surfplatta, och båda ska larma.

create table public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),

  user_id        uuid not null references auth.users(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,

  -- Webbläsarens adress hos sin pushtjänst. Unik i hela plattformen: en
  -- webbläsare har en prenumeration, och skulle samma endpoint dyka upp igen
  -- är det samma enhet som prenumererat om.
  endpoint       text not null,

  -- Nycklarna som meddelandet krypteras med. Utan dem kan ingen — inte ens
  -- pushtjänsten — läsa vad som står i notisen.
  p256dh         text not null,
  auth           text not null,

  -- Vilken enhet det är, för den som ska rensa bland sina egna.
  user_agent     text,

  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  -- Räknas upp när pushtjänsten svarar med ett fel som inte är permanent.
  -- Permanenta fel (410 Gone) tar bort raden direkt.
  failure_count  smallint not null default 0
);

create unique index push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);
create index push_subscriptions_restaurant_idx on public.push_subscriptions (restaurant_id);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Var och en ser och rensar sina egna enheter. Ingen ser någon annans:
-- en prenumeration är en adress till en persons telefon.
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    -- Och bara för en restaurang man faktiskt jobbar på. Utan det kan en
    -- inloggad prenumerera på en främmande restaurangs beställningar.
    and public.is_staff_of(restaurant_id)
  );

comment on table public.push_subscriptions is
  'En rad per webbläsare som vill larma om nya order. Knuten till enheten och inte till personen — samma kock kan ha telefon och surfplatta.';
