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
fråga än att gissa. Slutbeslutet är alltid Williams, men beslutet ska vara
informerat.

Detta gäller **om** en funktion ska byggas och **vilken väg** som är rätt. När
en funktion väl ska byggas gäller grundregeln nedan.

## Designspråket: ett, inte ett per sida

Formspråket är redaktionellt — en tryckt matbilaga, inte en SaaS-produkt.
Papper i stället för vitt, antikva i rubriker, hårfina linjaler, spärrade
versaler till metadata. **Inga rundade hörn och inga skuggor.** Det är
signaturen, och den fungerar bara om den är undantagslös.

Byggstenarna är definierade **en enda gång**, i `apps/web/src/app/globals.css`:

| Klass | Till vad |
|---|---|
| `.font-display` | Rubriker. Aldrig under ~1.5rem — antikvan blir oläslig liten. |
| `.label-caps` | Metadata: stad, kategori, sektionsetikett. |
| `.rule` | Avdelare mellan sektioner. |
| `.card` | Yta som ligger på pappret. Ingen skugga. |
| `.btn` + `.btn-primary` / `.btn-secondary` | Alla knappar. Minst 44 px höga. |
| `.field` | Alla textfält. Understruken linje, inte ruta. |
| `.link` | Länk i löpande text. Understruken redan i viloläge. |

Skriv **aldrig** en egen knapp, ett eget fält eller en egen kantlinje i en
komponent. Varje sida som gör det glider isär från resten, och det är precis
så produkten en gång kom att tala tre olika designspråk samtidigt:
startsidan i antikva, stadssidan i fet grotesk, inloggningen i varken eller.

`SiteHeader` och `SiteFooter` (`components/site/`) ligger på varje publik sida.
Undantaget är QR-sidan vid bordet — där har gästen redan bestämt sig, och varje
länk bort från menyn är en länk bort från beställningen.

Köksskärmen lyder inte under det här. Den körs på en surfplatta på några meters
håll i ett stökigt kök, och där går läsbarhet före ton.

---

## Grundregel: inga halvfärdiga skal

Varje sida och komponent som skapas ska vara fullt implementerad. Inga
placeholders, inga döda knappar, ingen "TODO" som skickas som klar.

- Alla knappar har fungerande handlers
- Alla länkar leder någonstans
- Alla formulär kan skickas och sparar data
- Alla API-anrop har både success- och error-hantering
- All data kan skapas, läsas, uppdateras och tas bort
- Loading states och toast-feedback överallt
- Destruktiva åtgärder kräver bekräftelse
- Responsiv design är obligatorisk

Undantaget är kod som medvetet är markerad som ett senare fas-arbete i
`docs/ARCHITECTURE.md`. Den ska då vara märkt i koden med vilken fas den hör
till, inte lämnas tyst tom.

---

## Vad Burp är

Matmarknadsplats för den svenska marknaden i tre delar: gästytor (webb, app,
QR vid bordet), restaurangytor (dashboard, köksskärm) och Burp backoffice.

Det som skiljer Burp från en vanlig matapp är **QR-beställning vid bordet** —
gästen skannar en dekal och beställer utan app, utan konto och utan att tänka
på tekniken. Den delen har högst kvalitetskrav i hela produkten.

Fullständigt underlag: `docs/ARCHITECTURE.md`.
Obesvarade beslut som blockerar bygget: `docs/OPEN-QUESTIONS.md`.

---

## Struktur

```
burp/
├── apps/
│   └── web/              @burp/web — Next.js 16 App Router
├── packages/
│   └── core/             @burp/core — delad affärslogik, ingen runtime-koppling
├── supabase/
│   ├── migrations/       0001–0010, körs i ordning
│   ├── config.toml       lokal stack
│   └── seed.sql          testdata
├── scripts/
├── docs/
└── package.json          npm workspaces
```

`@burp/core` får **aldrig** importera från Next.js, Supabase, React Native eller
någon annan runtime. Paketet ska kunna köras var som helst — det är hela
poängen med att webben och den kommande mobilappen delar det.

---

## Kommandon

```bash
npm install                # rot — installerar alla workspaces
npm run dev                # startar webben på :3000
npm run build              # bygger core + web
npm run test               # vitest i alla workspaces
npm run type-check         # tsc --noEmit i alla workspaces
npm run lint

# Kör i apps/web direkt:
npx next dev
npx next build

# Databas
npm run db:validate        # kör migrations genom PG17:s parser — inget Docker krävs
npx supabase start         # lokal stack i Docker
npx supabase db reset      # kör migrations + seed
npx supabase db push       # skjuter migrations till länkat projekt
npm run db:types           # genererar TypeScript-typer från schemat

node scripts/print-qr-links.mjs   # QR-länkar för seed-borden
```

