# Deployment — koppla Supabase och Vercel

Repot är kopplat till GitHub. Supabase och Vercel kräver inloggning som måste
göras av dig — stegen nedan är det som återstår.

| | Status |
|---|---|
| GitHub | ✅ `github.com/wikr-wasd/burp`, brancher `main` och `dev` |
| Supabase | ⏳ blockerad av free tier-taket, se steg 1 |
| Vercel | ⛔ **inget projekt bygger repot.** Se steg 2 och spärren nedan |

---

## Spärren: cron var minut går inte på Hobby

**Kontrollerat 2026-08-28 mot Vercels egen dokumentation och mot kontot.**

Kontot `wikr-wasd's projects` ligger på **Hobby**. `vercel.json` innehåller två
cron-jobb:

| Sökväg | Schema | Hobby |
|---|---|---|
| `/api/jobs/expire-loyalty` | `0 4 * * *` | ✅ en gång per dygn |
| `/api/jobs/send-notices` | `* * * * *` | ⛔ **faller vid deploy** |

Vercels dokumentation (`/docs/cron-jobs/usage-and-pricing`, uppdaterad
2026-07-15) är otvetydig: på Hobby är minsta intervall **en gång per dygn**, och
*"cron expressions that would run more frequently will fail during deployment"*
med felet *"Hobby accounts are limited to daily cron jobs."*

**Repot går alltså inte att deploya till det här kontot som det står.** Det
faller innan bygget ens börjar, och felet handlar om en cron-rad — inte om
koden — vilket är precis den sortens fel man letar på fel ställe i en timme.

### Tre vägar, och de kostar olika saker

**A. Pro, 20 USD/månad.** Cron per minut, fem funktionsregioner. Notiserna
behåller sin takt och ingenting i koden ändras. Supabase behöver troligen Pro
ändå (se steg 1), så det är två uppgraderingar som hänger ihop.

**B. Dygnsvis notisjobb.** En rad i `vercel.json`. Men `sendPendingNotices()`
finns för att nå gästen **medan hon väntar på sin mat** — ett dygnsvist
notisjobb är inte en långsammare version av den funktionen, det är ingen
funktion alls. Brevet skickas i samma jobb, så det försvinner med.

**C. Supabase `pg_cron` + `pg_net` ringer endpointen.** Takten flyttar till
databasen och Vercel-planen slutar spela roll. Endpointen kräver redan
`CRON_SECRET`, så det som behövs är ett schemalagt anrop med rätt huvud —
och nyckeln måste då ligga i **Supabase Vault**, aldrig i en migration.
Mer att bygga och ett beroende till, men ingen månadskostnad.

`expire-loyalty` klarar sig på alla tre: den är dygnsvis redan.

### Regionen är däremot inget problem

`"regions": ["arn1"]` är **en** region, och Hobby tillåter en. Flera hade fallit
före bygget; en gör det inte.

---

## Använd inte projektet `burp-web-admin`

Det finns ett Vercel-projekt med det namnet, och det är inte Burp:

| | Värde | Borde vara |
|---|---|---|
| Framework | `vite` | `nextjs` |
| Root Directory | `web-admin` | repo-roten (`./`) |
| Senaste bygge | 2025-07-02, `ERROR` | — |
| `live` | `false` | — |

Byggloggen säger *"The specified Root Directory 'web-admin' does not exist."*
Katalogen finns inte i repot och har aldrig funnits i den här kodbasen —
projektet är ett arv från en tidigare app med samma namn, och det pekar dessutom
på ett `githubRepoId` från innan repot skapades om.

Det har **aldrig byggt den här koden**, och det finns ingen deploy — varken
produktion eller preview — på någon branch. Deploy-flödet i `CLAUDE.md` säger
att varje push till `dev` ger en preview; det stämmer inte i dag, eftersom
ingenting är kopplat.

**Skapa ett nytt projekt** enligt steg 2 i stället för att rätta det gamla. Ett
projekt som bytt ramverk, rotkatalog och repo är enklare att göra om än att
justera.

---

## Steg 1 — Supabase

### Problemet

Organisationen `wikr-wasd's projects` ligger på **free tier**, som tillåter
**två aktiva projekt**. Båda är upptagna:

| Projekt | Ref | Status |
|---|---|---|
| 123-Connect | `lwrdhrpzujexntdohkri` | aktiv |
| 123-connect-dev | `culxndmngrotmcftjxrx` | aktiv |
| 123Drive | `tiwqxeucbjfmzrboiccz` | pausad |
| 123Hansa | `pmtnrqtkuygyyodcovds` | pausad |

Ett nytt projekt går alltså inte att skapa förrän något ändras.

### Alternativen

**A. Uppgradera till Pro — 25 USD/månad**
Ger obegränsat antal projekt plus daglig backup och point-in-time recovery.
Rimligt så fort Burp har riktig data i sig, eftersom free tier inte har backup.
`Supabase Dashboard → Organization → Billing → Upgrade`

**B. Pausa 123-connect-dev**
Frigör en plats direkt. 123Connects preview-deployer slutar då fungera mot
databasen tills den återaktiveras. Ditt val — jag pausar den inte utan att du
säger till.

**C. Kör lokalt tills vidare**
Fungerar för allt utom att dela en preview med någon annan:

```bash
npx supabase start
npx supabase db reset
```

### När en plats är ledig

```bash
# Skapa projektet i dashboarden: Region eu-north-1 (Stockholm).
# Namn: burp-prod respektive burp-dev.

npx supabase link --project-ref <ref>
npx supabase db push          # kör migrations 0001–0010
```

Hämta nycklarna från `Project Settings → API` och lägg i `apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_PROJECT_ID=<ref>
```

Generera QR-nyckeln en gång och rör den sedan aldrig:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

⚠️ Byts `QR_TOKEN_SECRET` slutar **alla** utskrivna QR-dekaler att fungera.

Kontrollera efteråt att PostGIS finns — migration `0001` kräver den. På vissa
plandkonfigurationer måste tillägget aktiveras i `Database → Extensions` först.

---

## Steg 2 — Vercel

Vercel CLI är inte installerad och ingen inloggning finns på maskinen, så det
här steget måste du göra.

### Enklast: importera från dashboarden

1. `vercel.com/new` → importera `wikr-wasd/burp`
2. **Root Directory:** lämna som repo-roten (`./`). `vercel.json` pekar redan ut
   `apps/web/.next` som output och kör `npm run build` från roten, vilket bygger
   `@burp/core` först.
3. **Framework Preset:** Next.js
4. **Region:** Stockholm (`arn1`) — redan satt i `vercel.json`
5. Lägg in miljövariablerna:

| Variabel | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | burp-prod | burp-dev |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | burp-prod | burp-dev |
| `SUPABASE_SERVICE_ROLE_KEY` | burp-prod | burp-dev |
| `QR_TOKEN_SECRET` | eget värde | eget värde |
| `NEXT_PUBLIC_SITE_URL` | `https://burp.se` | preview-URL |
| `BURP_DEFAULT_FEE_BPS` | `340` | `340` |

`SUPABASE_SERVICE_ROLE_KEY` ska markeras som **Sensitive**.

Prod och preview måste peka på **olika** Supabase-projekt. Gör de inte det
skriver en preview-deploy i produktionsdatabasen.

### Eller via CLI

```bash
npx vercel login
npx vercel link          # koppla mappen till projektet
npx vercel env add QR_TOKEN_SECRET production
npx vercel                # preview-deploy
```

Deploya inte till produktion (`npx vercel --prod`) förrän en preview är godkänd
— se deploy-flödet i `CLAUDE.md`.

---

## Steg 3 — verifiera

```bash
curl https://<preview-url>/api/health
```

Ska ge `{"status":"ok","database":"ok",...}`. Får du `"degraded"` når appen inte
databasen — kontrollera miljövariablerna först.

---

## Innan produktion

Utöver de öppna frågorna i `OPEN-QUESTIONS.md`:

- [ ] Byt rate limitern mot Redis — den nuvarande ligger i processminnet och
      ger varje Vercel-instans en egen räknare (`apps/web/src/lib/rate-limit.ts`)
- [ ] Slå på e-postbekräftelse i Supabase Auth (avstängt lokalt)
- [ ] Sätt `NEXT_PUBLIC_SITE_URL` och Supabase `Site URL` till riktiga domänen
- [ ] Aktivera daglig backup (kräver Pro)
- [ ] Kör `npx supabase db lint` och gå igenom Security Advisor i dashboarden
- [ ] Personuppgiftsbiträdesavtal med varje restaurang
