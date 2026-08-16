# Öppna frågor

De sju frågorna ur arkitekturunderlaget, med status och var i koden svaret ska landa.

Frågorna är inte formaliteter. Fråga 5 blockerar Fas 1 — utan svar går det inte
att ta betalt med kort. Fråga 4 kan blockera lanseringen av QR-flödet helt.

Fråga 1 och 6 besvarades 2026-08-16 och står kvar med svaren inskrivna, eftersom
resonemanget bakom dem är det som gör svaren begripliga om ett år.

---

## 1. Vad räknas 3,4 % på, och ligger kortavgiften ovanpå eller inuti?

**Status:** BESVARAD 2026-08-16 · **Blockerar:** ingenting längre

> **Williams svar:** "3,4 % av ordersumman. Alla andra kostnader tar kunden."

Vilket betyder:

1. **Basen** är ordersumman — `GROSS_ITEMS`, alltså mat och dryck inklusive
   moms, utan dricks och utan leveransavgift.
2. **Kortavgiften ligger ovanpå.** 3,4 % är Burps nettomarginal; leverantörens
   avgift bärs av restaurangen, inte av Burp.
3. **Dricks** ligger inte i basen. Var redan avgjort.

**Koden behövde inte ändras.** `GROSS_ITEMS` var utgångsläget och
`calculateFee()` drog aldrig kortavgiften — den låtsades inte veta, och det
visade sig vara rätt. `fees.provider_fee_ore` fylls när en leverantör valts
(fråga 5) och redovisas som restaurangens kostnad, inte som avdrag från Burps
avgift.

**En tolkning värd att invända mot om den är fel:** "ordersumman" läses här som
beloppet gästen betalar, alltså **inklusive moms**. Det är den vanliga
innebörden, men det betyder att 3,4 % delvis räknas på pengar restaurangen bara
förmedlar till staten. Vill du i stället ha basen exklusive moms är bytet en
rad: `restaurants.fee_base` till `NET_ITEMS`, ingen migration, och `fees` sparar
basen per order så att historiken inte skrivs om.

Kvar sedan tidigare, och fortfarande sant:

- `restaurants.fee_base` är en enum: `GROSS_ITEMS`, `NET_ITEMS`, `GROSS_TOTAL`.
- `restaurants.fee_override_bps` finns för specialavtal.

---

## 2. Leverans i egen regi eller via partner?

**Status:** obesvarad · **Blockerar:** Fas 4

Påverkar `orders.type = 'DELIVERY'`, leveranszoner och om det behövs en
kurirapp. Schemat har `delivery_fee_ore` och adresser på plats, så frågan
blockerar ingenting före Fas 4.

---

## 3. Vem bekostar inlösta lojalitetsbelöningar?

**Status:** obesvarad · **Blockerar:** Fas 3

Burp, restaurangen eller delat? Det påverkar hela ekonomin i lojalitetsprogrammet.

`loyalty_transactions` är en händelselogg utan kostnadsbärare idag. När svaret
kommer läggs en kolumn `funded_by` till — loggen behöver inte skrivas om.

---

## 4. Vilka krav på kassaregister gäller i Bosnien, Kroatien och Serbien?

**Status:** obesvarad · **Kan blockera lansering av Fas 2**

> Frågan gällde tidigare Skatteverkets krav på certifierat kassaregister.
> Marknaden är en annan nu, och alla tre länderna har egna regler — Kroatien
> och Serbien har dessutom system för **fiskalisering** där varje kvitto ska
> rapporteras i realtid till skattemyndigheten och förses med en signatur.
> Det är en tyngre integration än det svenska kassaregisterkravet, och den
> skiljer sig mellan länderna.

Hur det slår mot ett flöde där gästen beställer i sin egen telefon vid bordet
är inte utrett. **Detta är en fråga för en lokal skattejurist i varje land,
inte för utvecklingsteamet** — och sannolikt tre olika svar.

`register_receipts` finns i schemat så att en integration kan läggas till utan
ombyggnad. Tabellen fylls inte av någon kod idag.

