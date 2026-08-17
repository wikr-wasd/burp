# Att göra

Listan följs uppifrån. Flytta en rad till **Klart** först när den är verifierad
enligt `CLAUDE.md` — inte när koden är skriven.

En rad som blockeras av ett beslut ligger kvar under **Väntar på beslut** tills
beslutet är fattat. Att bygga vidare på en gissning är hur man bygger fel sak
snabbt.

---

## Var vi står

Senast uppdaterad **2026-08-17**, branch `dev`.

Fas 1 är byggd i sin helhet. Produkten går att använda rakt igenom: en gäst
skannar en dekal, beställer vid bordet, ser sin nota och sin orderstatus;
köket ser beställningen och får dessutom ett brev om den; personalen kvitterar
betalningen i kassan. Allt utom kortbetalning fungerar, och kortbetalning är
blockerad av ett beslut, inte av kod.

Kartsidan `/upptack` är byggd — det första steget in i Fas 2. Den fungerar, men
kartrutorna kommer tills vidare från OpenStreetMaps egna servrar, vilket inte
är tillåtet för en publik tjänst. Se öppen fråga 8.

Det som återstår är i tur och ordning:

1. **Fyra beslut** som ligger hos William (nedan). Två av dem blockerar
   lansering, ett blockerar kartsidan.
2. **Att se produkten på riktig hårdvara** — telefon och surfplatta. Byggd för
   båda, provad på ingen.
3. Resten av Fas 2 och framåt: surfplatta vid bordet, mobilapp.

### Två spärrar som gäller varje session

Båda står utförligt i `CLAUDE.md`, men de kostar tid varje gång de glöms:

- **`smoke.sh` går inte att köra på den här maskinen.** `bash` är WSL2, inte
  Git Bash, och WSL2:s loopback är inte Windows. `curl` svarar `000` på varje
  rad medan appen svarar 200 — det ser ut som att hela appen ligger nere.
  Windows-`curl.exe` når appen och används i stället.
- **Öppna appen på `localhost`, aldrig på `127.0.0.1`.** Next 16 blockerar
  `/_next/`-resurser för värdar som inte står i `allowedDevOrigins`. Sidan
  renderas och svarar 200, men hydrerar aldrig — ingenting är klickbart, och
  det enda som säger varför är en varning i dev-serverns egen logg.
- **Claude skriver inte in lösenord i formulär**, inte ens seedens. Allt bakom
  inloggning — dashboard, kassa, backoffice — är därför verifierat med
  typkontroll, lint, test, bygge och direkta SQL-körningar mot RLS, men aldrig
  sett i en webbläsare. Raderna nedan säger vilka det gäller.

RLS går däremot att testa utan inloggning: `request.jwt.claims` kan sättas i
psql, så policyerna kan köras som vilken användare som helst. Det gjordes för
migration 0024 och är mönstret att följa för nästa.

---

## Väntar på beslut — William

Ingenting går vidare här utan svar.

- [ ] **Betalväg.** `OPEN-QUESTIONS.md` fråga 5. **Blockerar lansering av
      kortbetalning.** Det svåra är utbetalningar till restauranger i Bosnien
      och Serbien, som ligger utanför EU/EES — inte att ta emot kort. Fråga 6 är
      besvarad (gästen ska kunna betala i plattformen), men den raden kan inte
      byggas förrän den här har ett svar. Betalning på plats fungerar idag och
      är möjligen rätt v1; det avgör om frågan blockerar lansering eller bara
      intäktsmodellen.
- [ ] **Fiskalisering.** `OPEN-QUESTIONS.md` fråga 4. **Kan blockera lansering
      helt.** Kroatien och Serbien kräver realtidsrapportering av kvitton. Tre
      länder, tre lokala jurister.
- [ ] **Supabase och Vercel i molnet.** Kräver din inloggning. Supabase-orgen
      har två projektplatser på gratisnivån och båda är upptagna av 123Connect —
      antingen uppgradering eller ett frigjort projekt.
- [ ] **Kartleverantör.** `OPEN-QUESTIONS.md` fråga 8. **Blockerar lansering av
      `/upptack`.** Sidan är byggd och fungerar; det som saknas är ett konto
      hos någon som får leverera kartrutor. OSM:s egna servrar, som är
      standardvärdet, tillåter inte publika tjänster. Bytet är två
      miljövariabler och ingen kod. MapTiler är förstahandsförslaget — deras
      gratisnivå räcker, och en egen stil kan rita bort blått.
- [ ] **Ska en QR-gäst kunna välja "ta med"?** Följdfråga ur jämförelsen med
      Qopla. De frågar det före menyn, vilket är fel läge för någon som just
      satt sig vid ett bord — men frågan i sig är rimlig för en ćevabdžinica.
      Kräver ett beslut, inte kod: `orders.type` har redan `PICKUP`.
