# Säkerhet — förtroendegränserna

Vad som håller vad, och var gränserna faktiskt går.

Dokumentet finns av ett konkret skäl. Den 2026-09-02 hittades ett hål som legat
sedan migration 0017: en restaurangägare kunde godkänna sin egen bild och
publicera den på en indexerad sida, förbi hela Burps granskning. Kommentaren i
koden påstod uttryckligen att det inte gick. Hålet var inte svårt att se — det
var svårt att se *att någon borde ha tittat*, eftersom ingenting samlade
gränserna på ett ställe.

Ett besläktat hål är fortfarande öppet. Det står under **Kända svagheter**.

---

## De fem lagren, uppifrån och ner

Ett lager som saknas gör de andra svagare, men bara ett av dem håller ensamt.

| Lager | Vad det gör | Går det runt? |
|---|---|---|
| **Proxy** (`proxy.ts`) | Omdirigerar den som inte får vara på en yta | **Ja.** Anropa PostgREST direkt |
| **Server components** | Visar inte det personen inte får se | **Ja.** Samma sak |
| **Serveråtgärder / route handlers** | Prövar roll med `requireStaff()` | Nej för den vägen — men den är inte enda vägen in |
| **RLS-policyer** | Avgör vilka RADER en roll når | Nej. Sista ordet för allt utom service role |
| **Triggers och constraints** | Avgör vad som får ÄNDRAS, och till vad | Nej. Gäller även service role |

**Grundregeln:** allt som en klient kan anropa direkt måste hålla i lager fyra
eller fem. Lager ett och två är upplevelse, inte skydd.

Tvåstegsverifieringen är byggd så: `proxy.ts` omdirigerar, `lib/mfa.ts` svarar i
server components, och `mfa_satisfied()` (migration 0051) sitter inuti
`is_staff_of`, `has_role_at`, `is_platform_admin` och `has_platform_role`. Utan
databaslagret vore hela funktionen en omdirigering, och en omdirigering går runt
genom att skicka samma access-token till PostgREST.

---

## Vad RLS inte kan

Det här är den viktigaste sidan i dokumentet, för det är precis här hålet i
`media` uppstod.

**En policy ser bara den nya raden.** `with check` får den rad som är på väg in.
Den kan inte jämföra mot den gamla, och kan därför inte uttrycka regeln
"kolumnen får inte ÄNDRAS". En ny rad med `status = 'APPROVED'` är omöjlig att
skilja från en rad som redan var godkänd.

**Policyer är tillåtande och OR:as ihop.** Att plattformen har en egen policy
begränsar ingenting. Finns det en policy som släpper igenom, går det igenom.

**`for all` prövar handlingen, inte innehållet.** `media_write_staff` gav
owner/manager rätt att skriva sina egna rader — vilket lät rimligt, och råkade
inkludera `status`.

**Följden:** en regel om *övergångar* ska vara en trigger, inte en policy.
`media_status_guard` och `restaurant_documents_status_guard` (migrationerna 0063
och 0064) är skrivna så, och de släpper igenom när `auth.uid()` är null —
service role, bakgrundsjobb och migrationer ska inte spärras ute.

**RLS utan GRANT är verkningslös.** Policyn gäller, men rollen har inga
tabellrättigheter alls och frågan avvisas innan policyn ens utvärderas.
Migration 0012 finns för att det felet redan begåtts, och `verify-schema.sh`
kontrollerar det numera. Varje ny tabell behöver **båda**.

---

## Service role

`createAdminClient()` kringgår all RLS. Den används på fyra ställen där en
policy inte räcker:

1. **QR-flödet** — gästen är anonym och har inget `auth.uid()`. Skyddet ligger i
   bordstokenet, som servern verifierar innan något skrivs.
2. **Webhooks** — betalleverantören har ingen session. Skyddet är signaturen.
3. **Bakgrundsjobb** — poängutgång, notiskön. Skyddet är en delad nyckel, och
   röktestet prövar att fel nyckel ger 401.
4. **GDPR-export och radering** — funktionerna läser tvärs över tabeller där
   gästen saknar egen policy. En RLS-baserad export hade blivit *ofullständig*,
   vilket är sämre än ingen. Skyddet är att id:t aldrig kommer från klienten:
   anroparen skickar sessionens eget id, hämtat med `getUser()`.

**Varje sådant anrop måste smalna av sin egen fråga.** Begränsningen behöver
inte stå som `restaurant_id` i just den raden — den ärvs ofta — men en fråga
utan filter alls får aldrig förekomma. `npm run check:service-role` prövar det
över samtliga anrop, och en fråga som verkligen ska gå över hela plattformen
måste märkas ut:

```ts
// service-role: hela plattformen — <skälet>
```

---

## Gästen vid bordet

Den känsligaste ytan i produkten, och den enda där en anonym besökare får
skriva.

- **Bordstokenet** är signerat med `QR_TOKEN_SECRET`. Det byts **aldrig** i
  produktion — ett byte ogiltigförklarar samtliga utskrivna dekaler hos alla
  restauranger.
