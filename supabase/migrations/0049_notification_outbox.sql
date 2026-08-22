-- 0049 — Utkorg för notiser till gästen.
--
-- Gästen har hittills fått veta ingenting. `notifyNewOrder()` går till
-- restaurangen och `notifyRestaurantApplication()` till Burp; den som beställt
-- för avhämtning och stängt fliken har ingen aning om att maten står klar.
--
-- ── Varför en utkorg och inte ett anrop ────────────────────────────────────
--
-- Notisen ska utlösas av en statusändring, och statusändringen sker på
-- köksskärmen — som skriver DIREKT mot Supabase med personalens egen session.
-- Det valet är medvetet (se kitchen-board.tsx): RLS begränsar till den egna
-- restaurangen och statustriggern avvisar otillåtna övergångar, så ett
-- mellanlager hade bara upprepat kontroller som redan finns och kunnat glömma
-- en av dem.
--
-- Följden är att ingen server ser ändringen när den sker. Alternativen var att
-- lägga en rutt framför köksskärmen, eller att lägga notisen där ändringen
-- faktiskt äger rum. Det senare valdes 2026-08-22.
--
-- Raden skrivs av en trigger i SAMMA transaktion som statusen. Det gör det
-- omöjligt att ändra status utan att notisen köas: kraschar appen mellan de
-- två stegen finns ingen sådan mellanposition att krascha i. En rutt som ropar
-- på en avsändare efter sin egen update har den positionen, och tappar notisen
-- precis de gånger något går fel — alltså när det spelar mest roll.
--
-- Priset är fördröjning: notisen går ut när jobbet nästa gång tömmer kön.

/* ── Gästens språk fryses på ordern ──────────────────────────────────────── */
--
-- Brevet skrivs långt efter att gästen lämnat sidan, och då finns ingen
-- `Accept-Language` att läsa. Utan den här kolumnen hade jobbet fått gissa —
-- rimligen på restaurangens land, vilket ger bosniska till en tysk turist i
-- Sarajevo. Det är precis den gästen QR- och avhämtningsflödet finns för.
--
-- Samma resonemang som valutan i migration 0020: det som gällde när ordern
-- lades ska stå kvar på ordern. Ett kvitto ändrar sig inte i efterhand, och
-- inte ett brev om det heller.
--
-- NULL för order lagda före den här migrationen. Jobbet faller då tillbaka på
-- restaurangens land, vilket är den ärliga gissningen — samma som `staff.locale`.
alter table public.orders
  add column guest_locale text,
  add constraint orders_guest_locale_supported
    check (guest_locale is null or guest_locale in ('bs', 'en', 'de', 'no', 'sv'));

comment on column public.orders.guest_locale is
  'Språket gästen beställde på, fryst vid beställningen. NULL = okänt; notisjobbet faller då tillbaka på restaurangens land. Tvillingen till LOCALES i apps/web/src/lib/i18n/config.ts, precis som staff.locale.';

/* ── Vad en notis kan handla om ──────────────────────────────────────────── */
--
-- Två tillfällen, inte fyra. `PLACED` vet gästen redan om — hon tryckte nyss
-- på knappen — och `COMPLETED` betyder att hon står med maten i handen. Kvar
-- är de två hon inte kan veta själv: att köket sagt ja och när, och att maten
-- är klar.
create type public.notification_kind as enum ('ORDER_ACCEPTED', 'ORDER_READY');

create table public.notification_outbox (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  order_id       uuid not null references public.orders(id) on delete cascade,
  kind           public.notification_kind not null,

  -- Mottagaren. Alltid satt: triggern skriver ingen rad utan gästkonto, för
  -- en rad som aldrig kan skickas är inte en kö utan skräp.
  recipient_id   uuid not null references auth.users(id) on delete cascade,

  created_at     timestamptz not null default now(),
  sent_at        timestamptz,

  -- Försök och senaste fel. Ett brev som inte gick fram ska gå att se, och
  -- jobbet ska kunna sluta försöka på en adress som aldrig kommer att svara.
  attempts       integer not null default 0 check (attempts >= 0),
  last_error     text
);

-- Ett tillfälle per order och sort. Statusmaskinen tillåter inte att en order
-- blir ACCEPTED två gånger, men indexet gör dubbelutskick omöjligt även om den
-- någon gång skulle göra det — och det är ett brev till en människa.
create unique index notification_outbox_once
  on public.notification_outbox (order_id, kind);

-- Jobbets enda fråga: vad är osänt? Partiellt index, så att en kö som vuxit
-- till hundratusen skickade rader fortfarande svarar på millisekunder.
create index notification_outbox_pending
  on public.notification_outbox (created_at)
  where sent_at is null;

