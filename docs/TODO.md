# Att göra

Listan följs uppifrån. Flytta en rad till **Klart** först när den är verifierad
enligt `CLAUDE.md` — inte när koden är skriven.

En rad som blockeras av ett beslut ligger kvar under **Väntar på beslut** tills
beslutet är fattat. Att bygga vidare på en gissning är hur man bygger fel sak
snabbt.

---

## Var vi står

Senast uppdaterad **2026-08-19**, branch `dev`.

Fas 1 är byggd i sin helhet, och **kortbetalning ingår nu**. Produkten går att
använda rakt igenom: en gäst skannar en dekal, beställer vid bordet, betalar med
kort, Apple Pay eller på plats, ser sin nota och sin orderstatus; köket ser
beställningen och får ett brev om den; personalen kvitterar kontanter i kassan
och kan betala tillbaka.

Öppen fråga 5 är besvarad — **restaurangen äger sitt eget inlösenavtal och Burp
håller aldrig gästens pengar.** Det är det som gjorde att kortbetalning kunde
byggas utan betaltjänsttillstånd i Bosnien och Serbien. Stripe-adaptern är klar
och går att köra mot testnycklar; Monri läggs på samma gränssnitt när avtalet
finns.

Dessutom byggt 2026-08-19: omdöme på bordskvittot, kuponger, presentkort,
klippkort, planritning över lokalen och **avräkningen** — den sista delen av
"ta betalt" som var ren kod.

Kartsidan `/upptack` fungerar, men kartrutorna kommer tills vidare från
OpenStreetMaps egna servrar, vilket inte är tillåtet för en publik tjänst. Se
öppen fråga 8.

Det som återstår är i tur och ordning:

1. **Konton och avtal** som ligger hos William (nedan). Inget av det är kod.
2. **Att se produkten på riktig hårdvara** — telefon och surfplatta. Byggd för
   båda, provad på ingen. Planritningens redigerare är byggd för fingrar och
   har aldrig rörts av ett.
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