---

## 5. Hur tas betalt i Bosnien, Kroatien och Serbien?

**Status:** obesvarad · **Blockerar:** kortbetalning, men troligen inte lansering

> Frågan var tidigare ställd för Sverige, med Swish och Klarna som alternativ.
> Den formuleringen var kvar från innan marknaden bestämdes och hade skickat
> arbetet åt fel håll. Det här är omskrivningen.

### Det svåra är utbetalningarna, inte korten

Att ta emot ett kort är den enkla delen. Burp är en marknadsplats: pengarna
kommer från gästen, Burp behåller sin avgift och resten ska till restaurangen.
Att förmedla pengar åt någon annan är reglerad verksamhet, och regleringen är
nationell. **Kroatien ligger i EU/EES, Bosnien och Serbien gör det inte** — och
det är den skiljelinjen som avgör vilka leverantörer som ens är möjliga.

### Tre vägar

| Väg | Innebörd | Kostnad |
|---|---|---|
| **A. Burp rör aldrig pengarna** | Varje restaurang har eget avtal med sin inlösare. Burp fakturerar sin avgift separat, i efterhand | Enklast juridiskt, tyngst att sälja in — restaurangen måste ordna eget avtal |
| **B. Marknadsplatsmodell** | En leverantör med tillstånd i varje land delar betalningen automatiskt | Enklast för restaurangen, kräver en leverantör som täcker alla tre |
| **C. Betalning på plats** | Gästen betalar i lokalen, Burp fakturerar avgiften | Fungerar idag, noll integration |

### Om väg C

Det är läget just nu, och det bör inte avfärdas som ett provisorium.
Kontantbetalning är fortfarande utbredd i restaurangledet i Bosnien och
Serbien, och QR-beställningens värde — slippa vänta på en servitör för att
beställa — finns kvar även när notan betalas i kassan.

Det gör att **kortbetalning sannolikt inte blockerar en lansering**, bara en
del av intäktsmodellen. Det ändrar frågans brådska, inte dess vikt.

### Innan någon leverantör väljs

Följande måste kontrolleras **direkt hos leverantören**, inte i
andrahandskällor. Utbudet i just de här tre länderna ändras, och en uppgift som
var sann förra året kan vara fel idag:

1. Stödjer leverantören **utbetalning** till företag i Bosnien respektive
   Serbien — inte bara mottagning av kort från gäster där?
2. Klarar den **marknadsplatsupplägg** (split payout, application fee) i
   samtliga tre länder, eller bara i det som ligger i EU?
3. Tar den emot **inhemska kort**? DinaCard i Serbien är en betydande andel av
   korten och accepteras inte av alla internationella leverantörer. En lösning
   som bara tar Visa och Mastercard utestänger en del av gästerna.
4. Vad kostar en utbetalning i **BAM och RSD**, och vem bär växlingskostnaden
   om leverantören avräknar i euro?

Punkt 3 och 4 är de som brukar glömmas och som avgör om lösningen fungerar i
praktiken snarare än på papperet.

### Vad koden redan tål

Schemat är leverantörsneutralt: `payments.provider` och `provider_reference`
räcker för vilken som helst av vägarna utan schemaändring. `orders.currency`
är fryst per order (migration 0020), så en utbetalning kan alltid härledas till
rätt valuta i efterhand.

Ingen kod behöver skrivas om beroende på vilket svar frågan får. Det som
tillkommer är en webhook-hanterare och en statusövergång — inte en ommöblering.

## 6. Ska Burp ta betalt av gästen också, eller bara av restaurangen?

**Status:** BESVARAD 2026-08-16 · **Blockerar:** delvis fortfarande Fas 1

> **Williams svar:** "Gästen ska kunna betala via vår plattform. Det är det som
> är bäst. Vi ska även ställa krav att restaurangen skriver in summan som är
> betald om besökaren betalar kontant."

Två saker, med olika brådska:

