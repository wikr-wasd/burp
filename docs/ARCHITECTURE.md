# Burp — systemarkitektur

Version 0.1 · underlag för bygge

---

## 0. Var arkitekturen finns i koden

| Avsnitt | Status | Var |
|---|---|---|
| 2 Teknikval | Byggt | `apps/web`, `packages/core`, `supabase/` |
| 3 Datamodell | Byggt och verifierat mot riktig Postgres | `supabase/migrations/0001`–`0010`, `scripts/verify-schema.sh` |
| 4 QR vid bordet | Byggt — meny, varukorg, kassa och kvitto | `packages/core/src/qr.ts`, `apps/web/src/lib/table-session.ts`, `apps/web/src/app/t/[token]` |
| 5 Orderns livscykel | Byggt | `packages/core/src/order-status.ts`, `order-policy.ts`, migration `0010` |
| 6 Betalning och avgifter | Delvis — schema klart, leverantör obeslutad | `supabase/migrations/0006`, `packages/core/src/pricing.ts` |
| 7 Rating | Schema och triggers klart, UI saknas | `supabase/migrations/0007`, `0010` |
| 8 Media | Schema klart, uppladdning saknas | `supabase/migrations/0008` |
| 9 SEO | Grund byggd | `apps/web/src/app/r/[city]/[slug]`, `src/lib/seo/jsonld.ts` |
| 10 Lojalitet | Logik och schema klart, UI saknas | `packages/core/src/loyalty.ts`, migration `0007` |
| 11 Dashboard | Ej byggt | Fas 1 |
| 12 Säkerhet | Byggt | `supabase/migrations/0009`, `apps/web/src/lib/rate-limit.ts`, `proxy.ts` |

Öppna frågor som blockerar: se [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md).

---

## 1. Översikt

Burp är en plattform i tre delar:

1. **Gästytor** — appen, webbappen och QR-beställning vid bordet
2. **Restaurangytor** — dashboard för meny, order, kampanjer och media plus en köksskärm
3. **Burp backoffice** — onboarding, avtal, utbetalningar, support och marknadsföring

Allt kör mot samma backend och samma databas. Appen och webben delar affärslogik
via `@burp/core` så att en gäst kan börja i webben och fortsätta i appen utan att
tappa sin order.

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Mobilapp    │  │  Webbapp     │  │ QR vid bord  │  │ Restaurang-  │
│ iOS/Android  │  │  PWA         │  │ (ingen app)  │  │ dashboard    │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       └─────────────────┴────────┬────────┴─────────────────┘
                                  │  HTTPS / REST + Realtime
                          ┌───────▼────────┐
                          │   API-lager    │
                          │  (Next.js API  │
                          │  + Edge Funcs) │
                          └───────┬────────┘
                                  │
        ┌──────────────┬──────────┼──────────┬──────────────┐
        │              │          │          │              │
  ┌─────▼─────┐ ┌──────▼────┐ ┌───▼────┐ ┌───▼─────┐ ┌──────▼─────┐
  │ Postgres  │ │  Storage  │ │Betal-  │ │ Push/   │ │  Sök &     │
  │ (Supabase)│ │ bild/video│ │leverantör│SMS/mail│ │  geo       │
  └───────────┘ └───────────┘ └────────┘ └─────────┘ └────────────┘
                                  │
                          ┌───────▼────────┐
                          │  Köksskärm KDS │
                          │  (realtid)     │
                          └────────────────┘