---

## Regler som inte får brytas

### 1. Pengar är heltal öre

Aldrig float, aldrig `numeric` i schemat, aldrig hela valutaenheter i
mellanled. 12,00 KM är `1200`, 149,50 kr är `14950`. Konvertera först vid
presentation, och gör det med `formatMoney()` — den kan valutorna.

Serbiska dinarer har **noll** decimaler. `1200` RSD är 1200 dinarer, inte 12.
`CURRENCY_INFO[...].decimalDigits` avgör; hårdkoda aldrig division med 100.

Procentsatser är baspunkter: 340 = 3,40 %.

### 2. Klienten skickar aldrig ett pris

`POST /api/orders` tar emot **vad** som beställs, aldrig vad det kostar. Servern
hämtar priserna ur menyn och räknar med `@burp/core`. Skickar klienten med sin
egen summa används den bara som kontroll — avviker den avbryts ordern, den
justeras aldrig tyst.

### 3. Priset räknas på ett enda ställe

`packages/core/src/pricing.ts`. Duplicera aldrig prislogik i en komponent, en
route handler eller en SQL-vy. Webben, appen och API:t ska komma till samma krona.

### 4. Ny tabell = ny RLS-policy, alltid

Innan tabellen används. Modellen står i `supabase/migrations/0009_rls.sql`.
Personal ser bara sin egen restaurang, via `is_staff_of()` / `has_role_at()`.

### 5. Service role är sista utvägen

`createAdminClient()` kringgår all RLS. Använd den bara där det finns ett skäl
som inte går att lösa med en policy — QR-flödet (anonym gäst utan `auth.uid()`),
webhooks och bakgrundsjobb. Varje sådant anrop måste själv filtrera på
`restaurant_id`.

### 6. Loggarna är oföränderliga

`order_events` och `loyalty_transactions` har triggers som blockerar UPDATE och
DELETE. Försök aldrig kringgå dem.

### 7. Lojalitetssaldot lagras aldrig

Det räknas ur `loyalty_transactions`. Ett lagrat saldo kan hamna i otakt med
sina transaktioner; en summa över loggen kan det inte.

### 8. Dricks är inte omsättning

Egen tabell, egen rad, aldrig i avgiftsunderlaget. Dricks är gästens pengar till
personalen.

### 9. Balkanmarknaden — landet avgör, inte koden

Marknaden är **Bosnien, Kroatien och Serbien**. Landet är en egenskap hos
restaurangen och styr valuta, momssatser, organisationsnummerformat och
tidszon. Allt ligger i `packages/core/src/country.ts` och speglas av
`allowed_vat_rates()` i migration 0019 — ändras den ena måste den andra följa
med.

| Land | Valuta | Moms | Org.nr |
|---|---|---|---|
| Bosnien (BA) | BAM (fening) | 17 % — **en enda sats** | JIB, 13 siffror |
| Kroatien (HR) | EUR (cent) | 13 % / 25 % | OIB, 11 siffror |
| Serbien (RS) | RSD (para) | 10 % / 20 % | PIB, 9 siffror |
| Sverige (SE) | SEK (öre) | 12 % / 25 % | 10 siffror |

Att Bosnien har samma sats för reducerad och standard är avsiktligt, inte ett
kopieringsfel.

Gränssnittsspråk: **engelska och svenska**. Skriv aldrig in ett land eller en
valuta i en komponent — läs restaurangens.

### 10. QR_TOKEN_SECRET byts aldrig i produktion

Ett byte ogiltigförklarar samtliga utskrivna QR-dekaler hos alla restauranger.

---

## Deploy-flöde: dev → godkännande → main

`dev` är standardarbetsbranchen. `main` är produktion.

1. **Allt arbete sker på `dev`.** Committa och pusha löpande — lämna aldrig
   commits opushade.
2. Varje push till `dev` ger en **Vercel preview-deploy** mot dev-databasen.
   Ge William preview-URL:en för test.
3. **Först när William uttryckligen godkänt** preview:n:
   ```bash
   git checkout main && git merge dev --ff-only && git push origin main && git checkout dev
   ```