**a) Gästen betalar i plattformen.** Det är riktningen, men den kan inte byggas
förrän fråga 5 har ett svar — det går inte att ta emot ett kort utan en
leverantör, och det svåra i fråga 5 är just utbetalningarna till Bosnien och
Serbien. Den här raden väntar alltså på fråga 5, inte tvärtom.

Observera att svaret **inte** säger att gästen ska betala en serviceavgift till
Burp. "Betala via plattformen" är var pengarna passerar, inte vem som betalar
avgiften. Enligt fråga 1 bär restaurangen avgiften. En serviceavgift på gästen
vore fortfarande en ny rad i `orders` och finns inte.

**b) Kontant betalning ska registreras av restaurangen.** Inte blockerad av
något — men inte heller byggd, för den kräver ett beslut som svaret inte ger.
Idag skrivs `payments` inte av någon kod alls.

Varför det behövs är däremot klart: utan registrering finns ingen
kassaavstämning och inget bekräftat underlag för Burps avgift på en
kontantorder. Restaurangen skulle betala 3,4 % på en siffra ingen kvitterat.

**Beslutet som saknas: var i flödet, och ska det gå att hoppa över?**

Ordern försvinner från dashboarden i samma stund den blir `COMPLETED`
(`getActiveOrders` visar bara aktiva). Betalningen måste därför fångas **vid**
slutförandet, eller så behövs en ny vy för slutförda-men-obetalda order.

| Väg | Innebörd | Kostnad |
|---|---|---|
| **A. Vid "Serverad" på dashboarden** | Knappen frågar efter mottaget belopp innan ordern slutförs | Minst kod. Men köksskärmen har samma knapp och ska INTE hantera pengar — en order slutförd i köket blir aldrig registrerad |
| **B. Egen kassavy** | Lista över slutförda order utan betalning, som betas av | Ärligast mot verkligheten: notan betalas i kassan, inte vid pass-luckan. Mer att bygga |
| **C. Tvingande i databasen** | En trigger vägrar `COMPLETED` utan betalningsrad | Stänger hålet helt, men låser köksskärmen — kocken kan inte längre säga att maten är serverad |

**Rekommendation: B.** Kassan och köket är olika platser och olika personer, och
A gör köksskärmen till en kassaapparat för att spara en vy. C låter maten stå
kvar i luckan för att en siffra saknas.

Att notera för alla tre: `payments.order_id` är `not null`, alltså en betalning
per order. Ett bordssällskap som betalar tre order i en klump får tre rader.
Det är vad schemat stödjer, och det räcker för avstämning — men det är inte
samma sak som en gemensam nota per bord.

---

## 7. Hur hanteras moms på Burps avgift gentemot restaurangen?

**Status:** obesvarad · **Blockerar:** Fas 1 (bokföringsunderlag)

Burps avgift är en tjänst till restaurangen och bär sannolikt 25 % moms. Det
påverkar vad som ska stå på restaurangens underlag och hur `payouts` redovisas.
Fråga en revisor.

---

## Beslutade frågor

| Fråga | Beslut | Var |
|---|---|---|
| Vad räknas 3,4 % på? | Ordersumman inkl. moms, utan dricks — `GROSS_ITEMS` | `calculateFee()`, `restaurants.fee_base` |
| Ligger kortavgiften ovanpå? | Ja. 3,4 % är Burps netto; restaurangen bär leverantörens avgift | `fees.provider_fee_ore` |
| Ska gästen kunna betala i plattformen? | Ja — men väntar på fråga 5 | — |
| Dricks i avgiftsunderlaget? | Nej. Dricks är gästens pengar till personalen | `calculateFee()`, `tips`-tabellen |
| Lagrat lojalitetssaldo? | Nej. Saldot räknas ur händelseloggen | `loyalty_transactions` |
| Får klienten skicka priser? | Nej. Servern räknar om från menyn | `POST /api/orders` |
| Statiska eller dynamiska QR-koder? | Statiska. De trycks på dekaler | `tables.qr_public_id` |
| Pengar som decimaltal? | Nej. Heltal öre överallt | `@burp/core/money` |
