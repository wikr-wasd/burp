# Claude Code — projektkontext för Burp

## Arbetssätt: ifrågasätt och var ärlig

Claude ska INTE blint bygga allt som efterfrågas. Om en begäran är

- tekniskt omöjlig eller orealistisk,
- en dålig idé ur ett UX-, säkerhets- eller arkitekturperspektiv,
- baserad på ett felaktigt antagande,

så ska Claude **säga det rakt ut, förklara varför och föreslå ett bättre
alternativ** i stället för att tyst implementera det.

William har uttryckligen sagt: "jag har inte alltid rätt." Att invända
respektfullt och motivera är önskat, inte oartigt. Ställ hellre en klargörande
fråga än att gissa. Slutbeslutet är alltid Williams, men det ska vara informerat.

Rapportera faktiskt utfall. Misslyckas något, säg det med utdata i stället för
att beskriva det som klart.

---

## Grundregel: inga halvfärdiga skal

Varje sida och komponent ska vara fullt implementerad. Inga placeholders, inga
döda knappar, ingen TODO som skickas som klar.

- Alla knappar har fungerande handlers
- Alla länkar leder någonstans
- Alla formulär kan skickas och sparar data
- Alla API-anrop har både success- och error-hantering
- All data kan skapas, läsas, uppdateras och tas bort
- Loading states och feedback överallt
- Destruktiva åtgärder kräver bekräftelse
- Responsiv design är obligatorisk

En tabell som varken skrivs eller läses är ett skal. `item_availability` låg så
i månader innan den gjordes verklig — med skrivning, läsning **och** kontroll i
API:t. Två av tre hade inte räckt: menyvyn är klientkod, och den som anropar
API:t direkt har aldrig sett den.

---

## Vad Burp är

Marknadsplats där varje restaurang har **sin egen sida**: presentation, meny med
bilder, öppettider och vägbeskrivning. Inte en katalog — restaurangerna
beskriver sig själva.

Marknaden är **Bosnien, Kroatien och Serbien**.

Det som skiljer Burp från en vanlig matapp är **QR-beställning vid bordet** —
gästen skannar en dekal och beställer utan app, utan konto och utan att tänka på
tekniken. Den delen har högst kvalitetskrav i hela produkten.

| Dokument | Innehåll |
|---|---|
| `docs/TODO.md` | **Arbetslistan. Följ den uppifrån** |
| `docs/ARCHITECTURE.md` | Systemarkitekturen. Börjar med vad som ändrats sedan v0.1 |
| `docs/OPEN-QUESTIONS.md` | Beslut som blockerar |
| `docs/DESIGN.md` | Designspråket, färgerna och varför |
| `docs/DEPLOYMENT.md` | Miljöer och driftsättning |

---

## Struktur

```
burp/
├── apps/web/             @burp/web — Next.js 16 App Router
├── packages/core/        @burp/core — delad affärslogik, ingen runtime-koppling
├── supabase/
│   ├── migrations/       0001–0020, körs i ordning
│   ├── config.toml       lokal stack; kör seed.sql OCH seed-staff.sql
│   └── seed.sql          testdata
├── scripts/
└── docs/
```

`@burp/core` får **aldrig** importera från Next.js, Supabase, React Native eller
någon annan runtime. Paketet ska kunna köras var som helst — det är hela poängen
med att webben och den kommande mobilappen delar det.

---

## Kommandon

```bash
npm install                # rot — installerar alla workspaces
npm run dev                # webben på :3000
npm run build              # bygger core + web
npm run test               # vitest i alla workspaces
npm run type-check
npm run lint

npm run db:validate        # migrations genom PG17:s parser — inget Docker
npx supabase start         # lokal stack i Docker
npx supabase db reset      # migrations + seed + personalkonton
npm run db:demo            # 75 dagars orderhistorik — utan den står pengaytorna tomma
npm run db:types           # TypeScript-typer ur den LOKALA stacken
npm run db:types:remote    # …ur molnet, när SUPABASE_PROJECT_ID finns
npm run db:types:check     # faller om filen är ur takt — kör den efter en migration

node scripts/print-qr-links.mjs   # QR-länkar för seed-borden
```

---

## Regler som inte får brytas