- [ ] **Stripe-konto i testläge.** `STRIPE_SECRET_KEY`,
      `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
      Testnycklar räcker för att köra hela kortflödet — utan dem visar
      QR-kassan bara "betala på plats", vilket är korrekt beteende och inte ett
      fel. Webhooken tar emot på `/api/payments/webhook/stripe`; lokalt via
      `stripe listen --forward-to`.
- [ ] **Monri-avtal för Bosnien och Serbien.** Stripe finns inte där.
      **Fråga dem uttryckligen om fyra saker** — det är de som brukar glömmas
      och de som avgör om lösningen fungerar i praktiken: stödjer de utbetalning
      till företag i BA respektive RS, klarar de **DinaCard** i Serbien, vad
      kostar en utbetalning i **BAM och RSD**, och vem bär växlingen om de
      avräknar i euro. Adaptern läggs på samma gränssnitt som Stripe när avtalet
      finns.
- [ ] **Apple Pay-domän verifierad** hos inlösaren. Knappen dyker inte upp
      förrän det är gjort.
- [ ] **Fiskalisering — skattejurist i tre länder.** `OPEN-QUESTIONS.md`
      fråga 4, nu kartlagd. **Kan blockera lansering helt.** Kroatien kräver
      sedan 2026-01-01 att varje B2C-kvitto rapporteras i realtid oavsett
      betalsätt; Serbien sedan 2022; Bosnien har en ny lag i kraft som börjar
      tillämpas inom 18 månader. Burp fiskaliserar inte — restaurangen har sin
      egen kassa — och kvittot säger numera rakt ut att det inte är ett kvitto.
      Det tar bort den värsta risken men inte frågan.
- [ ] **Jurist: presentkort.** Förbetalt värde hos EN restaurang faller
      normalt under undantaget för begränsade nätverk, men "normalt" är inte
      ett juridiskt besked. Kontrollera per land innan kort säljs skarpt.
- [ ] **Supabase och Vercel i molnet.** Kräver din inloggning. Supabase-orgen
      har två projektplatser på gratisnivån och båda är upptagna av 123Connect —
      antingen uppgradering eller ett frigjort projekt.
- [ ] **Kartleverantör.** `OPEN-QUESTIONS.md` fråga 8. **Blockerar lansering av
      `/upptack`.** Sidan är byggd och fungerar; det som saknas är ett konto
      hos någon som får leverera kartrutor. OSM:s egna servrar, som är
      standardvärdet, tillåter inte publika tjänster. Bytet är två
      miljövariabler och ingen kod. MapTiler är förstahandsförslaget — deras
      gratisnivå räcker, och en egen stil kan rita bort blått.
- [ ] **Avsändaradress för notiserna.** Brev skickas när `RESEND_API_KEY` och
      `NOTIFY_FROM` är satta; utan dem skrivs de bara i loggen. Avsändaren
      måste ligga på en domän som är verifierad hos leverantören, och
      `BURP_OPS_EMAIL` avgör vem hos Burp som får restaurangansökningarna.
      Kräver inloggning, inte kod.

---

## Beställt 2026-08-17 — byggt 2026-08-19

Alla fyra är byggda, verifierade mot en riktig PostgreSQL och committade. Två
avvek från planen och det står varför i respektive commit.

- [x] **Omdöme på bordskvittot.** Frågan ställs när ordern är `COMPLETED`, på
      gästens eget språk. Åtkomsten bevisas med bordssessionen — den ligger i en
      cookie och inte i en JWT, så den går inte att skriva en RLS-policy mot;
      servern verifierar och skriver med service role, som `POST /api/orders`.
      En trigger kräver att det är **ordernas egen** session, annars kunde nästa
      gäst vid samma bord sätta betyg på förra gästens mat. Migration 0028.
- [x] **Kuponger och erbjudanden.** `coupons` + `coupon_redemptions` med RLS.
      Rabatten räknas i `@burp/core`; klienten skickar en kod, aldrig ett
      belopp. Förhandsvisningen (`/api/coupons/preview`) sparar ingenting —
      kupongen tas i anspråk först när ordern läggs, under lås. Migration 0029.
      **Avgiftsunderlaget:** `feeBaseAmount()` drog redan av rabatten, alltså
      räknas 3,4 % efter rabatt och Burp är med och bekostar kampanjen.
      `coupons.funded_by` står på raden så att beslutet kan ändras.
- [x] **Presentkort per restaurang.** Ersatte plånboksidén: förbetalt värde som
      går att lösa in var som helst är utgivning av elektroniska pengar och
      kräver tillstånd. Kortet är **betalmedel och inte rabatt** — ordersumman
      och momsen står orörda, det som sjunker är vad som ska debiteras.
      Migration 0030.
- [x] **Klippkort.** Räknar besök och inte kronor. Antalet lagras aldrig.
      **Avvek från planen:** belöningen blev inte en rad i
      `loyalty_transactions` — tabellen saknar `restaurant_id` och har
      `check (points <> 0)`, och en klippkortsbelöning kostar noll poäng.
      Egen tabell med samma egenskaper i stället. Migration 0031.
- [x] **Bordsplacering.** `floor_plans` + koordinater på `tables`, i
      rutnätsenheter och inte pixlar. Redigeraren använder pointer events så att
      den fungerar med fingrar. Översikten byter till ritningen så fort en
      finns; outplacerade bord ligger kvar som rutor bredvid. Migration 0032.

---

## Näst på tur

- [ ] **VAPID-nycklar.** Push är byggt men skickar ingenting utan nycklar.
      `npx web-push generate-vapid-keys`, sedan `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
      och `VAPID_PRIVATE_KEY` i miljön. Ingen leverantör, ingen kostnad —
      **kräver dig, inte kod.**
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
- [ ] **Sidomenyn och Översikten sedda i webbläsaren.** Personalytan gjordes om
      till sidomeny och fick en ny startsida på `/dashboard`; orderlistan
      flyttade till `/dashboard/order`. Typkontroll, lint och bygge passerar,
      och Översiktens fyra frågor är körda direkt mot databasen som ägaren med
      RLS påslagen — men ingen har sett sidan. **Behöver göras av William.**
