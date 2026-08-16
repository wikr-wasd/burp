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
npm run db:types           # TypeScript-typer ur schemat

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

### 8. Dricks är inte omsättning

Egen tabell, egen rad, aldrig i avgiftsunderlaget. Dricks är gästens pengar till
personalen.

### 9. Landet avgör, inte koden

Landet är en egenskap hos restaurangen och styr valuta, momssatser,
organisationsnummerformat och tidszon. Allt ligger i
`packages/core/src/country.ts` och speglas av `allowed_vat_rates()` i migration
0019 — **ändras den ena måste den andra följa med**.

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

Svenska och engelska. `apps/web/src/lib/i18n/`.

- **Indexerade ytor** har språket i URL:en — `/sv/...`, `/en/...`. Google
  indexerar en URL, inte en cookie; med språket dolt i sessionen kan bara en
  språkversion nå sökresultaten.
- **QR-sidan och kvittona** läser `Accept-Language`. De är noindex och behöver
  ingen egen URL per språk — och QR-beställning används av turister.
- **Personalytorna är svenska.** Medvetet. Köket ska inte byta språk för att en
  gäst gjorde det.

`Dictionary` härleds ur den svenska filen: en nyckel som glöms i engelskan
stoppar bygget. Tre tester håller resten — identiska nyckelmängder åt båda
hållen, inga tomma strängar, och ingen sträng identisk mellan språken utom de
som uttryckligen listats.

**Texter som skickas till klientkomponenter måste vara rena strängar.** En
funktion går inte att serialisera över server/klient-gränsen och ger 500.
Variabler skrivs som `{namn}` och fylls i med `fill()`. Ett test kräver det för
avsnitten `menu`, `table` och `receipt` — QR-sidan var trasig på precis det
sättet och såg fungerande ut i ett grep av HTML:en, eftersom felpayloaden ändå
innehåller strängarna.

---

## Design

Se `docs/DESIGN.md`. Kort: redaktionellt, varmt, matnära. Inga rundade hörn,
inga skuggor. Byggstenarna definieras **en gång** i `globals.css` — skriv aldrig
en egen knapp eller ett eget fält i en komponent.

Färgerna väljs efter ett enda kriterium: att göra mat aptitlig. Varmt papper,
espressomörkt i mörkt läge, tomat som handlingsfärg och saffran för betyg. Inget
blått, av samma skäl som det inte finns på en tallrik.

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
| `apps/web` | Rena moduler: öppen vidarebefordran, rate limiter, JSON-LD, i18n | inget |
| `scripts/verify-schema.sh` | Migrationer, RLS, grants, triggers, plpgsql | PostgreSQL + PostGIS |
| `scripts/smoke.sh` | Hela flödet: QR, order, avgift, åtkomst, inloggning, statuskoder | Docker + Supabase |

Route handlers och server components har medvetet inga enhetstester — de kräver
databas och session för att säga något meningsfullt, och täcks av `smoke.sh`.

### `smoke.sh` når inte appen från WSL

`bash` på den här maskinen är **WSL2, inte Git Bash**. WSL2 har ett eget
nätverksnamnrum: `127.0.0.1:3000` inuti WSL är WSL:s egen loopback, inte
Windows. `curl` svarar därför `000` på varenda rad och testet ser ut som att
hela appen ligger nere — den svarar 200 hela tiden.

Windows brandvägg släpper inte heller in WSL-subnätet mot värdens portar, så
varken `172.31.48.1` eller `host.docker.internal` hjälper. Att öppna
brandväggen är en systeminställning och inte något som ska göras för ett test.

Kontrollera först var man står:

```bash
uname -a                 # innehåller "microsoft-standard-WSL2" → problemet
curl.exe -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health
```

`curl.exe` är Windows-binären via WSL-interop och når appen. `curl` gör det
inte. En riktig lösning kräver antingen Git Bash installerat eller att
`smoke.sh` körs från en miljö som delar Windows nätverksstack.

---

## Fällor som redan kostat tid

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
bygget är korrekt. Starta om och rensa `.next`.

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