### 1. Pengar är heltal i valutans minsta enhet

Aldrig float, aldrig `numeric` i schemat, aldrig hela valutaenheter i mellanled.
12,00 KM är `1200`. Konvertera först vid presentation, med `formatMoney()`.

**Serbiska dinarer har noll decimaler.** `CURRENCY_INFO[...].decimalDigits`
avgör; hårdkoda aldrig division med 100. `parseAmount()` läser "1200" i ett
serbiskt prisfält som 1200 dinarer, inte som 12.

Procentsatser är baspunkter: 340 = 3,40 %.

### 2. Klienten skickar aldrig ett pris

`POST /api/orders` tar emot **vad** som beställs, aldrig vad det kostar. Servern
hämtar priserna ur menyn och räknar med `@burp/core`. Skickar klienten sin egen
summa används den bara som kontroll — avviker den avbryts ordern, den justeras
aldrig tyst.

Samma regel gäller allt som ändrar summan: klienten skickar en **kupongkod**,
en **presentkortskod** eller en begäran att lösa ut klippkortet — aldrig
rabatten, aldrig beloppet. Servern slår upp villkoren och räknar.

Uträkningen ligger i `lib/order-pricing.ts` och används av både orderrutten och
förhandsvisningarna. Två kopior av det steget glider isär, och då visar menyn en
rabatt servern räknar annorlunda — vilket avbryter beställningen med "priset har
ändrats" utan att någon förstår varför.

### 3. Priset räknas på ett enda ställe

`packages/core/src/pricing.ts`. Duplicera aldrig prislogik i en komponent, en
route handler eller en SQL-vy.

### 4. Ny tabell = ny RLS-policy, alltid

Innan tabellen används. Modellen står i `supabase/migrations/0009_rls.sql`.

**RLS utan GRANT är verkningslös** — policyn gäller, men rollen har inga
tabellrättigheter alls. Migration 0012 finns för att det felet redan begåtts en
gång, och `verify-schema.sh` kontrollerar det numera.

### 5. Service role är sista utvägen

`createAdminClient()` kringgår all RLS. Använd den bara där en policy inte
räcker — QR-flödet (anonym gäst utan `auth.uid()`), webhooks, bakgrundsjobb.
Varje sådant anrop måste själv filtrera på `restaurant_id`.

### 6. Loggarna är oföränderliga

`order_events` och `loyalty_transactions` har triggers som blockerar UPDATE och
DELETE.

### 7. Lojalitetssaldot lagras aldrig

Det räknas ur `loyalty_transactions`. Ett lagrat saldo kan hamna i otakt med
sina transaktioner; en summa över loggen kan det inte.

**Regeln finns på två ställen och måste hållas i takt:** `loyalty_balance()`
(migration 0042) och `calculateBalance()` i `@burp/core`. Samma krav som
`country_time_zone()` och `COUNTRY_INFO`. Utgångna poäng räknas bort en gång —
antingen av filtret eller av EXPIRE-raden, aldrig av båda.

### 8. Dricks är inte omsättning

Egen tabell, egen rad, aldrig i avgiftsunderlaget. Dricks är gästens pengar till
personalen.

**`orders.tip_ore` är vad gästen valde på notan. `tips` är pengar personalen
faktiskt fick.** Det första hör till kvittot och ändras aldrig i efterhand; det
andra är det enda som får räknas. Allt som rapporterar dricks — statistiken,
plattformsöversikten, avräkningen, kassan — läser `tips` där `released_at` är
null. Raden släpps när ordern avbryts eller återbetalas i sin helhet.

Tabellen låg som ett skal fram till migration 0040: den skrevs men lästes inte,
kopplingen till betalningen sattes bara i kortflödet, och dricks på avbrutna och
återbetalda order räknades som personalens.

### 9. Landet avgör, inte koden

Landet är en egenskap hos restaurangen och styr valuta, momssatser,
organisationsnummerformat och tidszon. Allt ligger i
`packages/core/src/country.ts` och speglas i databasen av `allowed_vat_rates()`
(migration 0019) och `country_time_zone()` (migration 0033) — **ändras den ena
måste den andra följa med**.