- [ ] **Avräkningen och dricksrutan sedda i webbläsaren.** Två nya ytor:
      `/dashboard/avrakning` (ägare och chef) och `/backoffice/avrakning`
      (Burp), plus "Dricks att fördela" överst i Kassa. Beräkningarna är körda
      mot en riktig PostgreSQL och RLS mot fem olika roller i psql, men ingen
      har sett sidorna. **Behöver göras av William** — se spärren om lösenord.
      Kör `npm run db:demo` först, annars står de tomma.
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
| Rate limiterns reserv räknar per instans när databasen inte svarar | `lib/rate-limit.ts` | Medvetet. Sämre än den delade räknaren men bättre än ingen gräns alls |
| Ingen Monri-adapter — kort fungerar bara där Stripe finns (HR, SE) | `lib/payments/` | Lansering i BA och RS. Kontant fungerar under tiden |
| Fiskalisering är inte byggd — kvittot är märkt som orderbekräftelse | `register_receipts` är tom | Lansering. Öppen fråga 4 |
| Presentkort är inte juridiskt kontrollerade per land | Migration 0030 | Innan kort säljs skarpt |
| Ingen GDPR-export eller radering | — | Fas 4 |
| Personalytorna är enbart svenska | — | Medvetet. Köket ska inte byta språk för att en gäst gjorde det |
| `<html lang>` följer inte språksegmentet | `app/layout.tsx` | Next tillåter ett `<html>`, och det ligger utanför segmentet. Språket märks på ett omslutande element i stället |
| Inga laddningsskelett på publika sidor | — | `loading.tsx` gör varje `notFound()` till en 200:a. Se CLAUDE.md |
| `smoke.sh` går inte att köra på den här maskinen | `bash` är WSL2, inte Git Bash | Kräver Git Bash eller en miljö som delar Windows nätverksstack. Se CLAUDE.md |
| Kartrutorna hämtas från OSM:s egna servrar | `NEXT_PUBLIC_MAP_TILE_URL` | Lansering av `/upptack`. Öppen fråga 8 |
| Push är byggt men tyst utan VAPID-nycklar | `lib/notify/push.ts` | Nycklarna genereras på en minut, men de måste finnas i miljön |
| Push aldrig sedd på en riktig enhet | `components/staff/push-toggle.tsx` | Kräver nycklar, https och en telefon. iPhone kräver dessutom att PWA:n lagts till på hemskärmen |
| En delåterbetalning krediterar inte Burps avgift | Migration 0039 | Beslut, inte lucka. Öppen fråga 12 |
| Avräkningen faktureras för hand — ingen faktura genereras | `settlements.invoice_number` | Fakturan skrivs i Burps bokföring; produkten håller bara underlaget och numret |
| Seeden har inga order alls | `supabase/seed-orders.sql`, `npm run db:demo` | Medvetet skild från seeden. Utan den står Kassa, Statistik, Översikt och Avräkning tomma lokalt |

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
- [x] **Kortbetalning** (öppen fråga 5, besvarad 2026-08-19). Restaurangen äger
      sitt eget inlösenavtal; Burp håller aldrig gästens pengar. Ett
      leverantörsneutralt skikt med Stripe-adapter; Monri läggs till på samma
      gränssnitt. Kortordern skapas som `DRAFT` och lyfts av webhooken — köket
      ska aldrig se en obetald order. Migration 0026.
- [x] **Återbetalning** som motbokning i en egen tabell. Beloppet på en
      betalning skrivs aldrig om. Ägare och chef, i kassavyn. Migration 0027.
- [x] **Kassavyn räknar rätt med flera betalmedel.** Den läste förut bara
      kontantrader, så en kortbetald order såg obetald ut och hamnade bland
      notorna att kvittera — personalen hade registrerat kontanter ovanpå en
      betalning som redan gått igenom.