4. Committa **aldrig** direkt på `main`. Undantag: hotfix som William beordrar.
5. Kontrollera `git status` och `git log @{u}..` vid sessionsstart och innan
   sessionsslut. Finns ocommittade ändringar eller opushade commits — fråga.

⚠️ Deploya **aldrig** till produktion (`vercel --prod` eller push till `main`)
utan Williams uttryckliga godkännande av en dev-preview.

| | Branch | Vercel | Supabase |
|---|---|---|---|
| Utveckling | `dev` | Preview | burp-dev *(ej skapad än)* |
| Produktion | `main` | Production | burp-prod *(ej skapad än)* |

---

## Kända begränsningar just nu

Det här är medvetna luckor, inte buggar. De ska åtgärdas innan respektive fas
går live.

| Vad | Var | Ska fixas före |
|---|---|---|
| Rate limiter ligger i processminnet — fungerar inte över flera Vercel-instanser | `apps/web/src/lib/rate-limit.ts` | Fas 2 live |
| Öppettider stödjer inte pass över midnatt | `is_restaurant_open()`, migration `0004` | När nattöppet blir aktuellt |
| Ingen betalleverantör vald | Öppen fråga 5 | Fas 1 |
| Avgiftsbasen är gissad (`GROSS_ITEMS`) | Öppen fråga 1 | Fas 1 |
| Kassaregisterkravet outrett | Öppen fråga 4 | Fas 2 live |
| Ingen GDPR-export eller radering | — | Fas 4 |

---

## Innan du säger att något är klart

```bash
npm run db:validate && npm run type-check && npm run test && npm run build
```

Har du en PostgreSQL med PostGIS tillgänglig, kör även:

```bash
npm run db:verify      # ren databas, hela schemat och 11 logiktester
bash scripts/smoke.sh  # 25 kontroller mot körande app + Supabase-stack
```

**`smoke.sh` är det som avgör om något faktiskt fungerar.** Enhetstester och
schemakontroll missar hela klasser av fel: att appen frågar efter en kolumn som
inte finns, att RLS-policyn saknar sin GRANT, att en sida skriver en cookie där
Next.js inte tillåter det. Alla tre fanns i koden och passerade allt annat.

### Vad som testas var

| Var | Vad | Kräver |
|---|---|---|
| `packages/core` | All affärslogik: pris, moms, avgift, statusmaskin, orderregler, QR-token, lojalitet | inget |
| `apps/web` | Rena moduler: skydd mot öppen vidarebefordran, rate limiter, JSON-LD-escapning | inget |
| `scripts/verify-schema.sh` | Migrationer, RLS, grants, triggers, plpgsql | PostgreSQL + PostGIS |
| `scripts/smoke.sh` | Hela flödet: QR, order, avgift, åtkomst, inloggning | Docker + Supabase |

Route handlers och server components har medvetet inga enhetstester — de kräver
databas och session för att säga något meningsfullt, och täcks av `smoke.sh`.

Alla ska passera. Rapportera faktiskt utfall — misslyckas något, säg det med
utdata i stället för att beskriva det som klart.

`db:validate` granskar **inte** innehållet i plpgsql-funktioner — kroppen
mellan `$$ ... $$` är en strängliteral för SQL-parsern. Det är `db:verify` som
täcker triggers och funktioner. CI kör båda.

Utan Docker går det ändå att verifiera schemat — WSL2 med Ubuntu och PostgreSQL
räcker:

```bash
wsl -d Ubuntu -u root service postgresql start
wsl -d Ubuntu -u postgres bash /mnt/c/Users/wikr/.claude/burp/scripts/verify-schema.sh
```

### Docker på den här maskinen

Docker Desktop är installerat per användare, inte i `Program Files`:

```
C:\Users\wikr\AppData\Local\Programs\DockerDesktop\resources\bin
```

Katalogen läggs på PATH först när ett nytt skal startas. Ett skal som öppnades
före installationen ser den inte, och då säger Supabase CLI
`docker: command not found` — vilket läser som en trasig installation men bara
är en gammal PATH. Starta om terminalen, eller lägg till katalogen för stunden.

Dessutom: **Supabase CLI 2.114 klarar inte Docker Engine 29:s API (1.55).**
Stacken faller med `LegacyContainerCreateError` eller "No such container" mitt
i uppstarten. Lösningen är att pinna API-versionen:

```bash
export DOCKER_API_VERSION=1.47
```

Utan den går `supabase start` inte att köra alls på den här maskinen.