| Land | Valuta | Moms | Org.nr |
|---|---|---|---|
| Bosnien (BA) | BAM (fening) | 17 % — **en enda sats** | JIB, 13 siffror |
| Kroatien (HR) | EUR (cent) | 13 % / 25 % | OIB, 11 siffror |
| Serbien (RS) | RSD (para) | 10 % / 20 % | PIB, 9 siffror |
| Sverige (SE) | SEK (öre) | 12 % / 25 % | 10 siffror |

Att Bosnien har samma sats för reducerad och standard är avsiktligt.

**Valutan fryses på ordern** (migration 0020). Ett kvitto ändrar sig aldrig i
efterhand. Belopp i olika valutor summeras aldrig — plattformsöversikten
redovisar per valuta, av samma skäl.

Skriv aldrig in ett land eller en valuta i en komponent. Läs restaurangens.

### 10. QR_TOKEN_SECRET byts aldrig i produktion

Ett byte ogiltigförklarar samtliga utskrivna QR-dekaler hos alla restauranger.

---

## Språk

Fem språk. `apps/web/src/lib/i18n/`.

| Kod | Ordbok | Täcker |
|---|---|---|
| `bs` | `bs.ts` | Bosniska, kroatiska och serbiska i **latinsk** skrift |
| `en` | `en.ts` | Turisten som inte talar något av de andra |
| `de` | `de.ts` | Största turistgruppen i regionen. Genomgående `Sie` |
| `no` | `no.ts` | Bokmål |
| `sv` | `sv.ts` | Standardspråk, och det `Dictionary` härleds ur |

`bs` är **en** ordbok och inte tre. Skillnaden mellan standarderna i latinsk
skrift är ordval, inte grammatik, och tre nästan identiska filer glider isär på
den nyckel någon glömmer i två av dem. Den som söker på kroatiska i Zagreb hittar
ändå sidan: `LOCALE_ALTERNATE_TAGS` märker `/bs/` med `hreflang` för `bs`, `hr`
**och** `sr-Latn`. Serbiskan märks `sr-Latn` med flit — ett omärkt `sr` lovar
kyrilliska.

`hr`, `sr`, `nb` och `nn` är **alias i `Accept-Language`, aldrig adresser**. En
kroatisk telefon landar på `bs` utan att `/hr/` finns. Att ge dem egna URL:er
hade gett Google samma innehåll på två adresser.

**Bara gränssnittet översätts.** Restaurangens egen text — namn, beskrivningar,
allergener — står kvar som den skrivits. Enda undantaget är *etiketten* framför
allergenlistan, som är gränssnitt: det är det enda stället på menyn där en gäst
som inte förstår riskerar något värre än en missad rätt.

- **Indexerade ytor** har språket i URL:en — `/sv/...`, `/en/...`. Google
  indexerar en URL, inte en cookie; med språket dolt i sessionen kan bara en
  språkversion nå sökresultaten.
- **QR-sidan, kvittona och `/konto`** läser `Accept-Language`. De är noindex och
  behöver ingen egen URL per språk — och QR-beställning används av turister. Det
  gäller också serveråtgärderna på de ytorna: felmeddelandet ska komma på samma
  språk som sidan det visas på.
- **Personalytorna läser språket ur personen** — `staff.locale`, migration 0047
  — och aldrig ur adressen eller `Accept-Language`. Köket ska inte byta språk
  för att en gäst gjorde det, och en surfplatta på en disk delas av flera.
  Har hen inte valt avgör **restaurangens land**:
  `DEFAULT_LOCALE_BY_COUNTRY` i `i18n/config.ts`. NULL i kolumnen betyder "har
  inte valt", inte "valde svenska".
- **Backoffice är svensk.** `/backoffice` är Burps egen plattformsyta och läses
  av Burps eget team. En plattformsadmin är inte personal någonstans och har
  ingen `staff.locale`; där en personalkomponent lånas skickas svenskan
  uttryckligen in med `untranslatedSurface()`.

`Dictionary` härleds ur den svenska filen: en nyckel som glöms i något av de
andra fyra språken stoppar bygget. Testerna i `i18n.test.ts` håller resten —
identiska nyckelmängder åt alla håll, inga tomma strängar, språknamnen på sitt
eget språk, och ingen sträng identisk med svenskan utom de som uttryckligen
listats i `SAMMA_SOM_SVENSKAN`.

