# Att göra

Listan följs uppifrån. Flytta en rad till **Klart** först när den är verifierad
enligt `CLAUDE.md` — inte när koden är skriven.

En rad som blockeras av ett beslut ligger kvar under **Väntar på beslut** tills
beslutet är fattat. Att bygga vidare på en gissning är hur man bygger fel sak
snabbt.

---

## Var vi står

Senast uppdaterad **2026-08-20**, branch `dev`.

Fas 1 är byggd i sin helhet, och **kortbetalning ingår nu**. Produkten går att
använda rakt igenom: en gäst skannar en dekal, beställer vid bordet, betalar med
kort, Apple Pay eller på plats, ser sin nota och sin orderstatus, beställer en
omgång till; köket ser beställningen och får ett brev om den; personalen
kvitterar kontanter i kassan och kan betala tillbaka.

Öppen fråga 5 är besvarad — **restaurangen äger sitt eget inlösenavtal och Burp
håller aldrig gästens pengar.** Det är det som gjorde att kortbetalning kunde
byggas utan betaltjänsttillstånd i Bosnien och Serbien. Stripe-adaptern är klar
och går att köra mot testnycklar; Monri läggs på samma gränssnitt när avtalet
finns.

Dessutom byggt 2026-08-19: omdöme på bordskvittot, kuponger, presentkort,
klippkort, planritning över lokalen och **avräkningen** — den sista delen av
"ta betalt" som var ren kod.

### Byggt 2026-08-20

- **Fem språk på gästytorna** — `bs`, `en`, `de`, `no`, `sv`. Se avsnittet
  *Marknad och språk*.
- **Seeden ritar två salar** åt Željo, femton bord. Planritningen låg färdig men
  osynlig eftersom ingen restaurang i seeden hade en ritning.
- **Fyra bordstillstånd** i stället för tre — `SERVERAS` skildes ut ur
  `BESTALLNING` och är grönt.
- **Zonen på köksbiljetten** — "Bord 6" var en halv adress i en lokal med två
  rum.
- **Rundturen meny ⇄ kvitto** — kvittosidan var en återvändsgränd.

Kartan ligger på STARTSIDAN (`/sv`) sedan den flyttade dit; `/upptack` är en
308 mot den. Den fungerar, men kartrutorna kommer tills vidare från
OpenStreetMaps egna servrar, vilket inte är tillåtet för en publik tjänst. Se
öppen fråga 8.

### Byggt 2026-08-21

- **Personalhanteringen fanns på TVÅ ställen.** `/dashboard/installningar` bar
  en andra uppsättning vid sidan av `/dashboard/personal`, och den skrev
  `staff` direkt med service role — alltså förbi `invite_staff()` (migration
  0046) och därmed förbi `can_grant_role()`, inbjudningarnas token, deras
  utgångstid och möjligheten att återkalla dem. Hierarkiregeln fanns i stället
  som en app-kontroll, vilket är precis den sortens andra kopia som glider
  isär. Den gamla är borttagen; `/dashboard/personal` kunde allt den kunde.

- **Sidfoten fick spaltbredder som följer innehållet.** Fyra lika breda
  spalter gav en fot där Kök bar åtta rader medan Städer bar tre och de två
  kontogrupperna två var — en full spalt och tre nästan tomma bredvid varandra.
  Kök bryts nu i två kolumner med ett smalare mellanrum än spalterna omkring
  (annars läses den andra kolumnen som en femte spalt vars rubrik någon glömt),
  gäst och restaurang delar spalt med var sin rubrik, och båda
  upptäcktslistorna har samma tak på åtta rader med "Alla städer" som
  spill-länk. Fyra block som slutar inom ett par rader från varandra i stället
  för ett som slutar sex rader under de andra.

Det som återstår är i tur och ordning:

1. **Konton och avtal** som ligger hos William (nedan). Inget av det är kod.
2. **Att se produkten på riktig hårdvara** — telefon och surfplatta. Byggd för
   båda, provad på ingen. Planritningens redigerare är byggd för fingrar och
   har aldrig rörts av ett.
3. **Personalytorna talar bara svenska.** Beslutat att de ska översättas, som
   ett steg efter gästytorna. Se *Näst på tur*.
4. Resten av Fas 2 och framåt: surfplatta vid bordet, mobilapp.

### Två spärrar som gäller varje session

Båda står utförligt i `CLAUDE.md`, men de kostar tid varje gång de glöms:

- **`smoke.sh` går att köra här.** Det stod länge motsatsen: att `bash` var WSL2
  och att loopbacken därför inte nådde appen. Skalet är Git Bash (`uname` säger
  `MINGW64 … Msys`) och delar Windows nätverksstack. Det som saknades var
  `/usr/bin` på `PATH` — utan den finns varken `ls` eller `curl`, och det läser
  som ett trasigt skal. Kommandot står i `CLAUDE.md`.
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
      startsidans karta.** Den är byggd och fungerar; det som saknas är ett konto
      hos någon som får leverera kartrutor. OSM:s egna servrar, som är
      standardvärdet, tillåter inte publika tjänster. Bytet är två
      miljövariabler och ingen kod. MapTiler är förstahandsförslaget — deras
      gratisnivå räcker, och en egen stil kan rita bort blått.
- [ ] **Sentry — eller ett medvetet nej.** Beställt 2026-08-21, och
      kontrollerat: inget `@sentry/*`, ingen `instrumentation.ts`, ingen
      `sentry.*.config.ts`. **Ingenting rapporterar fel från produktion i
      dag.** Ett fel i en route handler syns i Vercels logg om någon råkar
      titta, och aldrig annars. Gratisnivån räcker länge; kräver ett konto och
      en DSN i miljön. Bör vara på plats före lansering, inte efter.
- [ ] **123Connect-repot tillgängligt** om säkerhetsjämförelsen ska göras.
      Det ligger inte på den här maskinen. Läs invändningen i *Beställt
      2026-08-21* först: det som är värt att hämta därifrån är praxis, inte
      filer. En kopierad middleware ser rätt ut i en diff och kan tyst stänga
      av det den ser ut att slå på.
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

      Seeden ritar två salar åt Željo — Bašta ute och Unutra inne, femton bord.
      Funktionen låg färdig men **osynlig** i sex veckor eftersom ingen
      restaurang i seeden hade en ritning: `FloorPlanView` returnerar `null`
      utan utplacerade bord, så dashboarden visade tre rutor i ett rutnät.
      Färdig kod som ingen kan se är ett skal ändå.