- [x] **Dricksen blir verklig** (migration 0040). `tips` skrevs av
      `place_order` men lästes inte av någon kod — statistiken,
      plattformsöversikten och avräkningen summerade `orders.tip_ore` i stället.
      Två svar på samma fråga, och regel 8 finns just för att dricksen inte ska
      blandas ihop med omsättningen. Fyra fel, alla mätta mot en riktig databas
      innan raden skrevs: **kopplingen till betalningen sattes bara i
      kortflödet**, så efter en kontant kvittering — det vanligaste betalsättet
      i BA och RS — stod `payment_id` kvar som null och frågan "vem betalade in
      den här dricksen" hade inget svar. **En helt återbetald order behöll sin
      dricksrad**; gästen fick tillbaka allt, personalen stod kvar som
      mottagare. **Ett utkast som aldrig betalades behöll sin**, alltså dricks
      på mat ingen fick. Och **raderna gick att skriva om och radera.**
      Kassan visar nu "Dricks att fördela" för det senaste dygnet, delad på
      kontant, kort och notor som inte betalats än. Servitören ser den med
      flit — att låta ägaren ensam se den vore att göra personalens pengar till
      en företagsuppgift.
- [x] **Avräkning: vad restaurangen är skyldig Burp** (migration 0039).
      `payouts` fanns sedan 0006 och ingen kod hade någonsin skrivit eller läst
      den — och den bar dessutom fel modell. Tabellen beskrev en utbetalning
      FRÅN Burp, alltså marknadsplatsupplägget. Svaret på öppen fråga 5 blev
      motsatsen: restaurangen äger sitt eget inlösenavtal, gästens pengar går
      direkt dit, och det enda som rör sig mellan parterna är avgiften — åt
      andra hållet. Ersatt av `settlements`, som är en faktura och inte en
      utbetalning.
      **Perioden räknas i restaurangens egen tidszon.** En kafana som stänger
      efter midnatt hade annars fått sista kvällens order i nästa månads
      faktura. **Överlappande perioder är omöjliga** — en exclusion constraint
      och inte ett unikt index, för det gamla indexet hade släppt igenom
      1–31 augusti bredvid 15–20 augusti och fakturerat sex dagar två gånger.
      Beloppen fryses när avräkningen lämnat utkastet; en felaktig faktura
      makuleras och ersätts, den skrivs inte om.
      Statistiksidans rad "Till utbetalning" byggde på samma gamla modell och
      heter nu "Kvar efter Burps avgift".
- [x] **Delad rate limiter** (migration 0034). Räknaren låg i processminnet, och
      på Vercel har varje serverlös instans sitt eget: en angripare vars anrop
      fördelades över tio instanser fick tio gånger så många försök, och gränsen
      nollställdes vid varje kallstart. Räkningen sker nu atomärt i databasen.
      Planen var Upstash Redis; Postgres gör samma sak, finns redan och **går
      att testa nu** — en Upstash-adapter hade varit otestad kod tills någon
      skaffade ett konto. Räknaren i minnet är kvar som reserv när databasen
      inte svarar.

- [x] **Gemensam nota per bord** (migration 0035). Fyra personer vid samma bord
      beställer var för sig men delar nota — det är hela poängen med att
      sessionen hör till bordet. Kassan visar dem som EN nota och kvitterar dem
      i ett svep; beloppet fördelas per order med största-rest-metoden, så att
      summan av delarna blir exakt det som togs emot. `payments.order_id` är
      fortfarande `not null` — avgiften, momsen och återbetalningen räknas per
      order, och det som saknades var bara att kunna säga att fyra rader kom
      från ett handslag (`settled_together_id`).
- [x] **Bordets nota tar slut.** Under arbetet visade det sig att **ingen kod
      någonsin stängde en session**. Två fel följde, och det andra är
      allvarligt: Översikten visade varje bord som upptaget i evighet, och
      **nästa sällskap vid bordet ärvde förra sällskapets nota** — sessionen är
      det som bevisar åtkomst till ett kvitto, så gäst B kunde läsa gäst A:s
      order. Notan stängs nu när den kvitteras, när personalen stänger den för
      hand, eller av sig själv efter fyra timmars tystnad. Uppslaget flyttade
      dessutom till databasen, vilket samtidigt tog bort en kapplöpning: två
      gäster som skannade samtidigt fick förut en 500:a i stället för en nota.