Den listan har **ett eget test som faller på en post som inte längre behövs**.
Utan det ruttnar listan: en nyckel byter namn eller översätts till slut, raden
blir kvar, och nästa läsare tror att kollisionen finns. Norskan har flest poster
av den enkla anledningen att "Allergener" och "Telefon" stavas likadant på
svenska — vilka veckodagar som *inte* står med är kvittot på att filen är norsk.

**Texter som skickas till klientkomponenter måste vara rena strängar.** En
funktion går inte att serialisera över server/klient-gränsen och ger 500.
Variabler skrivs som `{namn}` och fylls i med `fill()`. Ett test kräver det för
avsnitten `menu`, `table` och `receipt` — QR-sidan var trasig på precis det
sättet och såg fungerande ut i ett grep av HTML:en, eftersom felpayloaden ändå
innehåller strängarna.

---

## Design

Se `docs/DESIGN.md`. Burp följer **123Connect Design System**: handlingsrött
`#dc2626`, vita kort på `#f3f4f6`, Geist i både rubrik och brödtext, rundade
hörn och låga skuggor. Byggstenarna definieras **en gång** i `globals.css` —
skriv aldrig en egen knapp eller ett eget fält i en komponent.

Den tidigare redaktionella formen — papper, antikva, inga rundade hörn, inga
skuggor — är **borta sedan 2026-08-16**. Beskrivningen står kvar i enstaka
filkommentarer och stämmer inte längre. Utgå från `globals.css`, inte från en
docstring.

Burp använder inte systemets lila och rosa marknadsföringsgradienter. Guld till
betyg, grönt till bekräftelse, inget blått — av samma skäl som förut: ingenting
får konkurrera med maten.

---

## Deploy-flöde: dev → godkännande → main

`dev` är standardarbetsbranchen. `main` är produktion.

1. **Allt arbete sker på `dev`.** Committa och pusha löpande.
2. Varje push till `dev` ger en **Vercel preview-deploy**. Ge William URL:en.
3. **Först när William uttryckligen godkänt** preview:n:
   ```bash
   git checkout main && git merge dev --ff-only && git push origin main && git checkout dev
   ```
4. Committa **aldrig** direkt på `main`.
5. Kontrollera `git status` och `git log @{u}..` vid sessionsstart och slut.

⚠️ Deploya **aldrig** till produktion utan Williams uttryckliga godkännande.

---

## Innan du säger att något är klart

```bash
npm run db:validate && npm run type-check && npm run lint && npm run test && npm run build
```

Och med Docker igång:

```bash
npm run db:verify      # ren databas, hela schemat, alla logiktester
bash scripts/smoke.sh  # hela flödet mot körande app + Supabase-stack
```

**`smoke.sh` är det som avgör om något faktiskt fungerar.** Enhetstester och
schemakontroll missar hela klasser av fel: att appen frågar efter en kolumn som
inte finns, att en RLS-policy saknar sin GRANT, att en sida skriver en cookie
där Next.js inte tillåter det. Alla tre fanns i koden och passerade allt annat.

### Vad som testas var

| Var | Vad | Kräver |
|---|---|---|
| `packages/core` | All affärslogik: pris, moms, avgift, statusmaskin, orderregler, QR-token, lojalitet, tillgänglighet, koordinater | inget |
| `apps/web` | Rena moduler: öppen vidarebefordran, rate limiter, JSON-LD, i18n, avräkningens periodräkning, köksköns ordning | inget |
| `scripts/verify-schema.sh` | Migrationer, RLS, grants, triggers, plpgsql | PostgreSQL + PostGIS |
| `packages/core` (forts.) | Betalningens statusmaskin, kupong, presentkort, klippkort | inget |
| `scripts/smoke.sh` | Hela flödet: QR, order, avgift, åtkomst, inloggning, statuskoder, avräkning, GDPR, bakgrundsjobb — 157 kontroller | Docker + Supabase + körande app |

Route handlers och server components har medvetet inga enhetstester — de kräver
databas och session för att säga något meningsfullt, och täcks av `smoke.sh`.