- [x] **Fyra bordstillstånd, inte tre.** `SERVERAS` skildes ut ur
      `BESTALLNING` och är grönt — samma gröna som köksskärmens ram runt en
      klar biljett. Lagd, mottagen och tillagas betyder alla att servitören
      inte behöver göra något; `READY` betyder att maten står under lampan och
      blir kall. Att måla dem lika gjorde kartan till en lägesbild i stället
      för ett arbetsredskap. `lib/overview.ts`.

- [x] **Zonen på köksbiljetten.** Biljetten skrev bara bordsnumret. Med en sal
      räcker det; med uteservering **och** sal vet inte den som springer ut med
      maten åt vilket håll — och numret ensamt är en halv adress. Zonen står
      intill statusen, så att bordsnumret förblir det största på biljetten.
      `lib/orders.ts`, `components/staff/kitchen-board.tsx`.

- [x] **Köket ser att två biljetter hör till samma bord.** Notan var gemensam
      men maten hölls inte ihop: listan sorterades enbart på `placed_at`, så två
      gäster vid bord 6 kunde få sina biljetter åtskilda av ett annat bords
      order — och ingenting sa att de hörde ihop.

      Kön är nu först in, först ut **på notan** och inte på den enskilda ordern.
      Ett bord tar plats när dess första beställning kom in och en påfyllning
      ärver den platsen. Priset är att ett annat bord kan få vänta på en order
      som lades senare; alternativet är att servera halva sällskapet.

      Regeln ligger i `lib/kitchen-queue.ts` med åtta egna tester — den är en
      produktregel och ska gå att pröva utan att rendera en skärm. Biljetten
      märks "Beställning 1 av 2 på bordet". Seeden flätar bord 6 och 11 med
      flit, annars hade rak FIFO och gruppering sett likadana ut.

- [x] **Rundturen meny ⇄ kvitto.** Kvittosidan var en återvändsgränd utan en
      enda länk: en gäst som ville beställa en omgång till fick skanna dekalen
      på nytt. Nu leder kvittot tillbaka till menyn, och menyn visar en banner
      för den order som är i gång.

      Bannern bygger på bordssessionen och inte på en cookielista, så den
      fungerar även efter en omskanning. `DRAFT` räknas inte — en kortorder som
      aldrig betalades är ingen pågående beställning. Röktestet kontrollerar
      båda riktningarna och att bannern **inte** syns utan session; en cookie
      är gästens att ändra på och får aldrig vara en väg in.

- [x] **Avbryt-rutan i QR-flödet översattes.** "Ja, avbryt" och "Behåll" stod
      kvar som literaler medan resten av rutan kom ur ordboken — en tysk gäst
      fick tysk brödtext och två svenska knappar.

      Fyndet kom av ett svep efter **textnoder i JSX**, inte efter svenska
      tecken. Det tidigare svepet krävde å, ä eller ö, och "Ja, avbryt" har
      inget av dem. En sökning som bara hittar det man redan misstänker hittar
      ingenting nytt.

---

## Beställt 2026-08-21 — Williams lista, genomgången

Sex punkter ur Williams anteckningar, var och en kontrollerad mot koden innan
den fick en plats. **Tre av dem visade sig redan vara byggda** och kräver
ingenting; två är riktiga och nya; en är en fråga och inte en uppgift.

Att skriva upp en punkt som redan är byggd kostar mer än den tid det tar att
bygga om den — nästa läsare tror att funktionen saknas och planerar runt det.
Därför står svaret här och inte bara i ett chattsvar.

### 1. Sidfoten — byggd 2026-08-21

Se *Byggt 2026-08-21* ovan.

### 2. Testa Burp som gäst, i en webbläsare — **bra idé, och den går att göra**

Det här är den enda av punkterna som Claude kan utföra i sin helhet på egen
hand, och skälet är värt att förstå: **gästflödet kräver ingen inloggning.**
Spärren om lösenord gäller dashboard, kassa och backoffice — inte QR-sidan,
menyn, varukorgen, kassan i QR-flödet eller kvittot. Just de ytorna har högst
kvalitetskrav i produkten och är samtidigt de som aldrig setts av ett öga.

`smoke.sh` kör redan 109 kontroller genom samma flöde, men den mäter något
annat. Den svarar på om servern svarar rätt; den svarar inte på om knappen går
att träffa med en tumme, om felmeddelandet betyder något för den som läser det,
eller om det går att förstå var i beställningen man befinner sig. Ett grep av
HTML:en bevisar ingenting — och det gäller ett röktest också.

`node scripts/print-qr-links.mjs` ger länkarna till seed-borden.

### 3. Sentry — **inte installerat**

Kontrollerat: inget `@sentry/*` i någon `package.json`, ingen
`instrumentation.ts`, ingen `sentry.*.config.ts`. Ingenting rapporterar fel
från produktion i dag. Ett fel i en route handler syns i Vercels logg om någon
råkar titta, och aldrig annars.

Det här är värt att göra före lansering och inte efter. Det är dock **ett konto
och ett beslut**, inte ren kod — se *Väntar på beslut*.

### 4. Säkerhetsjämförelse mot 123Connect — **kan inte göras här, och bör göras annorlunda**