- [ ] **Avsändaradress för notiserna.** Brev skickas när `RESEND_API_KEY` och
      `NOTIFY_FROM` är satta; utan dem skrivs de bara i loggen. Avsändaren
      måste ligga på en domän som är verifierad hos leverantören, och
      `BURP_OPS_EMAIL` avgör vem hos Burp som får restaurangansökningarna.
      Kräver inloggning, inte kod.

---

## Näst på tur

- [ ] **Push, inte bara e-post.** Brevet går fram, men en inkorg är inget
      larm. Köket behöver något som låter. Kräver ett beslut om bäraren:
      webbpush i PWA:n, eller vänta på mobilappen i Fas 3.
- [ ] **Mobilvyn sedd på riktigt.** Verifierad strukturellt (inget element utan
      radbrytning är bredare än 390 px) men aldrig sedd på en telefon.
      QR-flödet lever på telefon och har högst kvalitetskrav i produkten.
- [ ] **Köksskärmen på en surfplatta.** Byggd för det, aldrig provad på en.
- [ ] **Backoffice genomgången i webbläsaren.** Översikt, restauranger, media.
      Påbörjad men inte gjord: utloggningen kräver POST, så ett tidigare
      kontobyte tog inte och fel roll granskades. Logga in som `burp@burp.test`
      via formuläret, inte genom att navigera till `/logga-ut`.
      **Behöver göras av William** — se spärren om lösenord ovan.
- [ ] **Kassan och personalytornas tomma tillstånd sedda i webbläsaren.**
      Samma spärr. Logga in som `agare@burp.test` och gå till Kassa. Det som
      behöver ögon är om beloppsfältet och avvikelseraden känns rätt i handen —
      att reglerna håller är mätt mot databasen.
- [ ] **Riktiga bilder i seed-datan.** Platshållaren är så bra den kan bli;
      nästa steg kräver fotografier. Utan dem går det inte att bedöma hur
      sajten faktiskt ser ut för en gäst.

### Fas 2 och framåt

- [ ] **Surfplatta vid bordet.** Beslutad. Delar mycket med QR-flödet.
- [ ] **Mobilapp (React Native).** Beslutad. `@burp/core` är byggt för att
      delas och importerar aldrig något runtime-beroende.

---

## Kända begränsningar

Medvetna luckor, inte buggar. Var och en ska åtgärdas före sin fas.

| Vad | Var | Före |
|---|---|---|
| Rate limiter i processminnet — fungerar inte över flera Vercel-instanser | `lib/rate-limit.ts` | Fas 2 live |
| Öppettider stödjer inte pass över midnatt | `is_restaurant_open()`, migration 0004 | Nattöppet |
| Ingen kortbetalning — bara kontant kan registreras | Öppen fråga 5 | Fas 1 |
| Betalning per order, inte per bordssällskap | `payments.order_id` är `not null` | Kräver schemaändring om gemensam nota per bord ska finnas |
| Ingen GDPR-export eller radering | — | Fas 4 |
| Personalytorna är enbart svenska | — | Medvetet. Köket ska inte byta språk för att en gäst gjorde det |
| `<html lang>` följer inte språksegmentet | `app/layout.tsx` | Next tillåter ett `<html>`, och det ligger utanför segmentet. Språket märks på ett omslutande element i stället |
| Inga laddningsskelett på publika sidor | — | `loading.tsx` gör varje `notFound()` till en 200:a. Se CLAUDE.md |
| `smoke.sh` går inte att köra på den här maskinen | `bash` är WSL2, inte Git Bash | Kräver Git Bash eller en miljö som delar Windows nätverksstack. Se CLAUDE.md |
| Kartrutorna hämtas från OSM:s egna servrar | `NEXT_PUBLIC_MAP_TILE_URL` | Lansering av `/upptack`. Öppen fråga 8 |
| `is_restaurant_open()` räknar i `Europe/Stockholm` oavsett land | Migration 0004 | Ofarligt idag — BA, HR, RS och SE ligger alla i CET. Bryter mot regel 9 och måste läsa restaurangens land innan en marknad utanför CET tillkommer |
| Notiser går bara som e-post | `lib/notify/` | Köket behöver något som låter. Kräver ett beslut om bäraren |

---

## Klart

### Fas 1 — grunden

- [x] Monorepo, `@burp/core`, Next.js-app, Supabase-migrationer med RLS
- [x] QR-beställning vid bordet — meny, varukorg, kassa, kvitto
- [x] Orderns livscykel, statusmaskin, orderredigering för gästen
- [x] Köksskärm, dashboard, menyhantering, bordshantering, statistik
- [x] Backoffice för plattformen, mediamoderering
- [x] Kundpanel, lojalitetspoäng, omdömen med restaurangsvar
- [x] Google-synlighet: sitemap med hreflang, robots, landningssidor per stad
      och kök, schema.org med öppettider
- [x] Egen 404 och felsida
- [x] Schemalagd tillgänglighet (`item_availability`) — skrivning, läsning
      **och** kontroll i API:t