```

---

## 2. Teknikval

| Del | Val | Motivering |
|---|---|---|
| Mobilapp | React Native med Expo | En kodbas för iOS och Android. Delar TypeScript-typer med webben |
| Webb / PWA | Next.js App Router | Server-renderat för SEO. Fungerar som webbapp utan nedladdning |
| Backend | Next.js Route Handlers + Supabase Edge Functions | Håller ihop stacken. Edge Functions för webhooks och tunga jobb |
| Databas | Postgres via Supabase | Row Level Security ger säker multi-tenant utan eget auth-lager |
| Realtid | Supabase Realtime | Orderstatus till gäst och kök utan polling |
| Filer | Supabase Storage + CDN | Bilder direkt. Video via separat videotjänst, se 8.2 |
| Auth | Supabase Auth | E-post, BankID-alternativ, SMS och Apple/Google-inlogg |
| Betalning | Se avsnitt 6 | Kräver beslut innan bygge |
| Hosting | Vercel | Naturligt för Next.js. Edge-nära för snabba QR-laddningar |

Delat paket `@burp/core` med typer, valideringsscheman, prisberäkning och
orderregler så att app, webb och backend räknar likadant.

**Faktiska versioner:** Next.js 16 (App Router, Turbopack), React 19,
TypeScript 5.9, Postgres 17, Tailwind 4, Zod 4, Vitest 4.

---

## 3. Datamodell

Kärntabeller i Postgres. Alla rader som tillhör en restaurang bär
`restaurant_id` och skyddas av RLS.

**Konventioner**

- Pengar lagras som `integer` i **öre**. Aldrig `numeric`, aldrig float.
- Procentsatser lagras i **baspunkter**. 340 = 3,40 %.
- Tidsstämplar är `timestamptz`. Sverige har sommartid.
- Priser anges **inklusive moms**; netto och moms räknas fram ur bruttot.

**Restaurang och struktur** — migration `0002`

- `restaurants` — namn, slug, org.nr, adress, geo-punkt, öppettider, status, avtalad avgift
- `locations` — för kedjor med flera enheter
- `tables` — bordsnummer, zon, kapacitet, QR-token, status *(migration `0004`)*
- `staff` — koppling användare till restaurang med roll (ägare, chef, personal, kock)

**Meny** — migration `0003`

- `menus` — namn, giltighetsperiod (lunch, kväll, helg)
- `menu_categories` — sorteringsordning
- `menu_items` — namn, beskrivning, pris, moms, allergener, bild, status
- `option_groups` — t.ex. "Välj storlek", "Tillbehör" med min/max val
- `options` — enskilt val med prispåslag
- `item_availability` — slut för dagen, schemalagd tillgänglighet

**Order** — migration `0005`

- `orders` — restaurang, typ (leverans, avhämtning, bord), status, totalsummor, tidsstämplar
- `order_items` — snapshot av namn och pris vid beställningstillfället
- `order_item_options`
- `order_events` — logg över varje statusändring och ändring gästen gjort
- `table_sessions` — en pågående nota vid ett bord som flera gäster kan lägga till i *(migration `0004`)*

**Pengar** — migration `0006`

- `payments` — belopp, leverantörsreferens, status
- `tips` — dricks separat från ordersumman
- `payouts` — utbetalningar till restaurang
- `fees` — Burps avgift per order
- `register_receipts` — förberedd för kassaregisterintegration, används inte än

**Gäst** — migration `0007`

- `profiles` — namn, kontakt; `addresses` — adresser
- `loyalty_accounts` och `loyalty_transactions` — poäng in och ut
- `reviews` — betyg 1–5, fritext, bild och svar från restaurangen
- `favorites`

**Innehåll** — migration `0008`

- `media` — bild eller video kopplad till restaurang eller rätt med ordning och status

---

## 4. QR-beställning vid bordet

Detta är den del som skiljer Burp från en vanlig matapp. Den ska fungera utan
app, utan inloggning och utan att gästen tänker på tekniken.

### 4.1 Kodens uppbyggnad

Varje bord får en **statisk** QR-kod. Statisk för att koden trycks på en dekal
eller ställs i en hållare och aldrig byts.

```
https://burp.se/t/R7K2M9X4TB
```

Tokenet består av två delar:

- `R7K2M9` — bordets publika id, 6 tecken, slås upp i `tables.qr_public_id`
- `X4TB` — HMAC-SHA256 över de sex första, trunkerad till 4 tecken

Inget restaurang-id eller bordsnummer syns i URL:en. Ingen kan gissa sig till
andra bord eller andra restauranger.

Signaturen gör att servern kan avvisa påhittade koder **utan databasslagning** —
en bot kostar då en HMAC-beräkning i stället för en rundtur till Postgres.

Alfabetet är Crockford Base32 utan I, L, O och U. Tecknen är borta för att koden
ska kunna läsas upp i telefon och skrivas in för hand när kameran krånglar.

*Implementation: `packages/core/src/qr.ts`*

### 4.2 Flödet

1. Gästen skannar och landar på en snabb serverrenderad sida
2. Rate limit på IP, sedan HMAC-verifiering — allt innan databasen rörs
3. Servern slår upp bordet, hämtar restaurang, meny och öppettider
4. Sidan sätter en cookie med `table_session_id`
5. Gästen beställer och betalar direkt i webbläsaren eller lägger på nota
6. Ordern skapas med `table_id` och syns direkt på köksskärmen med bordsnummer
7. Servitören ser i dashboarden vilket bord som beställt vad och när

*Implementation: `apps/web/src/app/t/[token]/page.tsx`,
`apps/web/src/lib/table-session.ts`*

### 4.3 Spårning till bord

`orders.table_id` är den enda kopplingen som behövs. Med den får restaurangen:

- vilka bord som är aktiva just nu
- omsättning per bord och per zon
- tid från beställning till servering per bord
- flera gäster på samma bord som lägger till på samma nota via `table_sessions`

### 4.4 Missbruksskydd

| Skydd | Var |
|---|---|
| Bordet tar bara emot order under öppettid | `is_restaurant_open()`, migration `0004` |
| Bordet kan låsas manuellt från dashboarden | `tables.status = 'LOCKED'` |
| Rate limit per IP på QR-endpoints | `apps/web/src/lib/rate-limit.ts` |
| Ett bord kan bara ha en öppen nota | Unikt partiellt index på `table_sessions` |
| `tables` är inte läsbar för anon | RLS, migration `0009` |

⚠️ Rate limitern ligger i processminnet och räcker inte i produktion — se
kommentaren i filen. Ska bytas mot Redis före Fas 2.

Vid obetald nota krävs betalning innan ny order läggs på samma session
*(ej implementerat — hör till Fas 2)*.

---

## 5. Orderns livscykel och redigering

### 5.1 Statusmaskin

```
DRAFT → PLACED → ACCEPTED → PREPARING → READY → COMPLETED
                     │
                     └──→ CANCELLED / REFUNDED
