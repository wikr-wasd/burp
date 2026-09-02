# Burp

Matmarknadsplats och restaurangbeställning för den svenska marknaden — webb,
QR-beställning vid bordet, restaurangdashboard och köksskärm.

Full arkitektur: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
Beslut som saknas: [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md)
Koppla Supabase och Vercel: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
Förtroendegränserna: [`docs/SECURITY.md`](docs/SECURITY.md)
Rapportera en sårbarhet: [`SECURITY.md`](SECURITY.md)

---

## Stack

| Del | Val |
|---|---|
| Webb | Next.js 16 (App Router, Turbopack), React 19, Tailwind 4 |
| Delad logik | `@burp/core` — TypeScript, Zod 4, ingen runtime-koppling |
| Databas | Postgres 17 via Supabase, RLS på varje tabell |
| Auth | Supabase Auth (cookie-baserad session) |
| Hosting | Vercel |
| Test | Vitest |

Monorepo med npm workspaces. `apps/mobile` (React Native/Expo) tillkommer i Fas 3
och delar `@burp/core` med webben.

---

## Kom igång

```bash
npm install
cp .env.example apps/web/.env.local     # fyll i värden, se nedan
npm run dev                             # http://localhost:3000
```

### Miljövariabler

`apps/web/.env.local` behöver:

| Variabel | Var den kommer ifrån |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Samma ställe |
| `SUPABASE_SERVICE_ROLE_KEY` | Samma ställe. **Server only.** Aldrig i git |
| `QR_TOKEN_SECRET` | Generera själv, minst 32 tecken |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` lokalt |

Generera QR-nyckeln:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

⚠️ Byts `QR_TOKEN_SECRET` i produktion slutar **alla** utskrivna QR-dekaler att
fungera. Sätt den en gång och rör den inte.

### Databas

⚠️ **Supabase CLI 2.114 klarar inte Docker Engine 29.** Startar stacken med
`LegacyContainerCreateError` eller "No such container" är det API-versionen som
krockar (Engine 29 talar API 1.55, CLI:t klarar inte det). Sätt:

```bash
export DOCKER_API_VERSION=1.47
```

```bash
npx supabase start          # lokal stack i Docker
npx supabase db reset       # kör migrations 0001–0013 + seed.sql

# Testkonton för personalytorna (skriver i auth-schemat, därför separat):
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/seed-staff.sql

node scripts/print-qr-links.mjs   # QR-länkar som fungerar mot din lokala miljö
```

Testkonton efter `seed-staff.sql`:

| E-post | Lösenord | Roll | Landar på |
|---|---|---|---|
| `agare@burp.test` | `burp1234` | ägare | `/dashboard` |
| `kock@burp.test` | `burp1234` | kock | `/kok` |

Utan en riktig databas går det ändå att verifiera schemat — se `npm run db:verify`.

Mot ett riktigt projekt:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

---

## Kommandon

```bash
npm run dev          # webben
npm run build        # core + web
npm run test         # vitest
npm run type-check   # tsc --noEmit
npm run lint
npm run db:validate  # kör migrations genom PG17:s parser, kräver inget Docker
npm run db:verify    # hela schemat + 11 logiktester mot en riktig PostgreSQL
npm run db:types     # genererar TypeScript-typer ur schemat

bash scripts/smoke.sh  # 25 kontroller mot körande app + Supabase-stack
```

`smoke.sh` är det som fångar fel enhetstesterna inte kan se: att appen frågar
efter en kolumn som inte finns, att en RLS-policy saknar sin GRANT, eller att
en sida råkar skriva en cookie där Next.js inte tillåter det. Kör det innan du
säger att något fungerar.

---

## Struktur

```
apps/web/                 Next.js — gästytor, personalytor, API
  src/app/t/[token]/      QR-beställning vid bordet: meny, varukorg, kassa
  src/app/r/[city]/[slug] Publik restaurangsida (SEO)
  src/app/kok/            Köksskärm i realtid
  src/app/dashboard/      Order live och bordshantering med QR-utskrift
  src/app/logga-in/       Inloggning för personal
  src/app/api/orders/     Orderskapande med serverside-prisvalidering
  src/lib/auth.ts         Rollhämtning ur staff-tabellen
  src/lib/supabase/       client (browser) · server (RLS) · admin (service role)
  src/lib/table-session   Bordssessioner för anonyma gäster
  src/proxy.ts            Sessionsförnyelse + skydd av personalytorna

packages/core/            Delad affärslogik
  money.ts                Heltal öre, bankers rounding
  pricing.ts              Ordersumma, moms, Burps avgift
  order-status.ts         Statusmaskin
  order-policy.ts         Restaurangens ändringsregler
  qr.ts                   HMAC-signerade bordstokens
  loyalty.ts              Poäng ur händelselogg
  schemas.ts              Zod-validering

supabase/migrations/      0001–0010
docs/
scripts/
```

---

## Regler som styr koden

1. **Pengar är heltal öre.** Aldrig float. Procent i baspunkter (340 = 3,40 %).
2. **Klienten skickar aldrig ett pris.** Servern räknar om från menyn.
3. **Priset räknas på ett enda ställe** — `packages/core/src/pricing.ts`.
4. **Ny tabell = ny RLS-policy**, innan tabellen används.
5. **Service role är sista utvägen**, aldrig bekvämlighet.
6. **Loggarna är oföränderliga** — `order_events`, `loyalty_transactions`.
7. **Lojalitetssaldot lagras aldrig**, det räknas ur loggen.
8. **Dricks är inte omsättning** och ingår aldrig i avgiftsunderlaget.

Fler detaljer och deploy-flödet: [`CLAUDE.md`](CLAUDE.md).

---

## Status

Fas 1 pågår. Datamodellen, avgiftsberäkningen, statusmaskinen, QR-flödet och
säkerhetslagret finns. Meny-UI, kassa, dashboard och köksskärm är nästa steg.

Två beslut blockerar fortsatt arbete på betalning: **vad 3,4 % räknas på** och
**vilken betalleverantör**. Se `docs/OPEN-QUESTIONS.md`.