- [x] **Notiser.** Restaurangen får ett brev när en order kommer in, och Burp
      när någon ansöker via `/anslut`. Brevet bär allt köket behöver för att
      agera utan att logga in. Skickas via `after()`, efter svaret — gästen ska
      inte vänta på ett API-anrop för att få veta att beställningen gick
      igenom, och en order faller aldrig för att en notis inte kunde skickas.
      Utan `RESEND_API_KEY` skrivs brevet i loggen i stället

### Fas 2 — påbörjad

- [x] **Karta över alla restauranger** (`/upptack`). Karta och lista sida vid
      sida, filter på kök, stad och öppet nu, sortering på betyg eller namn.
      Listan renderas på servern och är indexerbar; kartan är det enda som
      kräver en webbläsare. "Öppet nu" frågar databasen (`open_restaurant_ids`,
      migration 0025) i stället för att räkna om öppettiderna i TypeScript —
      två svar på samma fråga glider isär, och den dagen visar listan öppet
      medan beställningen nekas.
      **Rutorna behöver en leverantör före lansering** — öppen fråga 8

### Marknad och språk

- [x] **Land och valuta per restaurang** — BA, HR, RS, SE. Valutan fryses på
      ordern; belopp från olika valutor summeras aldrig
- [x] **Två språk** — svenska och engelska. Språket i URL:en för indexerade
      ytor, via `Accept-Language` för QR och kvitton
- [x] **Restaurangens egen sida**, redigerbar av restaurangen: presentation,
      bild, kökstyper, prisklass, adress, kartnål
- [x] **Kartor** — Google Maps, Apple Kartor, Waze, plus inbäddad OSM-karta
- [x] **Restaurangansökan** — `/anslut` för restauranger, "Lägg upp en
      restaurang" i backoffice för Burp

### Pengar

- [x] **Kassan** (`/dashboard/kassa`). Slutförda order från det senaste dygnet,
      delade i att kvittera och kvitterat. Personalen skriver in vad som
      faktiskt togs emot; avvikelsen mot notan räknas ut och visas innan man
      trycker, eftersom avrundning och rabatt i lokalen ska synas och inte
      stoppas. Spärrarna ligger i databasen (migration 0024): en kontantrad per
      order, ingen UPDATE, ingen DELETE. Policyerna körda direkt mot databasen,
      tretton fall. **Inte sedd i webbläsaren.**
- [x] **Avgiftsunderlaget avgjort** — `GROSS_ITEMS`, kortavgiften ovanpå.
      `OPEN-QUESTIONS.md` fråga 1, besvarad 2026-08-16.

### Design och form

- [x] **Ett designspråk** i hela produkten, med mätt kontrast. 123Connects
      tokens; startsida, stadssida, kökssida, restaurangsida, QR-meny, kvitton,
      kontosidor, dashboard och backoffice. Köksskärmen står utanför med flit —
      stora träffytor på några meters håll
- [x] **Ikoner där de bär betydelse.** Sökknapp, betyg, öppetmärken,
      vägbeskrivning, kopiera adress, personalytornas navigering, varukorgen,
      QR-menyns sökruta, kvittots statussteg och samtliga tomma tillstånd. De
      tomma tillstånden delar en byggsten (`EmptyState`) i stället för att vara
      en grå mening formulerad på nio olika sätt
- [x] **Platshållarbilderna i takt med paletten.** Två toner ströks: rödbetan
      var i praktiken magenta, vilket designspråket förbjuder, och tomaten låg
      så nära handlingsfärgen att en tallrik läste som en stor knapp

### QR-menyn mätt mot Qopla

Referens: `qopla.com/restaurant/partille-sushi/…/order?qr=1`.

- [x] **Sökruta** i menyn, från tio rätter och uppåt. Diakriterna viks bort åt
      båda håll — "cevapi" hittar "Ćevapi", "kottfars" hittar "köttfärsbiff"
- [x] **Markerad avdelning** i den klistrade raden, så att den är en
      positionsvisare och inte bara genvägar
- [x] **Prisintervall** — "Från 16,00 KM" när ett obligatoriskt val kan höja
      priset. Räknas i `@burp/core`, aldrig i komponenten
- [x] **Kvittens på kortet** när en rätt läggs till, plus en uppläst rad för
      den som inte ser skärmen
- [x] **Meny i seed-datan som går att bedöma.** Tre rätter räckte inte:
      kategorinavigeringen hade inget att navigera i, sökrutan visades aldrig
      och inget slutsålt kort syntes. Nu 27 rätter i sex avdelningar, en
      obligatorisk storleksgrupp och en slutsåld dryck

### Genomgångar i webbläsaren

- [x] **Personalytorna sida för sida.** Hittade två fel: sju ifyllda röda
      veckodagsknappar, och en navigering som markerade "Order" på varje
      undersida
- [x] **Gästytorna** — startsida, QR-meny, kvitto. Hittade två oöversatta ytor:
      bordskvittot skrev "Mat och dryck" och "Dricks" på svenska mitt i en sida
      som väljer språk på `Accept-Language`, och omdömeslistan var helsvensk på
      den engelska restaurangsidan, som Google indexerar
