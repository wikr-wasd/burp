# Öppna frågor

De sju frågorna ur arkitekturunderlaget, med status och var i koden svaret ska landa.

Frågorna är inte formaliteter. Fråga 1 och 5 blockerar Fas 1 — utan svar går det
inte att ta betalt. Fråga 4 kan blockera lanseringen av QR-flödet helt.

---

## 1. Vad räknas 3,4 % på, och ligger kortavgiften ovanpå eller inuti?

**Status:** obesvarad · **Blockerar:** Fas 1 (betalning)

Tre delfrågor:

1. **Basen** — ordersumma inkl. eller exkl. moms, med eller utan leveransavgift?
2. **Kortavgiften** — betalleverantören tar sin egen avgift ovanpå. Är 3,4 %
   Burps nettomarginal eller allt restaurangen betalar? Är det allt, äter
   kortavgiften (typiskt 1,4–2,9 % + fast belopp) upp en stor del av marginalen.
3. **Dricks** — ska inte ligga i basen. Detta är redan avgjort i koden.

**Så här är det byggt i väntan på svar:**

- `restaurants.fee_base` är en enum: `GROSS_ITEMS` (utgångsläge), `NET_ITEMS`,
  `GROSS_TOTAL`. Modellen kan alltså bytas utan migration.
- `fees` sparar bas, procentsats **och** beräknat belopp per order. Ändras
  modellen skrivs historiken inte om — en order från i fjol visar fortfarande
  vad som faktiskt togs ut.
- `fees.provider_fee_ore` finns men fylls inte. Kolumnen väntar på svaret på
  delfråga 2.
- `restaurants.fee_override_bps` finns för specialavtal.
- `calculateFee()` i `@burp/core` drar **inte** kortavgiften, eftersom det inte
  är bestämt om den ska dras. Koden låtsas inte veta.

**Rekommendation:** `GROSS_ITEMS` som bas och kortavgiften ovanpå (restaurangen
betalar 3,4 % till Burp plus leverantörens avgift). Det är enklast att förklara
i ett säljsamtal och gör Burps marginal förutsägbar. Men det är ett affärsbeslut,
inte ett tekniskt.

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

**Status:** obesvarad · **Blockerar:** Fas 1 (kassaflödet)

En serviceavgift på gästen skulle vara en ny rad i `orders`. Finns inte idag.

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
| Dricks i avgiftsunderlaget? | Nej. Dricks är gästens pengar till personalen | `calculateFee()`, `tips`-tabellen |
| Lagrat lojalitetssaldo? | Nej. Saldot räknas ur händelseloggen | `loyalty_transactions` |
| Får klienten skicka priser? | Nej. Servern räknar om från menyn | `POST /api/orders` |
| Statiska eller dynamiska QR-koder? | Statiska. De trycks på dekaler | `tables.qr_public_id` |
| Pengar som decimaltal? | Nej. Heltal öre överallt | `@burp/core/money` |