- **Klienten skickar aldrig ett pris.** `POST /api/orders` tar emot *vad* som
  beställs. Servern hämtar priserna ur menyn och räknar med `@burp/core`.
  Skickar klienten sin egen summa används den bara som kontroll — avviker den
  avbryts ordern, den justeras aldrig tyst.
- **Samma regel gäller allt som ändrar summan.** Kupongkod, presentkortskod och
  klippkort skickas som *koder*, aldrig som rabatter eller belopp. Servern slår
  upp villkoren och räknar.
- **Rate limiting** på orderskapande: tio per minut. Röktestet lägger fler med
  flit och väntar ut fönstret i stället för att höja gränsen — en gräns som
  testet kringgår är inte testad.

---

## Modererat innehåll

Allt en restaurang laddar upp hamnar på en sida som Google indexerar, under
Burps domän. Burp står alltså som värd för det.

- **Bilder** (`media`) och **dokument** (`restaurant_documents`) börjar som
  `PENDING` och syns inte för gästen förrän en plattformsadmin godkänt dem.
- **Statusen ändras bara av plattformen.** Grinden är en trigger, se ovan.
- **Granskningen visar det gästen ser.** Bildjusteringen (migration 0063) ritas
  i granskningskön med samma funktion som gästsidan använder. Annars godkänner
  Burp en bild och restaurangen visar en annan.
- **Bucketarna är publika.** Modereringen avgör vad som *visas på Burp*, inte
  vad som går att nå med en gissad URL — och sökvägarna innehåller ett slumpat
  uuid. En privat bucket hade kostat en signering per bild i varje meny, varje
  laddning.

---

## Loggar som inte går att skriva om

`order_events` och `loyalty_transactions` har triggers som blockerar UPDATE och
DELETE. Det gäller **även service role**.

Skälet är att de är bevis. En logg som går att ändra i efterhand bevisar
ingenting, och båda används för att svara på frågan "vad hände med pengarna".

Av samma skäl lagras **aldrig** ett lojalitetssaldo. Det räknas ur
transaktionerna. Ett lagrat saldo kan hamna i otakt med sin logg; en summa över
loggen kan det inte.

---

## Personuppgifter

Se `docs/PERSONUPPGIFTER.md` för vad som samlas in, var det ligger och vem som
rör det.

Kort: gästen kan hämta allt Burp har om henne som JSON (artikel 20) och radera
sig själv (artikel 17). Raderingen sker i **en** transaktion i databasen.
Bokföringen står kvar utan person — order, avgifter och omdömesbetyg finns kvar,
allt som pekar ut någon är borta. Att bara radera raderna går inte: de
oföränderliga loggarna hänger i dem.

---

## Content-Security-Policy

`lib/csp.ts` bygger policyn, `proxy.ts` sätter den som
**`Content-Security-Policy-Report-Only`**. Den blockerar alltså ingenting än.

**Innan den slås på måste ISR-frågan lösas.** En nonce måste vara ny per request,
och tre rutter är cachade i en timme — stadssidan, kökssidan och
restaurangsidan. De får därför `'unsafe-inline'` i stället för en nonce, och det
är just de sidorna som bär mest text från restaurangerna.

Röktestet kontrollerar att policyn skickas, att en dynamisk sida får en nonce,
att Next stämplar sina skript med samma nonce, att en cachad sida får den
nonce-fria varianten, och att `form-action`, `base-uri`, `object-src` och
`frame-ancestors` finns med.

---

## Kända svagheter

### 1. En godkänd bild kan bytas ut i Storage — ÖPPEN

Storage-policyn `"personal ersätter sina egna bilder"` (migration 0017) tillåter
UPDATE på objektet. En restaurang kan ladda upp en oskyldig bild, få den
godkänd, och sedan skriva över filen på samma sökväg. Pekaren i
`menu_items.image_url` ändras inte — den pekar på en sökväg, inte på ett
innehåll — så granskningen märker ingenting.

Dokumenten har därför **ingen** UPDATE-policy: en PDF byts genom att tas bort
och laddas upp på nytt, vilket ger en ny rad i kön.

Tre vägar, beslutet står i `docs/TODO.md`. Rekommendationen är att ta bort
UPDATE-policyn även för bilder.

### 2. CSP går i rapportläge

Se ovan. Den skyddar ingenting förrän ISR-frågan är löst.

### 3. Bucketarna är publika

Medvetet, se **Modererat innehåll**. Det betyder att en ogranskad bild går att
nå för den som känner till den slumpade sökvägen — men aldrig att hitta den
genom Burp.

---

## Att lägga till en tabell

1. `enable row level security`
2. Policyer för varje roll som ska nå den
3. **GRANT** — utan den är policyn verkningslös
4. Trigger för varje regel som handlar om en *övergång* och inte om en rad
5. Ett logiktest i `scripts/verify-schema-tests.sql` som prövar att en obehörig
   faktiskt nekas — som **inloggad** användare, inte som superanvändare, för som
   superanvändare är `auth.uid()` null och grindarna släpper igenom med flit
6. `npm run db:verify` mot en ren databas

Punkt fem är den som saknades i tio månader.