### `verify-schema.sh` går att köra utan psql på maskinen

Det finns ingen `psql` installerad här, men skriptet behöver ingen — det räcker
med en container. Ett PostGIS-avbild med repot monterat kör hela schemat och
samtliga logiktester:

```bash
docker run -d --name burp-verify -e POSTGRES_PASSWORD=burp -e POSTGRES_DB=burp_verify \
  -v "C:\Users\wikr\.claude\burp:/repo:ro" postgis/postgis:17-3.5

docker exec -u postgres -e DB_NAME=burp_check burp-verify bash /repo/scripts/verify-schema.sh
```

Det här är det snabbaste sättet att bevisa att en migration faktiskt fungerar.
`bash -n` inuti samma container syntaxkontrollerar dessutom skript.

### `smoke.sh` GÅR att köra här — sätt bara PATH först

Det stod länge i den här filen att `bash` var WSL2 och att röktestet därför inte
gick att köra. **Det stämde inte.** Skalet är Git Bash:

```bash
uname -a     # MINGW64_NT-… … Msys      ← Git Bash
             # …microsoft-standard-WSL2 ← WSL, ett annat problem
```

Det som faktiskt saknades var `/usr/bin` på `PATH`. Utan den finns varken `ls`,
`grep` eller `curl`, och den som provar drar slutsatsen att skalet är trasigt
eller att nätverket inte når fram. Git Bash delar Windows nätverksstack, så
`curl http://localhost:3000` fungerar direkt.

Kör så här:

```bash
export PATH="/usr/bin:/bin:/mingw64/bin:/c/Program Files/nodejs:\
/c/Users/wikr/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
export DOCKER_API_VERSION=1.47

bash scripts/smoke.sh          # kräver körande app + supabase start
```

`curl` ligger i `/mingw64/bin`, inte i `/usr/bin`. Docker behöver sin
versionspinning här som överallt annars.

**Sätt aldrig `MSYS_NO_PATHCONV=1` i skalet som kör `smoke.sh`.** Variabeln är
frestande när man själv anropar `curl` för hand — Git Bash gör annars om
`/sv/upptack` till `C:/Program Files/Git/sv/upptack` — men den ärvs in i
skriptet och får **femton kontroller att falla**. Felen ser ut som riktiga
produktfel: "ingen bordssession efter beställning", 404 på kvittosidan, tomma
omdirigeringar från personalytorna. Appen är hel hela tiden.

Behöver du undvika sökvägsöversättningen i ett eget anrop, sätt variabeln
**bara för det anropet** (`MSYS_NO_PATHCONV=1 curl …`) och aldrig med `export`.

**En körning tar ett par minuter och pausar ibland 61 sekunder.** `orderCreate`
tillåter tio order per minut och testet lägger fler; i stället för att tappa
täckning väntar det ut fönstret och skriver `vänta` när det gör det. Att höja
gränsen för testet hade betytt att gränsen inte testas.

En kontroll som ändå inte går att avgöra rapporteras som `hopp`, aldrig som
`ok`. En tyst överhoppad sektion läses som en som passerade — det gällde nio
kontroller i orderredigeringen i varje körning innan det rättades.

**Kör inte `npm run build` medan `next dev` är igång.** Båda skriver i `.next`,
och dev-servern blir förvirrad: röktestet faller då på sidor som fungerar. Stoppa
servern, bygg, starta om.

---

## Fällor som redan kostat tid

### Två röktester samtidigt ser ut som sex produktfel

`smoke.sh` tar ett par minuter, och den som avbryter ett försök och startar ett
nytt får två som lever parallellt. De delar seed-restaurang, bordstoken och rate
limiter, och resultatet blir spridda fel som var och en läser som en riktig bugg:
409 där 201 väntades, en bordssession som inte känner igen sin egen order, en
kupong som inte går att lösa in.

Kontrollera att ingen körning lever kvar innan en ny startas. En ren körning gav
156 av 156 direkt efteråt, utan en enda kodändring.

### `insert … returning` ger två rader ur `sql()`