- [x] **Presentkortets värde försvann vid återbetalning** (migration 0037).
      En återbetald presentkortsbetalning markerades som återbetald men
      ingenting skrev tillbaka värdet: gästen betalade 50 med sitt kort, fick
      notan återbetald på papperet och stod med ett tomt kort. `REFUND` fanns i
      `gift_card_transactions.kind` och räknades av `giftCardBalance()`, men
      ingen kod skrev en sådan rad — precis den sortens halvfärdiga skal
      grundregeln förbjuder. Värdet går tillbaka till KORTET och inte till
      kassan: ett presentkort som går att lösa in mot kontanter är inte längre
      ett begränsat nätverk, och skälet till att Burp får ge ut dem utan
      tillstånd faller.
- [x] **Presentkortet kunde överbetala en order** (migration 0037). Inlösen
      jämförde mot `total_ore` i stället för mot vad som faktiskt återstod, så
      en order som redan hade en betalning kunde betalas två gånger —
      och överskottet fanns ingenstans att hämta.
- [x] **En avbruten order lämnar tillbaka det den tog** (migration 0038). En
      kortorder förbrukar kupong, klippkort och presentkort redan som utkast och
      lyfts först när betalningen bekräftats. Gick betalningen inte igenom
      avbröts ordern — men kupongen var använd, klippkortet uttaget och
      presentkortet tömt, för mat gästen aldrig fick. Rättat med en **trigger**
      och inte i route handlern: ordern kan avbrytas av webhooken, av gästen, av
      personalen och av kupongvägen, och den femte vägen är inte skriven än.
      Loggarna förblir append-only — raden står kvar och får en `released_at`,
      så historiken visar både att kupongen användes och att den lämnades
      tillbaka.

### Notiser

- [x] **Webbpush** (migration 0036). Köksskärmen larmade bara när den var
      öppen; den lilla restaurangen har ingen surfplatta utan en telefon i
      fickan, och brevet hamnar i en inkorg ingen öppnar en fredag kväll.
      Ingen leverantör — VAPID-nycklarna är våra och webbläsarens egen
      pushtjänst gör resten. Meddelandet krypteras med prenumerationens
      nycklar, så varken pushtjänsten eller någon på vägen kan läsa notisen.
      Brev **och** push, inte det ena eller det andra: brevet är underlaget som
      går att gå tillbaka till, pushen är larmet som når fram i samma minut.
      En prenumeration som svarar 404 eller 410 tas bort automatiskt.

### Öppettider

- [x] **Pass över midnatt** (migration 0033). En kafana i Sarajevo eller Beograd
      stänger sällan före tolv. Ett pass där sluttiden ligger före starttiden
      slutar dagen efter: `22:00–02:00` betyder till två på natten. Både
      `is_restaurant_open()` och `isOpenAt()` väger in gårdagens nattpass, och
      överlappskontrollen räknar på en veckolång tidslinje som viker runt —
      fredagens nattpass mot lördagens morgonpass ligger i olika dagsnycklar men
      beskriver samma timmar.
- [x] **Restaurangens egen tidszon** (migration 0033). `is_restaurant_open()`
      räknade i `Europe/Stockholm` oavsett land, vilket bröt mot regel 9.
      Tidszonen kommer nu ur landet via `country_time_zone()`, som speglar
      `COUNTRY_INFO` i `@burp/core` — **ändras den ena måste den andra följa
      med.** Veckodagen läses dessutom med `extract(isodow)` i stället för
      `to_char(..., 'dy')`: det senare påverkas av `lc_time`, och på en server
      med svensk locale hade nyckeln blivit `mån` i stället för `mon`. Då är
      varje restaurang stängd jämt och ingenting säger varför.

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
