# Personuppgifter — vad Burp faktiskt har

Kartan över vilka personuppgifter som samlas in, var de ligger, vem som rör dem
och vad som händer när någon vill bli glömd.

**Det här är inte en integritetspolicy.** En policy är en text riktad till den
registrerade och måste ligga som en sida i produkten, på alla fem språken. Den
finns ännu inte — se **Vad som saknas** sist. Det här dokumentet är underlaget
en sådan text ska bygga på, härlett ur schemat och koden så att policyn kan
säga sant.

Uppgifterna nedan är avlästa ur den lokala stacken 2026-09-02.

---

## Vad som samlas in

### Gästen med konto

| Tabell | Fält | Varför |
|---|---|---|
| `profiles` | `full_name`, `email`, `phone`, `birth_date` | Kontot. Namnet är valfritt vid registrering |
| `addresses` | `street_address` | Leveransadresser gästen sparat själv |
| `orders` | `guest_id`, `note`, `guest_locale` | Kopplingen order → person. Noten är gästens egen text |
| `favorites`, `routes` | `user_id`, `name`, `note` | Sparade restauranger och egna rutter |
| `loyalty_accounts` | `user_id` | Kopplingen till poängloggen |
| `reviews` | `user_id` | Omdömet är knutet till en genomförd order |
| `push_subscriptions` | `user_id` + webbläsarens push-nyckel | Notiser gästen slagit på själv |

`profiles.marketing_opt_in` finns med `false` som standard. Utskick får bara gå
till den som kryssat i.

### Gästen vid bordet — utan konto

QR-flödet kräver **varken app eller konto**. Det som skrivs är ordern och
bordssessionen. `table_sessions` bär `guest_count`, alltså ett antal, inte en
person. Gästens språk sparas på ordern för att kvittot ska komma på rätt språk.

Det här är avsiktligt den minst identifierande vägen genom produkten.

### Bordsbokningen

`reservations` bär `guest_name`, `guest_phone`, `guest_email` och `note` — även
för den som inte har konto. Restaurangen måste kunna nå den som bokat.
`cancel_token` är gästens nyckel att avboka utan inloggning.

### Personalen

`staff` (`user_id`, `locale`), `staff_invitations` (`email`, `token_hash`) och
`security_events` (`user_id`, `note`) — vem som återställde en andra faktor, och
vem som rörde pengarna.

---

## Var det ligger

| Var | Vad |
|---|---|
| **Supabase Postgres** | Allt ovan |
| **Supabase Auth** (`auth.users`) | E-post, lösenordshash, MFA-faktorer |
| **Supabase Storage** | Bilder och dokument restaurangerna laddat upp |

**Regionen är inte fastställd i det här repot.** Den sätts på projektet i
Supabase-molnet och måste vara inom EU/EES. Det är en punkt att kontrollera, inte
att anta — se **Vad som saknas**.

---

## Vem uppgifterna delas med

Avläst ur `.env.example`, alltså det koden faktiskt kan tala med:

| Mottagare | Vad som lämnar Burp | Aktiv? |
|---|---|---|
| **Supabase** | Allt. Databas, auth och lagring | Ja |
| **Resend** | E-postadress och brevets innehåll: orderbesked, bokningar, inbjudningar | Bara med `RESEND_API_KEY`; annars skrivs breven i loggen |
| **Stripe** | Betalningsuppgifter. Burp håller **aldrig** gästens pengar — restaurangen äger sitt eget inlösenavtal (öppen fråga 5) | Adapter klar, går mot testnycklar |
| **Sentry** | Felrapporter. Nycklar i adresser skrubbas bort innan de skickas (2026-09-01) | Först när `NEXT_PUBLIC_SENTRY_DSN` sätts. Organisationen ligger på EU-regionen |
| **Webbläsarens push-tjänst** | Notisens innehåll, till den slutpunkt gästen själv gav | Bara för den som slagit på notiser |
| **Kartleverantör** | Gästens IP mot den som levererar kartrutorna | **Inte vald än** — öppen fråga 8 |

Monri läggs på samma gränssnitt som Stripe när avtalet finns.

---

## Rättigheterna, och att de faktiskt fungerar

Mekaniken finns byggd och röktestad. Migration 0041 och `lib/gdpr.ts`.

**Rätt till en kopia (artikel 20).** `exportGuestData()` ger allt Burp har om
gästen som JSON. Nycklarna står på engelska med flit: kravet är ett
maskinläsbart format, och en nyckel som byter namn med gästens språkval är inte
maskinläsbar. Text gästen själv skrivit står som hon skrev den.

**Rätt att bli glömd (artikel 17).** `eraseGuest()` kör hela raderingen i **en**
transaktion. Bokföringen står kvar utan person: order, avgifter och
omdömesbetyg finns kvar, allt som pekar ut någon är borta.

Att bara radera raderna går inte, och det är värt att förstå varför:
`order_events` och `loyalty_transactions` har triggers som blockerar DELETE —
även för service role. De är bevis på vad som hänt med pengarna. Raderingen
**avidentifierar** därför i stället för att ta bort, och det är ett medvetet val
som en policytext måste beskriva ärligt.

Båda går genom service role, vilket regel 5 pekar ut som berättigat: en
RLS-baserad export hade blivit ofullständig, och en ofullständig export är sämre
än ingen. Id:t kommer aldrig från klienten — det hämtas ur den verifierade
sessionen med `getUser()`.

---

## Vad som saknas

Rangordnat. Punkt 1 och 2 är krav, inte förbättringar.

1. **Integritetspolicy som sida i produkten**, på alla fem språken, länkad från
   sidfoten. GDPR kräver att den registrerade får veta vad som samlas in och
   varför **innan** insamlingen. Mekaniken finns; texten gör det inte.
   **Kräver beslut:** vilka underbiträden som gäller vid lansering, och deras
   regioner.

2. **Användarvillkor** — två uppsättningar. Gästens, och restaurangens (där
   avgiften, uppsägningstiden och ansvaret för menyinnehållet står).
   Affärsdokument, inte tekniska.

3. **Bekräfta Supabase-projektets region.** Ska vara EU/EES. Går inte att läsa
   ur repot.

4. **Personuppgiftsbiträdesavtal mot restaurangerna.** Vem som är
   personuppgiftsansvarig för gästens data när gästen beställer hos restaurangen
   via Burp är en **juridisk** fråga. Den bör ställas till någon som kan rätten i
   Bosnien och Kroatien — inte avgöras här.

5. **Gallringstider.** I dag raderas ingenting automatiskt. En order från 2026
   ligger kvar 2036 om ingen ber om något annat. Bokföringen har lagkrav på
   bevarande; en bordsbokning från i fjol har det inte.

6. **Rutan för marknadsföringssamtycke saknas där gästen skapar konto.**
   `profiles.marketing_opt_in` finns med `false` som standard, vilket betyder att
   listan med största sannolikhet är tom. Står redan i `docs/TODO.md`.