```

Regeln finns på två ställen: i `@burp/core` för snabb feedback i gränssnittet,
och som trigger i databasen som garanti. En order kan inte hoppa från PLACED
till COMPLETED ens om någon skriver direkt mot databasen.

*Implementation: `packages/core/src/order-status.ts`, migration `0010`*

### 5.2 Restaurangstyrd redigering

Restaurangen bestämmer själv vad gästen får ändra och hur länge. Reglerna ligger
i `restaurants.order_policy` som JSON:

```json
{
  "edit_window_seconds": 120,
  "editable_until_status": "ACCEPTED",
  "allow_add_items": true,
  "allow_remove_items": true,
  "allow_change_options": false,
  "allow_cancel_until_status": "PREPARING",
  "auto_accept": false,
  "prep_time_minutes": 20,
  "allow_scheduled_orders": false
}
```

Reglerna körs på servern. Klienten läser samma regler bara för att visa eller
dölja knappar. Varje ändring skrivs till `order_events` så att det alltid går
att se vem som ändrade vad och när.

Avbokning styrs bara av status, inte av tidsfönstret — en gäst ska kunna avboka
så länge maten inte påbörjats, även efter två minuter.

*Implementation: `packages/core/src/order-policy.ts`*

### 5.3 Schemalagd beställning

`orders.scheduled_for`. Gästen väljer en tid, restaurangen godkänner tidsfönster
i sin dashboard, och ordern släpps automatiskt till köket `prep_time_minutes`
innan hämtning. Restauranger som inte vill ha det stänger av med
`allow_scheduled_orders: false`.

Samma mekanik kan användas för återkommande order — en fast lunch varje tisdag.

*Schema klart. Släppjobbet hör till Fas 4.*

---

## 6. Betalning, avgifter och dricks

Det här är den del som behöver beslutas först eftersom allt annat hänger på den.
Se [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) fråga 1, 5, 6 och 7.

### 6.1 Modell

Burp är en marknadsplats. Pengarna ska landa hos restaurangen och Burps avgift
dras automatiskt. Det görs med en betalleverantör som stödjer delade betalningar
och underkonton: **Stripe Connect**, **Adyen for Platforms** eller **Klarna**.

Vill ni ha **Swish** behöver ni kontrollera vad respektive leverantör stödjer
just nu — det ändras, och det är en fråga att ställa direkt till leverantören.

Schemat är leverantörsneutralt. `payments.provider` + `provider_reference`
räcker för alla tre utan schemaändring.

### 6.2 Avgiften på 3,4 %

Tre saker måste definieras innan bygget: basen, kortavgiftens placering och
dricksens roll. Se öppen fråga 1.

Så här är det byggt i väntan på svar:

- `restaurants.fee_base` väljer underlag: `GROSS_ITEMS`, `NET_ITEMS`, `GROSS_TOTAL`
- `fees` sparar bas, procentsats **och** belopp per order — modellen kan ändras
  utan att historiken skrivs om
- `restaurants.fee_override_bps` för specialavtal
- `fees.provider_fee_ore` finns men fylls inte, i väntan på svaret

### 6.3 Dricks

- Egen rad i `tips`, helt separerad från ordersumman
- Val vid betalning i procent eller fast belopp
- Kan även ges efter måltiden, kopplat till betyget
- Fördelning till personal görs av restaurangen. Burp visar bara beloppet
- Dricks ingår **aldrig** i avgiftsunderlaget

⚠️ Dricks har skatte- och redovisningsregler. Ta det med en revisor innan lansering.

### 6.4 Kassaregister

Sverige har krav på certifierat kassaregister vid försäljning på plats. Hur det
slår mot QR-beställning där gästen betalar i sin egen telefon är inte utrett —
det är en fråga för Skatteverket eller en skattejurist innan ni går live.

Arkitekturen är byggd så att en kassaregisterintegration kan läggas till utan
ombyggnad: `register_receipts` finns i schemat men fylls inte av någon kod.

---

## 7. Rating och recensioner

- Betyg går bara att lämna på en genomförd order. Det stoppar falska recensioner
  — enforcas av trigger, inte bara av en policy
- Separata betyg för mat, leverans och service
- Push eller mail 30 minuter efter `COMPLETED` *(Fas 3)*
- Restaurangen kan svara offentligt men kan inte ändra betyget eller texten
- Snittbetyg cachas på `restaurants` och räknas om av trigger
- Betyg under en tröskel larmar Burp support *(Fas 4)*
- Dricks kopplas naturligt till betygsteget i flödet

---

## 8. Media

### 8.1 Bilder

Laddas upp i dashboarden. Beskärs och komprimeras vid uppladdning. Levereras i
flera storlekar via CDN i AVIF eller WebP. Bilder är det som säljer mat, så
kvaliteten på uppladdningsverktyget spelar roll — beskärningsram, förhandsvisning
och en varning vid dåligt ljus.

### 8.2 Video

Video ska **inte** ligga i vanlig fillagring. Använd en videotjänst som
transkodar och strömmar (Mux, Cloudflare Stream eller motsvarande). Då får ni
adaptiv kvalitet och automatiska miniatyrbilder.

- Korta klipp, 5–20 sekunder
- Autospelas ljudlöst i flödet
- Första bildrutan används som fallback
- Restaurangen kan sätta en video som huvudbild för en rätt

Schemat skiljer på detta: bilder har `storage_path`, video har `provider` +
`provider_asset_id` + `playback_url`. En check-constraint hindrar att en
videorad sparas utan spelbar källa.

### 8.3 Moderering

All media går i status `PENDING` tills den godkänts. Automatisk kontroll först,
manuell granskning i backoffice vid tveksamheter. Bara `APPROVED` är publikt
läsbar enligt RLS.

---

## 9. Synlighet, marknadsföring och SEO

Att gästen hittar restaurangen på Google är ett av era starkaste säljargument.
Det kräver att webbdelen är byggd rätt från början.

### 9.1 Struktur

```
burp.se/r/{stad}/{restaurang-slug}
burp.se/r/{stad}/{restaurang-slug}/meny
burp.se/{stad}/{kök}          ← t.ex. burp.se/malmo/sushi
```

Serverrenderat, inte klientrenderat. Sidorna måste ladda snabbt och innehålla
riktig text.

Sluggen är unik per stad, inte globalt — två städer får ha var sin
"pizzeria-roma". `restaurants.city_slug` är en genererad kolumn så att uppslaget
går via index i stället för en funktion över kolumnen.

*Implementation: `apps/web/src/app/r/[city]/[slug]/page.tsx`. Stads- och
kökssidor hör till Fas 4.*

### 9.2 Strukturerad data

schema.org-markup på varje sida:

- `Restaurant` med adress, öppettider, prisklass och betyg
- `Menu`, `MenuSection` och `MenuItem` med priser
- `AggregateRating` från era egna verifierade recensioner

Det är den markup som kan ge rika resultat i Google. Ingen kan lova placeringar,
men utan markup får ni definitivt inte utrymmet.

`AggregateRating` bygger enbart på betyg kopplade till en genomförd order. Att
publicera betyg som inte går att härleda till ett köp bryter mot Googles
riktlinjer och riskerar en manuell åtgärd mot hela domänen.

*Implementation: `apps/web/src/lib/seo/jsonld.ts`*

### 9.3 Lokalt

- Geo-koordinat per enhet (PostGIS `geography(point)`)
- Stadssidor och kökssidor som landningssidor *(Fas 4)*
- Koppling till restaurangens Google Business Profile där det går
- `hreflang` om ni går utanför Sverige

### 9.4 Kampanjverktyg för Burp

*(Fas 4)*

- Push-segment på stad, kök, tidigare köp och inaktivitet
- Kampanjkoder och kampanjbudget per restaurang
- Sponsrad placering i sökresultat internt i appen — märkt som annons
- Delningslänkar med spårning så att restaurangen ser vad Burp levererar

---

## 10. Lojalitet

- Poäng per spenderad krona. Grundnivå sätts av Burp, restaurangen kan höja
  (men aldrig sänka under grundnivån — enforcas i koden)
- Belöningar: gratis rätt, rabatt eller fri leverans
- Värvningsbonus åt båda håll
- Födelsedagsbelöning
- Poäng har utgångsdatum för att inte bygga upp en evig skuld
- `loyalty_transactions` är en händelselogg. **Saldot räknas fram, aldrig
  lagras.** Det gör att inget kan hamna i otakt

Underlaget för poäng är varukorgen exklusive leverans och dricks — gästen ska
belönas för att köpa mat, inte för att bo långt bort.

⚠️ Bestäm tidigt vem som betalar för en inlöst belöning — Burp, restaurangen
eller delat. Det påverkar hela ekonomin. Se öppen fråga 3.

*Implementation: `packages/core/src/loyalty.ts`, migration `0007`*

---

## 11. Restaurangdashboard

*(Fas 1 — ej byggd)*

- **Order live** — nya order, accept, avvisa, förseningstid
- **Köksskärm** — stor vy för surfplatta med ljudsignal vid ny order och statusknappar
- **Meny** — dra och släpp kategorier, tillvalsgrupper, slut för dagen
- **Bord** — skapa bord, skriv ut QR-koder, se aktiva notor
- **Kampanjer** — deals, happy hour, combo
- **Media** — bilder och video
- **Statistik** — omsättning, snittnota, populära rätter, omsättning per bord, tider
- **Ekonomi** — avgifter, dricks, utbetalningar, underlag för bokföring
- **Inställningar** — öppettider, orderregler, leveranszoner, personal och roller

| Roll | Åtkomst |
|---|---|
| `owner` (ägare) | Allt, inklusive personal och utbetalningar |
| `manager` (chef) | Drift och meny |
| `staff` (personal) | Order och bord |
| `kitchen` (kock) | Bara köksskärmen |

Rollerna är redan enforcade i RLS (migration `0009`) — dashboarden behöver
alltså inte uppfinna sin egen behörighetsmodell.

---

## 12. Säkerhet

| Krav | Status | Var |
|---|---|---|
| RLS på varje tabell, personal ser bara sin restaurang | ✅ | migration `0009` |
| Serverside-validering av alla priser, klienten skickar aldrig pris | ✅ | `POST /api/orders`, `pricing.ts` |
| QR-token slumpade och inte gissningsbara | ✅ | `qr.ts`, HMAC + 32⁶ nyckelrymd |
| Rate limiting på QR-endpoints och orderskapande | ⚠️ | `rate-limit.ts` — i minnet, kräver Redis i prod |
| Idempotensnycklar på betalning | ✅ | `orders.idempotency_key`, `payments.idempotency_key` |
| Loggning av all åtkomst till orderdata | Delvis | `order_events` loggar ändringar, inte läsningar |
| GDPR: dataexport och radering | ❌ | Fas 4 |
| Personuppgiftsbiträdesavtal med varje restaurang | Juridik | — |

**GDPR-designbeslut:** orderrader ska anonymiseras i stället för att raderas —
bokföringslagen kräver att de finns kvar. `order_items` sparar därför
`name_snapshot` utan personuppgifter, och `orders.guest_id` är
`on delete set null` så att ett raderat konto lämnar ordern intakt men
avidentifierad.

**Loggen är oföränderlig.** `order_events` och `loyalty_transactions` har
triggers som blockerar UPDATE och DELETE. Det gäller även service role — en
logg som går att skriva om i efterhand bevisar ingenting.

---

## 13. Byggordning

**Fas 1 — grunden** *(pågår)*
Datamodell ✅, auth, restaurangprofil, meny, webb-beställning för avhämtning,
betalning med avgift, dashboard och köksskärm.

**Fas 2 — bordet**
QR-koder ✅, bordssessioner ✅, meny och kassa vid bordet ✅, dricks ✅,
notor (flera gäster som delar), betyg.

**Fas 3 — appen**
React Native med samma backend. Push. Lojalitet. Favoriter.

**Fas 4 — tillväxt**
Leverans, schemalagd beställning, kampanjverktyg, SEO-sidor och statistik.

**Fas 5 — skala**
Kedjor med flera enheter, kassaregisterintegration, API mot befintliga kassasystem.

Bygg webben först. Den fungerar för alla, kräver ingen appbutiksgranskning och
den är det som ger er Google-trafik. Appen är för återkommande gäster.

---

## 14. Öppna frågor

Se [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md).