Hjälpfunktionen returnerar allt psql skrev, och psql skriver både det returnerade
id:t **och** kommandotaggen `INSERT 0 1`. En variabel som fångar det rakt av blir
tvårading, och varje fråga som använder id:t efteråt misslyckas med ett
felmeddelande som pekar någon helt annanstans. Avsluta med `| head -1`.

### `loading.tsx` gör varje `notFound()` till en 200:a

En `loading.tsx` öppnar en strömmande respons. Statusraden går iväg innan sidan
är klar, och en sida som senare anropar `notFound()` hinner aldrig sätta 404 —
svaret blir **200 med 404-sidans innehåll**. Google indexerar mjuka 404:or som
riktigt innehåll. `smoke.sh` kontrollerar statuskoderna; lita på testet, inte på
hur sidan ser ut.

### Ett grep av HTML:en bevisar ingenting

Felpayloader innehåller ändå de strängar man letar efter. **Läs HTTP-statusen.**
QR-sidan svarade 500 medan grep-träffarna såg ut att bekräfta att den fungerade.

### `getComputedStyle` returnerar `oklch()`

En regex som läser dem som RGB ger nonsens — 1,45:1 för vit text på nästan
svart. Mät kontrast genom att rita färgen på en 1×1-canvas och läsa pixeln.

### Testdata som ser ut som produktfel

`smoke.sh` skapar en order direkt i SQL med `items_vat_ore` men utan orderrader.
Statistiksidan visar därför en momstotal större än summan per sats. Testdata,
inte en bugg i uppdelningen.

### Dev-servern efter en katalogflytt

`next dev` behåller en gammal ruttlista och svarar 404 på nya rutter trots att
bygget är korrekt. Starta om och rensa `.next`. Samma sak efter ett `npm
install` av ett nytt paket — den nya modulens bunt svarar 503 tills servern
startats om.

### Öppna appen på `localhost`, aldrig på `127.0.0.1`

Next 16 blockerar `/_next/`-resurser för en värd som inte står i
`allowedDevOrigins`. `localhost` står där, `127.0.0.1` gör det inte. Följden är
att **sidan renderas men aldrig hydrerar**: HTML:en ser komplett ut, statusen
är 200, och ingenting i den är klickbart. Bunterna svarar 503 och det enda som
säger varför är en varning i dev-serverns egen logg.

Det kostade en halvtimmes felsökning av en karta som var korrekt hela tiden.
`curl` mot `127.0.0.1` är däremot oproblematiskt — det är bara webbläsaren som
behöver `localhost`.

### En dynamisk import kan behöva `.default`

Ett paket vars `main` pekar på en UMD-fil, utan `module` eller `exports`, ger
en namnrymd där hela biblioteket ligger under `default`. `const L = await
import("leaflet")` gör då `L.map` till undefined. Kartan blev en tom ruta utan
ett enda felmeddelande, eftersom den avvisade promisen inte fångades någonstans.

Fånga alltid felet i en dynamisk import och visa något. Ett tyst fel är värre
än ett synligt.

### Flaxiga test döljer riktiga egenskaper

QR-koden är sex tecken ur 32 — nyckelrymd 1,07 miljarder. Ett test som drog
5000 id och krävde noll kollisioner föll var åttiofemte körning. Kravet var fel
ställt, inte generatorn. Vid 100 000 bord är kollision nästan säker, och det är
därför `createTable` provar om vid felkod 23505.

### PowerShell och UTF-8

`Get-Content -Raw` mojibake:ar svenska tecken. Använd
`[System.IO.File]::ReadAllText(path, UTF8)` — eller Python via Bash, vilket är
det som används genomgående här.

---

## Docker på den här maskinen

Docker Desktop ligger per användare:

```
C:\Users\wikr\AppData\Local\Programs\DockerDesktop\resources\bin
```

Katalogen läggs på PATH först när ett nytt skal startas. Ett skal som öppnades
före installationen säger `docker: command not found`, vilket läser som en
trasig installation men bara är en gammal PATH.

Dessutom: **Supabase CLI 2.114 klarar inte Docker Engine 29:s API.** Stacken
faller med `LegacyContainerCreateError`. Pinna versionen:

```bash
export DOCKER_API_VERSION=1.47
```

Utan den går `supabase start` inte att köra alls på den här maskinen.
