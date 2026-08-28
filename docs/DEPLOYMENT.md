# Deployment — koppla Supabase och Vercel

Repot är kopplat till GitHub. Supabase och Vercel kräver inloggning som måste
göras av dig — stegen nedan är det som återstår.

| | Status |
|---|---|
| GitHub | ✅ `github.com/wikr-wasd/burp`, brancher `main` och `dev` |
| Supabase | ⏸ **kör lokalt tills vidare** (beslut 2026-08-28). Se steg 1 |
| Vercel | ⏸ **inget projekt bygger repot** — väntar på databasen. Se steg 2 |

---

## Cron: en gång per dygn, för att Hobby inte tillåter mer

**Kontrollerat 2026-08-28 mot Vercels egen dokumentation och mot kontot.
Beslutat samma dag.**

Kontot `wikr-wasd's projects` ligger på **Hobby**. `vercel.json` innehåller två
cron-jobb:

| Sökväg | Schema | Hobby |
|---|---|---|
| `/api/jobs/expire-loyalty` | `0 4 * * *` | ✅ en gång per dygn |
| `/api/jobs/send-notices` | `0 5 * * *` | ✅ sedan 2026-08-28 |

Notisjobbet stod på `* * * * *` och hade fällt deployen innan bygget ens
började.

Vercels dokumentation (`/docs/cron-jobs/usage-and-pricing`, uppdaterad
2026-07-15) är otvetydig: på Hobby är minsta intervall **en gång per dygn**, och
*"cron expressions that would run more frequently will fail during deployment"*
med felet *"Hobby accounts are limited to daily cron jobs."*

**Repot går alltså inte att deploya till det här kontot som det står.** Det
faller innan bygget ens börjar, och felet handlar om en cron-rad — inte om
koden — vilket är precis den sortens fel man letar på fel ställe i en timme.

### Beslutet, och vad det kostar

**Valt: dygnsvist notisjobb.** Ingen månadskostnad och ingen ny infrastruktur.
De två alternativen var Vercel Pro (20 USD/mån, cron per minut) och `pg_cron` i
Supabase som ringer endpointen med `CRON_SECRET` ur Vault.

Säg följden rakt ut, för den är inte liten: **notiskön töms en gång i dygnet,
och ingen annan kodväg tömmer den.** En gäst vars order blir klar 12:00 får sitt
besked runt 05:00 dagen efter — och eftersom brevet ligger i samma jobb gäller
det brevet också. I den takten är "sen med beskedet" inte skilt från "missade
beskedet": det handlar om mat som står färdig nu.

`sendPendingNotices()` är alltså **i praktiken av i produktion** tills planen
tillåter tätare. Raden ska ställas tillbaka till `* * * * *` samma dag kontot
blir Pro; det är en rad i `vercel.json` och ingenting annat.

Lokalt gäller inget av detta. `smoke.sh` anropar jobbet direkt och mäter
utfallet, så täckningen är oförändrad.

`expire-loyalty` berörs inte: den är dygnsvis redan, och det är rätt takt för
den.

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

**C. Kör lokalt tills vidare — VALT 2026-08-28**
Fungerar för allt utom att dela en preview med någon annan. Så länge det här
gäller finns ingen deploy att skapa, och steg 2 väntar på steg 1:

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
- [ ] Kör `npm run db:lint` och gå igenom Security Advisor i dashboarden

      Punkten sa `npx supabase db lint` rakt av fram till 2026-08-28. Kört så
      ger den sjutton träffar, varav **noll** i Burps kod: allt kommer ur
      PostGIS egna plpgsql-funktioner, och flera av dem står som `error` —
      `lockrow` refererar en tabell som bara finns med långa transaktioner
      påslagna, `postgis_full_version` anropar en funktion ur raster-tillägget.
      Normalt i varje PostGIS-installation, och ingenting vi kan rätta.

      En kontroll som alltid larmar lärs bort första gången någon har bråttom.
      `npm run db:lint` kör samma lint men rapporterar bara funktioner som
      skapas i `supabase/migrations/`, och faller bara på `error`-nivå. Senast
      kört 2026-08-28: 104 egna funktioner, inga anmärkningar.
- [ ] Personuppgiftsbiträdesavtal med varje restaurang