/* ── Åtkomst ─────────────────────────────────────────────────────────────── */
--
-- Kön är jobbets, och jobbet kör med service role — som går förbi RLS. Ingen
-- annan har något här att göra.
--
-- Policyn står UTSKRIVEN som `using (false)` i stället för att utelämnas. En
-- tabell med RLS och utan policy släpper heller inte igenom någon, men de två
-- ser likadana ut i databasen och betyder olika saker: den ena är ett beslut,
-- den andra är en glömska. `verify-schema.sh` kräver därför minst en policy
-- per tabell, och den här raden är svaret på den frågan — inte ett kryphål.
--
-- Restaurangen får LÄSA sin egen kö, och ingenting mer.
--
-- Första utkastet sa nej till alla — kön är ju jobbets. Svepet i
-- `verify-schema-tests.sql` sa emot, och hade rätt: varje tabell med
-- `restaurant_id` ska vara läsbar för sin egen restaurang, annars är
-- restaurant_id-kolumnen en filtrering ingen kan använda.
--
-- Det läcker heller ingenting. Raden bär order-id, sort och mottagarens
-- användar-id — och ägaren ser redan `orders.guest_id` för samma order. Det
-- den svarar på är "gick brevet ut?", vilket är en supportfråga restaurangen
-- kommer att ställa.
--
-- Ingen får skriva. Kön skrivs av triggern och kvitteras av
-- `mark_notice_sent`, båda SECURITY DEFINER — och jobbet som anropar dem kör
-- med service role.
alter table public.notification_outbox enable row level security;

create policy notification_outbox_read_own on public.notification_outbox
  for select to authenticated
  using (public.is_staff_of(restaurant_id));

grant select on public.notification_outbox to anon, authenticated;

comment on table public.notification_outbox is
  'Kö för notiser till gästen. Skrivs av en trigger i samma transaktion som statusändringen och töms av /api/jobs/send-notices. Policyn säger nej till alla — bara service role når tabellen.';

/* ── Triggern ────────────────────────────────────────────────────────────── */

create or replace function public.enqueue_order_notice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.notification_kind;
begin
  -- Bara vid en faktisk övergång. En update som rör priset ska inte köa ett
  -- brev om att maten är klar.
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_kind := case new.status
    when 'ACCEPTED' then 'ORDER_ACCEPTED'::public.notification_kind
    when 'READY'    then 'ORDER_READY'::public.notification_kind
  end;

  if v_kind is null then
    return new;
  end if;

  /*
   * Vem som INTE får ett brev, och varför.
   *
   * Utan gästkonto finns ingen adress. Den anonyma bordsbeställningen ska
   * förbli kontolös — det är hela poängen med QR-flödet — och en notis som
   * kräver ett konto får aldrig bli skälet att införa ett.
   *
   * Bordsgästen får heller inget även om hon har konto. Hon sitter vid bordet
   * med kvittosidan öppen, och den uppdaterar sig var tionde sekund. Ett brev
   * till någon som redan ser svaret är skräppost.
   *
   * Kvar är avhämtningsgästen: hon har konto, hon har gått därifrån, och hon
   * är den enda som inte kan veta.
   */
  if new.guest_id is null or new.type <> 'PICKUP' then
    return new;
  end if;

  insert into public.notification_outbox (restaurant_id, order_id, kind, recipient_id)
  values (new.restaurant_id, new.id, v_kind, new.guest_id)
  -- Skulle raden redan finnas är brevet redan köat eller skickat. Att inte
  -- göra något är rätt svar; att kasta hade avbrutit statusändringen, och en
  -- order som inte kan gå vidare för att ett brev krånglar är fel prioritering.
  on conflict (order_id, kind) do nothing;

  return new;
end;
$$;

comment on function public.enqueue_order_notice is
  'Köar en notis till gästen när ordern tas emot eller blir klar. Bara avhämtning med gästkonto — bordsgästen har kvittosidan framför sig, och den anonyma har inget konto.';

-- AFTER och inte BEFORE: raden ska vara skriven innan notisen köas. En BEFORE
-- hade kunnat köa ett brev om en status som en senare trigger avvisar.
create trigger orders_enqueue_notice
  after update of status on public.orders
  for each row
  execute function public.enqueue_order_notice();

/* ── Vad jobbet får göra ─────────────────────────────────────────────────── */
--
-- Kvitteringen ligger som en funktion i stället för en update från appen, av
-- samma skäl som resten: `sent_at` ska bara kunna sättas framåt. En rad som
-- kvitteras två gånger är ett brev som skickats två gånger, och den enda som
-- märker det är gästen.
create or replace function public.mark_notice_sent(p_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_outbox
  set attempts   = attempts + 1,
      last_error = p_error,
      -- Ett fel räknas som ett försök men inte som skickat. Nästa körning tar
      -- raden igen — och `attempts` gör det synligt när den aldrig går fram.
      sent_at    = case when p_error is null then coalesce(sent_at, now()) else sent_at end
  where id = p_id;
end;
$$;

-- Bara jobbet får kvittera. En anställd som kunde sätta `sent_at` hade kunnat
-- tysta ett brev till en gäst; en gäst som kunde det hade kunnat tysta sitt eget.
--
-- `revoke från public` räcker inte ensamt: det tar bort standardrättigheten för
-- ALLA, service_role inkluderad, och funktionen blir omöjlig att anropa. Kön
-- fylldes då på utan att någonsin tömmas — och tyst, eftersom anroparen inte
-- läste felet. Båda halvorna rättade 2026-08-22 innan de hann bli produktion.
revoke execute on function public.mark_notice_sent(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_notice_sent(uuid, text) to service_role;

revoke execute on function public.enqueue_order_notice() from public, anon, authenticated;