123Connect-repot ligger inte på den här maskinen. Sökning under
`C:\Users\wikr\` och `C:\Users\wikr\.claude\` ger ingen träff. Punkten är
alltså blockerad tills repot finns tillgängligt.

**Men invändningen är viktigare än blockeringen.** Att kopiera säkerhetskod
mellan projekt är hur man ärver någon annans felkonfiguration. En kopierad
middleware, en kopierad CSP eller en kopierad rate limiter ser rätt ut i en
diff och kan tyst stänga av det den ser ut att slå på — och Burp har redan haft
exakt den klassen av fel: RLS utan GRANT var verkningslös policy som såg
komplett ut. Det som är värt att hämta från 123Connect är **praxis och
checklistor**, inte filer: vilka rubriker sätts, hur hanteras sessioner, vad
loggas aldrig.

Det som går att göra i dag, utan 123Connect:

- `/security-review` granskar grenens ändringar.
- Supabase `get_advisors` listar saknade RLS-policyer och osäkra funktioner
  direkt mot projektet.
- `scripts/verify-schema.sh` kontrollerar redan RLS **och** GRANT, vilket är
  den kontroll som en gång saknades.

### 5. Bordsbokning online — **bra idé, riktig funktion, och en fälla i mitten**

Passar produkten: restaurangsidan har redan öppettider, borden har zon,
platsantal och koordinater i planritningen, och `country_time_zone()` finns
sedan migration 0033. Det som saknas är tiden.

**Fällan är dubbelbokningen, och den får inte lösas i applikationskoden.**
"Är tiden ledig?" följt av "boka den" är två frågor, och mellan dem hinner en
andra gäst ställa samma första fråga och få samma svar. Klockan sju en fredag
är det inte ett sällsynt sammanträffande utan det normala fallet. Postgres
löser det med en `exclude`-villkorlig över `tstzrange` och `btree_gist`, så att
två överlappande bokningar på samma bord är omöjliga att skriva — samma sorts
regel som triggern på `order_events`, och av samma skäl: den hör till datan och
inte till den som råkar skriva.

Och samma regel som priset: **lediga tider räknas på ett enda ställe.** Två
uträkningar av tillgänglighet glider isär, och då visar sidan en tid som
bokningen sedan nekar. Öppettiderna har redan gjort den resan en gång —
`open_restaurant_ids` (migration 0025) finns just därför att listan och
beställningen inte fick svara olika på om restaurangen var öppen.

Kvarstår att bestämma innan något byggs: hur bokade bord samspelar med
gäster som kommer in från gatan och tar samma bord, och vad som händer när
någon inte dyker upp.

### 6. Personalen klickar "betalt" i appen i stället för terminalsynk — **redan byggt**

Migration 0044. `TERMINAL` är en leverantör och inte ett gästval: gästen drar
kortet i restaurangens egen terminal, personalen registrerar beloppet i kassan
efteråt, precis som med kontanter. Kassaavstämningen skiljer på det och sedlar,
vilket var hela poängen — `provider = 'CASH'` måste fortsätta betyda pengar i
lådan.

Det William beskriver är alltså inte ett alternativ till det byggda utan en
beskrivning av det. Att läsa terminalen på riktigt är öppen fråga 14 och kräver
en terminal med moln-API.

### 7. Betala i kassan vid avhämtning — **redan byggt**

Samma växel som vid bordet: "På plats" eller "Med kort", och `MenuOrder` är
samma komponent för `TABLE` och `PICKUP`. Utan kortnycklar visas bara "På
plats", vilket är korrekt beteende och inte ett fel.

Värt att veta inför punkt 8: avhämtning **plus** betala på plats betyder att
maten lagas innan någon betalat. Det är en risk restaurangen tar, inte Burp,
men den bör vara ett val restaurangen kan stänga av.

### 8. Avhämtning med tid och notis — **den mest värdefulla av de nya, och halva grunden finns**

Kontrollerat, och det här var överraskningen: **avhämtning fungerar redan.**
`PICKUP` finns i `order_type` sedan migration 0001, restaurangsidan renderar
`MenuOrder` med `context={{ kind: "PICKUP" }}`, och `pickupSlots` erbjuder
hämttider ur öppettiderna när restaurangen tillåter schemalagda order.

Det som saknas är precis det William pekar på:

- **Gästen får ingen notis alls.** `notifyNewOrder()` skriver till restaurangen
  och `notifyRestaurantApplication()` till Burp. Det finns ingen tredje
  funktion. Gästen får veta att ordern gick igenom på skärmen, och sedan
  ingenting.
- **Push är personalens.** `push_subscriptions` (migration 0036) kräver
  `is_staff_of(restaurant_id)` i sin policy. En gäst kan inte prenumerera.
  Gästnotiser kräver alltså en schemaändring, inte bara en avsändare.
- **Ingen uppskattad tid från personalen.** `pickupSlots` är tider gästen väljer
  i förväg ur öppettiderna. Den som går in och beställer på stående fot väljer
  ingen tid alls, och personalen har inget fält att fylla i.

Williams förslag — att personalen väljer 10/15/20/30 eller övrigt när ordern
tas emot, och att gästen får den siffran och sedan ett andra meddelande när
maten står klar — är det som saknas, och det är billigt i förhållande till vad
det ger. `prep_time_minutes` finns redan som restauranginställning och är
rimlig som förvalt värde i den knappraden.

**En invändning om kanalen.** "Via appen" finns inte än; mobilappen är Fas 3.
Fram till dess är kanalerna webbpush (kräver VAPID-nycklar, som redan står som
en punkt nedan) och e-post (kräver `RESEND_API_KEY`, likaså). Båda kräver att
gästen har ett konto eller lämnar en adress, vilket William också skriver. Det
betyder att avhämtningsnotiser **inte** kan lova något till den anonyma gästen
— och att det är rätt: QR-flödet vid bordet ska förbli kontolöst.

### 9. Makulering och avgift — **en fråga, inte en uppgift**

Vad som gäller i dag, läst ur migration 0039:

- **En avbruten order kostar ingenting.** Avgiftsunderlaget räknar bara order i
  `COMPLETED` och `REFUNDED`. En order som avbryts når aldrig dit och faller ur
  helt.
- **En helt återbetald order krediterar avgiften.**
- **En delåterbetalning gör det inte** — måltiden såldes, gästen satt kvar och
  åt resten. Det är ett fattat beslut och står som öppen fråga 12.
- Migration 0038 lämnar dessutom tillbaka kupong, klippkort och presentkort när
  ordern avbryts, med en trigger och inte i route handlern, eftersom ordern kan
  avbrytas på fyra olika vägar.

Frågan William ställer är alltså inte "vad händer" utan "är det rätt". En
restaurang som makulerar var tredje order kostar Burp pengar i inlösarens
avgifter utan att ge någon intäkt. Det är ett affärsbeslut och läggs som öppen
fråga 15.

---

## Näst på tur

De fem översta är kod och går att börja på direkt. Resten kräver dig, hårdvara
eller ett beslut.

- [ ] **Personalytorna översätts — mekaniken klar 2026-08-21, ytorna kvar.**
      Beslutat 2026-08-19: gästytorna först, personalen sedan.

      **Klart:**

      - `staff.locale` med `set_staff_locale()` (migration 0047). Språket är ett
        val per anställd och läses aldrig ur `Accept-Language`. En funktion och
        inte en policy, därför att `authenticated` har `grant update` på hela
        tabellen: en policy som släppte igenom den egna raden hade låtit kocken
        sätta `role = 'owner'` på sig själv. Bevisat i `verify-schema-tests.sql`.
      - `StaffContext.locale`, upplöst en gång och läst av varje yta — samma
        skäl som landet och valutan ligger där.
      - Språkväljaren i sidomenyn OCH i toppraden, så att kocken och den som
        bara har en telefon når den.
      - Ordbokens `staff`-avsnitt på alla fem språk: navigering, roller,
        orderstatusar och betalsätt.
      - **Sex** svenska etikettabeller borta ur `@burp/core`, inte tre.
        `WEEKDAY_LABELS` stod inte i den här listan och var dessutom en ren
        dubblett av ordbokens `weekday`. `PAYMENT_STATUS_LABELS` och
        `PAYMENT_METHOD_LABELS` var helt oanvända och fick ingen ersättning.
        Kraven som prövades i `payment.test.ts` följde med till `i18n.test.ts`
        och gäller nu fem språk i stället för ett.

      **Översatta ytor:**

      - **Köksskärmen** (`/kok`) och **Order live** (`/dashboard/order`).
        Kocken först med flit: han har bara den ytan, och han är den i hela
        produkten som har minst nytta av svenska.
      - **Kassan** (`/dashboard/kassa`) — kvittering, avvikelser, dricks och
        återbetalning. Den yta där personalen håller i riktiga pengar.
      - **Översikten** (`/dashboard`) och **personalsidan**
        (`/dashboard/personal`).
      - **Inställningarna** (`/dashboard/installningar`) med alla sex
        redigerare: presentation, öppettider, kortbetalning, notiser,
        klippkort och orderregler.

      **Kvar: resten av sidornas innehåll.** Menyredigeraren, bordshanteringen,
      statistiken, omdömena, erbjudandena, presentkorten, avräkningen,
      händelseloggen och hela backoffice. Störst är `menu-editor.tsx` och
      `floor-plan-editor.tsx`. Sex `untranslatedSurface()`-anrop återstår, i
      `installningar/actions.ts`, `personal/actions.ts` och `konto/page.tsx`.

      **Metadata-titlarna står kvar på svenska överallt.** En `metadata`-export
      är statisk och kan inte läsa `staff.locale`; `generateMetadata` skulle
      kosta ett eget databasanrop per rendering. En webbläsarflik på en
      noindex-sida är inte värd den frågan.

      En yta som inte är översatt håller sig **helt** på svenska genom att
      anropa `untranslatedSurface()` i stället för `dictionary(staff.locale)`.
      Skälet är att en svensk mening med ett bosniskt ord i är svårare att läsa
      än vilketdera språket som helst. `grep -rn untranslatedSurface apps/web`
      räknar exakt vad som återstår, och raden försvinner av sig själv när ytan
      blir klar.

      **Landsspråket är med flit inte påslaget än.** `staff.locale` är NULL för
      alla i dag och alla ser svenska, precis som förut — ingens vardag ändras
      utan att hen bett om det. Den ärliga gissningen för någon som inte valt
      är restaurangens land, och den kartan läggs till i samma commit som gör
      den sista ytan färdig. Att flytta en bosnisk restaurang till bosniska nu
      hade gett en bosnisk meny över en svensk sida.

- [ ] **`/anslut` talar bara svenska — och det är värvningssidan.**
      `application-form.tsx` har fälten hårdkodade: Land, Restaurangens namn,
      Gatuadress, Postnummer, Stad, Telefon. Sidan ligger utanför `[locale]`,
      precis som `/konto`, men den väger tyngre: **det är den enda vägen in för
      en restaurang i Sarajevo, Zagreb eller Belgrad.** En restauratör som
      landar på ett svenskt formulär fyller inte i det.

      Till skillnad från `/konto` är den här indexerad och länkad från varje
      sidfot, så `Accept-Language` räcker inte — den behöver in under
      `[locale]` för att kunna hittas på rätt språk i sökresultaten.
      Fynd 2026-08-20.

- [ ] **`/konto`-ytorna talar bara svenska.** `guest-header.tsx`,
      `address-list.tsx`, `review-form.tsx` och `delete-account.tsx` har
      hårdkodade strängar. Till skillnad från QR-flödet är det inte en glömd
      sträng utan en strukturfråga: `/konto` ligger **utanför** `[locale]` och
      har alltså inget språk i adressen alls. Antingen flyttar de in under
      `[locale]`, eller så läser de `Accept-Language` som kvittona gör.
      Ytorna är noindex, så det senare räcker.

- [ ] **Gå igenom gästflödet som gäst, i en webbläsare.** Beställt 2026-08-21.
      Den enda genomgången Claude kan göra utan William: QR-sidan, menyn,
      varukorgen, QR-kassan och kvittot kräver ingen inloggning. Det är också
      de ytor som har högst kvalitetskrav i produkten och som aldrig setts av
      ett öga. `smoke.sh` svarar på om servern svarar rätt, inte på om flödet
      går att förstå. Länkarna till seed-borden ur
      `node scripts/print-qr-links.mjs`; öppna på `localhost`, aldrig
      `127.0.0.1`.

- [ ] **Avhämtning: uppskattad tid från personalen, och notis till gästen.**
      Beställt 2026-08-21. Avhämtning fungerar redan — `PICKUP`,
      `MenuOrder` och `pickupSlots` finns. Tre delar saknas, och den första är
      störst:

      1. **Gästen får ingen notis alls i dag.** Det finns bara
         `notifyNewOrder()` till restaurangen och
         `notifyRestaurantApplication()` till Burp. En tredje väg behövs.
      2. **Push är personalens.** `push_subscriptions` policy kräver
         `is_staff_of(restaurant_id)` — gästprenumeration kräver en migration,
         inte bara en avsändare.
      3. **Personalen har inget tidsfält.** Knappraden 10/15/20/30/övrigt när
         ordern tas emot, med `prep_time_minutes` som förval, och siffran
         vidare till gästen. Sedan ett andra meddelande när maten är klar.

      Kanalen är webbpush eller e-post fram till mobilappen, och båda kräver
      att gästen har konto eller lämnat en adress. Anonym QR-beställning vid
      bordet ska förbli kontolös — avhämtningsnotiser lovar därför ingenting
      till den gästen, och det är rätt.

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
- [ ] **`CRON_SECRET` i produktionsmiljön.** Utan den svarar
      `/api/jobs/expire-loyalty` 503 och poängen bokförs aldrig som utgången.
      Vercel sätter den själv när cron-jobbet läggs upp; lokalt genereras den av
      `node scripts/write-local-env.mjs`. **Kräver dig, inte kod.**
- [ ] **Gällande gallring — hur länge sparas en gäst som slutat?** Öppen fråga
      13. Artikel 5.1 e kräver en gräns; Burp har ingen och raderar inget av sig
      självt. **Kräver ett beslut av dig**, sedan är det ett bakgrundsjobb.
- [ ] **Utloggningsvarningen provad på riktigt.** Trettio minuters väntan per
      försök gör den obekväm att testa; sänk `IDLE_MS` i
      `components/staff/idle-logout.tsx` tillfälligt om du vill se rutan.
      Kontrollera också att köksskärmen INTE loggas ut.
- [ ] **De nya ytorna sedda i webbläsaren.** `/dashboard/avrakning` (ägare och
      chef), `/backoffice/avrakning` (Burp), "Dricks att fördela" överst i Kassa
      och `/konto/uppgifter` (gästen). Beräkningarna är körda mot en riktig
      PostgreSQL, RLS mot fem roller i psql, och export och radering hela vägen
      mot den lokala Supabase-stacken — men ingen har sett sidorna.
      **Behöver göras av William** — se spärren om lösenord.
      Kör `npm run db:demo` först, annars står pengaytorna tomma.
      Raderingen behöver ett engångskonto att prova på; den går inte att ångra.
- [ ] **Bordskartan sedd i webbläsaren.** `/dashboard` som `agare@burp.test`.
      Seeden ritar numera två salar med femton bord, och `db:demo` lägger ett
      pass som pågår så att alla fyra tillstånd syns samtidigt. Det som behöver
      ögon är om **grönt går att skilja från guldgult på en meters håll** —
      härledningen och färgvärdena är verifierade i SQL, men avståndet går inte
      att mäta. **Behöver göras av William.**

- [ ] **Riktiga bilder i seed-datan.** Platshållaren är så bra den kan bli;
      nästa steg kräver fotografier. Utan dem går det inte att bedöma hur
      sajten faktiskt ser ut för en gäst.

### Fas 2 och framåt

- [ ] **Bordsbokning online.** Beställd 2026-08-21. Kalender, tider, och en
      tagen tid som försvinner för nästa gäst. Grunden finns: öppettider,
      bord med zon och platsantal, planritning och `country_time_zone()`.

      **Dubbelbokningen får inte lösas i applikationskoden.** "Är tiden ledig?"
      och "boka den" är två frågor, och mellan dem hinner nästa gäst få samma
      svar på den första. Ett `exclude`-villkor över `tstzrange` med
      `btree_gist` gör två överlappande bokningar på samma bord omöjliga att
      skriva — regeln hör till datan, som triggern på `order_events`.

      **Lediga tider räknas på ett enda ställe**, av samma skäl som priset.
      `open_restaurant_ids` (migration 0025) finns just därför att listan och
      beställningen inte fick svara olika på om restaurangen var öppen.

      Att bestämma före bygget: hur ett bokat bord samspelar med en gäst som
      kommer in från gatan och sätter sig där, och vad som händer vid utebliven
      gäst.

- [ ] **Surfplatta vid bordet.** Beslutad. Delar mycket med QR-flödet.
- [ ] **Mobilapp (React Native).** Beslutad. `@burp/core` är byggt för att
      delas och importerar aldrig något runtime-beroende.

---

## Kända begränsningar

Medvetna luckor, inte buggar. Var och en ska åtgärdas före sin fas.

| Vad | Var | Före |
|---|---|---|
| Rate limiterns reserv räknar per instans när databasen inte svarar | `lib/rate-limit.ts` | Medvetet. Sämre än den delade räknaren men bättre än ingen gräns alls |
| Ingen Monri-adapter — kort i Burps eget flöde fungerar bara där Stripe finns (HR, SE) | `lib/payments/` | Lansering i BA och RS. Kontant och kort i restaurangens egen terminal fungerar under tiden |
| Burp läser inte kortterminalen — beloppet skrivs in av personalen | Migration 0044 | Kräver en terminal med moln-API. Öppen fråga 14 |
| Restaurangen ser inte sina lojalitetsmedlemmar | `loyalty_accounts` saknar policy för personal | Medvetet: den ska inte kunna bläddra i vilka gäster som är med. Ingen kod skapar restaurangbundna konton än — poängen ligger i Burps globala program. Tas i Fas 3 |
| Köksskärmen loggas aldrig ut automatiskt | `/kok` bygger sin egen ram | Medvetet. Den är en tavla som ska stå hela passet; en utloggning mitt i lunchrushen är värre än allt den skyddar mot |
| Återförsöket kräver att sidan är öppen | `components/order/menu-order.tsx` | Medvetet. Background Sync finns inte i Safari på iOS, och QR-flödet är fullt av iPhones — en kö i en service worker hade hjälpt hälften av gästerna och satt en worker framför produktens viktigaste sida. Stänger gästen fliken mitt i en blinkning är beställningen borta |
| Fiskalisering är inte byggd — kvittot är märkt som orderbekräftelse | `register_receipts` är tom | Lansering. Öppen fråga 4 |
| Presentkort är inte juridiskt kontrollerade per land | Migration 0030 | Innan kort säljs skarpt |
| Ingen automatisk gallring — en gäst som slutar använda tjänsten ligger kvar för alltid | — | Kräver ett svar på hur länge. Öppen fråga 13 |
| Personal kan inte radera sig själv genom flödet | `erase_guest()` | Anställningen måste avslutas först; ytan för det saknas |
| Personalytornas sidinnehåll är enbart svenskt | `grep -rn untranslatedSurface apps/web` räknar dem | **Påbörjat 2026-08-21.** Mekaniken är klar — språkval per anställd, ordbokens `staff`-avsnitt, ramen översatt. Kvar är sidornas egen text, ~40 filer. En yta som inte är klar håller sig helt på svenska; en svensk mening med ett bosniskt ord i är sämre än båda |
| Språkvalet syns inte i en webbläsare | `components/staff/language-picker.tsx` | Personalytorna kräver inloggning. Väljaren är bevisad i SQL — funktionen skriver bara `locale`, bara på `auth.uid()`, och kocken kan inte befordra sig själv — men ingen har sett rutan. **Behöver göras av William** |
| `/anslut` talar bara svenska | `components/site/application-form.tsx` | Väger tyngre än `/konto`: det är den enda vägen in för en restaurang på marknaden, och den är indexerad. Behöver in under `[locale]`, inte bara `Accept-Language` |
| `/konto`-ytorna talar bara svenska | `components/guest/` | Strukturfråga, inte glömda strängar: `/konto` ligger utanför `[locale]` och har inget språk i adressen alls. Ytorna är noindex — att läsa `Accept-Language` som kvittona gör räcker |
| `<html lang>` följer inte språksegmentet | `app/layout.tsx` | Next tillåter ett `<html>`, och det ligger utanför segmentet. Språket märks på ett omslutande element i stället |
| Inga laddningsskelett | — | **Granskat 2026-08-20: bör inte byggas.** Se nedan |
| Röktestet strypt av rate limitern vid två körningar i rad | `scripts/smoke.sh` | Inte ett fel. Kontrollerna rapporteras som `hopp`; vänta en minut |
| Kartrutorna hämtas från OSM:s egna servrar | `NEXT_PUBLIC_MAP_TILE_URL` | Lansering av startsidans karta. Öppen fråga 8 |
| Push är byggt men tyst utan VAPID-nycklar | `lib/notify/push.ts` | Nycklarna genereras på en minut, men de måste finnas i miljön |
| Gästen får aldrig en notis — bara restaurangen och Burp | `lib/notify/index.ts` har `notifyNewOrder()` och `notifyRestaurantApplication()`, ingen tredje | Avhämtning. Gästen ser sin status på skärmen och får ingenting när maten är klar |
| Push går inte att prenumerera på som gäst | `push_subscriptions` policy kräver `is_staff_of(restaurant_id)`, migration 0036 | Avhämtningsnotiser. Kräver en migration, inte bara en avsändare |
| Ingenting rapporterar fel från produktion | ingen Sentry, ingen `instrumentation.ts` | Lansering. Ett fel i en route handler syns i Vercels logg om någon råkar titta |
| Kökstyperna i foten står på restaurangens språk på alla fem språkversioner | `listCuisines()` läser `restaurants.cuisines`, fritext | Medvetet så länge fältet är fritext: restaurangens egen text översätts inte. En översatt fot kräver en styrd lista att välja ur, vilket är ett större beslut än foten |
| Push aldrig sedd på en riktig enhet | `components/staff/push-toggle.tsx` | Kräver nycklar, https och en telefon. iPhone kräver dessutom att PWA:n lagts till på hemskärmen |
| En delåterbetalning krediterar inte Burps avgift | Migration 0039 | Beslut, inte lucka. Öppen fråga 12 |
| Avräkningen faktureras för hand — ingen faktura genereras | `settlements.invoice_number` | Fakturan skrivs i Burps bokföring; produkten håller bara underlaget och numret |
| Seeden har inga order alls | `supabase/seed-orders.sql`, `npm run db:demo` | Medvetet skild från seeden. Utan den står Kassa, Statistik, Översikt och Avräkning tomma lokalt. Historiken läggs in en gång per `db:reset`; **passet som pågår** är däremot återkörbart, eftersom `smoke.sh` driver varje aktiv order till `COMPLETED` och därmed tömmer Översikten |

### Laddningsskelett: granskat och avfört 2026-08-20

Raden stod som en lucka att åtgärda. Den granskades och bör inte byggas, av tre
skäl som var för sig räcker:

- **De indexerade sidorna är ISR-cachade.** `/r/{stad}/{slug}`, `/{stad}` och
  `/{stad}/{kok}` har alla `revalidate = 3600` och levereras färdiga. Ett
  skelett hade synts på den första kalla renderingen i timmen och aldrig annars.
- **QR-sidan renderas med flit utan klient-JS för första vyn.** En
  Suspense-gräns byter det: skelettet ligger i HTML:en och innehållet flyttas in
  av ett inline-skript. Med JS av hade gästen fått ett skelett för alltid, på
  produktens viktigaste sida.
- **Kvittot uppdaterar sig redan.** `OrderStatusView` ber servern rendera om var
  tionde sekund och slutar när ordern nått ett slutläge.

Fällan med `loading.tsx` står kvar och är fortfarande sann: en strömmande
respons skickar statusraden innan sidan hunnit anropa `notFound()`, och en mjuk
404:a indexeras av Google. Det som ändras är att luckan inte längre är något att
åtgärda — den är rätt läge.

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
- [x] **Fem språk** — `bs` (bosniska/kroatiska/serbiska i latinsk skrift), `en`,
      `de`, `no` och `sv`. Språket i URL:en för indexerade ytor, via
      `Accept-Language` för QR och kvitton. `hr`, `sr`, `nb` och `nn` är alias
      i headern men inte egna adresser — samma innehåll på två URL:er är
      dubblettinnehåll för Google. `/bs/` märks med `hreflang` för alla tre
      standarderna, annars hittas sidan bara av den som söker på bosniska och
      inte av två tredjedelar av marknaden.

      Gränssnittet översätts. Restaurangens egen text — namn, beskrivningar,
      allergener — står kvar som den skrivits. Etiketten framför allergenerna
      är dock gränssnitt och översätts, eftersom det är det enda stället på
      menyn där oförstådd text är en säkerhetsfråga.
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
- [x] **Personal går att anställa och avsluta** (migration 0046). `staff` har
      funnits sedan 0002 med `invited_by` och allt, och
      `admin_create_restaurant` säger i sin egen kommentar att "ägaren knyts
      senare via personalfliken" — en flik som inte fanns. En restaurang hade
      alltså exakt de konton Burp skapade åt den, och **en uppsagd servitör
      behöll åtkomst till kassan tills någon körde SQL.**
      Hierarkin: ägaren bjuder in vem som helst, chefen bara servitör och kock.
      Chefen kan därmed inte höja någon till sin egen nivå, och inte sig själv
      via en omväg — samma regel gäller för att ÄNDRA en roll, annars kunde hon
      bjuda in en servitör och sedan göra hen till ägare.
      **Den sista ägaren går varken att degradera eller stänga av.** En
      restaurang utan aktiv ägare kan ingen administrera, och felet upptäcks av
      någon som just förlorat sin åtkomst och därför inte kan rätta det.
      Inbjudan är en länk som gäller sju dagar, en gång, och **bara för adressen
      den skickades till** — annars räcker det att länken vidarebefordras för
      att någon ska ta sig in i kassan. Hemligheten lagras som hash;
      `sha256()` och inte pgcrypto:s `digest()`, som ligger i olika scheman i
      testmiljön och hos Supabase och hade fungerat i det ena men inte det
      andra. Länken visas också i gränssnittet, så att en restaurang kan
      anställa någon innan avsändardomänen är verifierad.
      En avslutad anställning stängs av, den raderas aldrig: raden är det som
      kopplar en kvitterad nota till en människa.
- [x] **En glömd surfplatta loggas ut.** Kassan står på en disk och delas av
      flera. Utan spärren är den inloggad tills någon aktivt loggar ut — alltså
      över natten och över helgen, och den som går fram ser gårdagens
      omsättning, kan kvittera notor och, med ägarens konto, betala tillbaka
      pengar.
      Trettio minuter utan att någon rör skärmen, med en minuts varning.
      Kortare blir en plåga under service, och personal som loggas ut var femte
      minut skriver lösenordet på en lapp vid kassan — vilket är sämre än ingen
      utloggning alls. `mousemove` räknas inte som aktivitet: en pekare som
      ligger still över skärmen hade hållit sessionen vid liv i evighet.
      **Köksskärmen berörs inte.** `/kok` bygger sin egen ram och renderar
      aldrig `StaffShell`. Det är avsiktligt: den är en tavla som ska stå på
      hela passet. Burps backoffice har samma vakt — en obevakad skärm där visar
      varje restaurangs omsättning.
- [x] **Vem gjorde vad med pengarna** (migration 0045). Uppgifterna fanns hela
      tiden — `refunds.created_by` säger vem som lämnade tillbaka pengar och
      varför, `order_events.actor_id` vem som avbröt en order — men ingen yta
      visade dem. Skillnaden är mellan att kunna svara på "vem betalade tillbaka
      240 mark i fredags" och att behöva köra en fråga i databasen.
      `/dashboard/handelser` visar återbetalningar och avbrutna beställningar
      med namn, belopp och skäl. Ägare och chef; servitören står med i listan
      men läser den inte.
      Funktionen är SECURITY DEFINER därför att namnet ligger i `profiles`, som
      bara går att läsa om sig själv — och kontrollerar därför rollen SJÄLV med
      samma `has_role_at` som RLS. Alternativet, service role i appen, hade
      flyttat behörigheten till app-lagret.
- [x] **Beställningen ligger kvar och skickas om när nätet är tillbaka.**
      Gästen fick tidigare ett felmeddelande och fick trycka själv. Nu försöker
      appen om av sig själv — på `online`-händelsen och på en klocka som backar
      av från två sekunder till femton, i ungefär två minuter innan den lämnar
      över. Rutan säger att beställningen ligger kvar, vilket är det gästen är
      orolig för.
      **Bara nätverksfel köas.** Ett nej från servern — stängd restaurang,
      ändrat pris, tomt presentkort — visas direkt; att försöka om hade dolt
      beskedet bakom en snurra.
      **Ingen service worker, med flit.** Background Sync hade varit den
      snyggare lösningen men finns inte i Safari på iOS, och QR-flödet är fullt
      av iPhones. `public/sw.js` är dessutom medvetet tom på cachning —
      "ingenting som ligger mellan gästen och sidan". Gästen sitter kvar vid
      bordet med sidan öppen, och ett återförsök i förgrunden täcker det som
      faktiskt händer: en blinkning, en tjock vägg, en källare.
- [x] **En order dubbleras inte när nätet blinkar.** Idempotensnyckeln skapades
      inne i `placeOrder`, alltså på nytt vid varje knapptryck — och
      kommentaren bredvid påstod motsatsen. Serverns skydd var därmed
      verkningslöst: `place_order` slår upp en befintlig order på nyckeln, men
      två försök hade två nycklar och blev två order.
      Fallet är inte dubbelklick, som knappen redan låser. Det är att begäran
      når servern, ordern skrivs, och svaret aldrig kommer fram. Gästen ser
      "ingen anslutning", trycker igen, och restaurangen lagar två måltider
      medan gästen får två notor. Vid ett bord i en källare är det inte ett
      kantfall. Nyckeln hör nu till varukorgen och nollställs när beställningen
      ändras, när ordern gått igenom, eller när ett kortutkast avbryts.
- [x] **Hyresgästsvepet: ingen tabell läcker mellan restauranger.** De tidigare
      RLS-testerna tog en tabell i taget, vilket betyder att en ny tabell är
      oskyddad tills någon kommer ihåg att skriva ett test. Svepet frågar
      katalogen vilka tabeller som bär `restaurant_id` och kontrollerar dem
      allihop — **31 tabeller, varav 24 med data att gömma.**
      Invarianten är inte "B ser inga av A:s rader" utan **"B ser inte mer av A
      än en anonym besökare"**. Menyer, priser och omdömen är publika, och en
      restaurangägare är också vem som helst. Formuleringen fångar det som
      faktiskt är hemligt utan att kräva en undantagslista som någon måste hålla
      aktuell. Svepet kontrollerar dessutom att ägaren SER sina egna rader —
      annars hade en policy som nekar allting räknats som godkänd.
- [x] **Kort i restaurangens egen terminal** (migration 0044). Kassan kunde bara
      registrera KONTANT. En gäst som drog sitt kort i restaurangens egen
      terminal — det enda kortalternativet i Bosnien och Serbien, där Stripe
      inte finns — fick betalningen bokförd som sedlar. Kassaavstämningen,
      avräkningens `cash_ore` och dricksens uppdelning bygger alla på att
      `provider = 'CASH'` betyder pengar i lådan, så alla tre trodde att det
      låg sedlar där som inte fanns.
      Personalen väljer nu betalsätt i Kassan, för en enskild order och för
      bordets gemensamma nota. **Burp läser inte terminalen** — beloppet skrivs
      in av en människa, precis som med kontanter. Vad en riktig integration
      skulle kräva står i öppen fråga 14, och bör frågas i samma samtal som
      Monri-avtalet.
      Fyra spärrar följde med: RLS för både insert och select, kravet på
      tidpunkt, det unika indexet (nu per order OCH betalsätt, så att en nota
      kan delas mellan sedlar och kort) och återbetalningen, som avslutas direkt
      eftersom pengarna lämnas tillbaka i kortläsaren.
      **En regression fångades av ett gammalt test:** att skriva om
      `request_refund` utifrån 0027:s kropp backade tyst 0037:s rättning, så att
      presentkortets värde slutade skrivas tillbaka. Rättat genom att utgå från
      den nuvarande kroppen och ändra en rad.
- [x] **Röktestet går att köra — och hittade två fel direkt.** Diagnosen att
      `bash` var WSL2 var fel; skalet är Git Bash och saknade bara `/usr/bin` på
      `PATH`. Röktestet har alltså aldrig körts här, trots att `CLAUDE.md` säger
      att det är det som avgör om något fungerar. Det kör nu 109 kontroller,
      inklusive de nya ytorna: avräkning, GDPR-export och poängjobbet bakom sin
      nyckel.
      Två fel föll ut. **Städningen av presentkortet kunde aldrig lyckas** —
      `gift_card_transactions` är append-only och avvisar varje DELETE, felet
      försvann i `2>/dev/null`, och kortet från förra körningen låg kvar tömt.
      Testet gick alltså bara att köra mot en färsk databas och rapporterade
      annars ett produktfel som inte fanns. **Och de två alfabetena skiljer sig:**
      presentkortet utesluter 0 och 1, QR-tokenet L och U. Ett kort med en nolla
      i koden gick att skriva in i databasen och kunde sedan aldrig lösas in —
      rättat med en check-constraint i migration 0043.
- [x] **Poängen går faktiskt ut** (migration 0042). `expires_at` sattes på varje
      EARN-rad av 0016 och `EXPIRE` fanns i enumet sedan 0001, men ingen kod
      skrev någonsin en sådan rad. Kundpanelen visade ändå rätt siffra, för
      `calculateBalance()` räknar bort utgångna poster — regeln fanns alltså
      **bara i TypeScript**, och varje annan läsare av loggen hade ett annat
      svar. Det märktes när GDPR-exporten dagen innan rapporterade 700 poäng för
      ett konto som visade 200.
      **Under fixen föll ett värre fel ut.** Saldoregeln drog bort utgången
      poäng två gånger så fort en EXPIRE-rad fanns: en gång av utgångsfiltret
      och en gång av raden. Det syntes aldrig, eftersom det inte fanns några
      EXPIRE-rader — och `loyalty.test.ts` hade skrivit in beteendet som
      avsiktligt med förklaringen att clampningen till noll hindrade ett
      negativt saldo. Första natten jobbet kört hade varje gäst tappat resten av
      sitt saldo. Rättat i både `@burp/core` och databasen, med ett test som
      kräver att siffran är densamma före och efter en körning.
      Jobbet ligger på `/api/jobs/expire-loyalty` bakom `CRON_SECRET` och körs
      04:00 av Vercel Cron (`vercel.json`).
- [x] **GDPR: kopia och radering** (migration 0041). Artikel 15 och 20 ger rätt
      till en maskinläsbar kopia, artikel 17 till radering. Exporten fanns inte,
      och raderingen var inte bara obyggd utan **omöjlig** — fyra oberoende
      spärrar stoppade den, var och en rätt i sig: omdömets krav på en
      avsändare, den oföränderliga lojalitetsloggen, klippkortets append-only,
      och kupongvakten. Kombinationen betydde att en gäst inte kunde lämna.
      **Radering betyder avidentifiering.** Order, betalningar och moms är
      bokföring som måste sparas i sju år; det som ska bort är personen, inte
      affärshändelsen. Efter en radering finns beställningen kvar utan köpare,
      avgiften utan gäst och omdömets betyg utan författare — fritexten och
      bilden är borta. Gränsdragningen står i öppen fråga 13 med vad som krävs
      för att ändra varje rad i den.
      Hela raderingen ligger i en transaktion i databasen. Alternativet — att
      avidentifiera i appen och ta bort kontot i ett andra steg — hade lämnat ett
      läge där omdömet är tömt men kontot finns kvar.
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

### QR-flödet mätt mot Pinchos — 2026-08-20

Pinchos är den närmaste jämförelsen som finns: hela deras koncept är beställning
vid bordet. Skillnaden är att deras beställning kräver en **app och ett konto**,
vilket är precis det Burp finns för att slippa. Genomgången handlade därför om
vilka mekanismer som går att ta, inte om att likna dem.

- [x] **Beställ i omgångar.** Deras kärnmekanik, och den avslöjade en lucka i
      Burps eget flöde: kvittosidan innehöll inte en enda länk. En gäst som
      ville ha en öl till fick skanna dekalen på nytt, trots att
      bordssessionen levde och notan var gemensam. Byggt åt båda hållen —
      kvittot leder till menyn, och menyn visar en pågående beställning.
      Röktestet kontrollerar båda riktningarna **och** att bannern inte syns
      utan session.

- [x] **Alla i sällskapet får maten samtidigt.** Deras löfte, och Burps
      motsvarighet: köksbiljetterna grupperas per bord och kön är först in,
      först ut på notan i stället för på den enskilda ordern. Byggt 2026-08-20,
      se *Klart*.

- [ ] **Notis till gästen när maten är klar** — Pinchos pingar telefonen, Burp
      pollar kvittosidan var tionde sekund. **Avrått tills vidare.** Web push
      kräver en behörighetsdialog, och den skulle dyka upp för en turist som
      just skannat en dekal och inte vet vad Burp är. Det är exakt den friktion
      "utan app, utan konto" finns för att slippa. Pinchos får be om det —
      de har redan en app installerad. Ta upp igen först om pollningen visar
      sig otillräcklig i verklig drift.

- [ ] **Bordsbokning.** Pinchos har det som primär CTA. **Avrått nu.** Det är
      ett eget produktområde — kalender, kapacitet, avbokning, no-shows — och
      inte en del av ett beställningssystem. Konkurrerar med lansering.

Avfört utan åtgärd: quiz i appen.

Redan byggt och därmed inte hämtat härifrån: bordskod som låser upp
beställning (Burp använder HMAC-token, ingenting att skriva av), flera
telefoner mot samma nota, bonussystem (Burp har poäng, klippkort, presentkort
och kupong), restaurangväljare (Burp är en marknadsplats med stad, kök, karta
och omdömen).

### Genomgångar i webbläsaren

- [x] **Personalytorna sida för sida.** Hittade två fel: sju ifyllda röda
      veckodagsknappar, och en navigering som markerade "Order" på varje
      undersida
- [x] **Gästytorna** — startsida, QR-meny, kvitto. Hittade två oöversatta ytor:
      bordskvittot skrev "Mat och dryck" och "Dricks" på svenska mitt i en sida
      som väljer språk på `Accept-Language`, och omdömeslistan var helsvensk på
      den engelska restaurangsidan, som Google indexerar
