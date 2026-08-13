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

## 4. Krävs certifierat kassaregister för QR-flödet?

**Status:** obesvarad · **Kan blockera lansering av Fas 2**

Sverige har krav på certifierat kassaregister vid försäljning på plats. Hur det
slår mot ett flöde där gästen betalar i sin egen telefon vid bordet är inte
utrett. **Detta är en fråga för Skatteverket eller en skattejurist, inte för
utvecklingsteamet.**

`register_receipts` finns i schemat så att en integration kan läggas till utan
ombyggnad. Tabellen fylls inte av någon kod idag.

---

## 5. Vilken betalleverantör och vilka betalsätt i Sverige?

**Status:** obesvarad · **Blockerar:** Fas 1

| Leverantör | För | Emot |
|---|---|---|
| Stripe Connect | Enklast att komma igång. Application fee dras automatiskt. Bra dokumentation | Svagare på lokala nordiska betalsätt |
| Adyen for Platforms | Starkare i Norden, bättre lokala betalsätt | Tyngre onboarding, högre tröskel |
| Klarna | Stark i Sverige | Mindre byggd för marknadsplatsutbetalningar |

**Swish:** kontrollera direkt med leverantören vad de stödjer just nu. Läget
ändras och det går inte att lita på andrahandsuppgifter här.

Schemat är leverantörsneutralt: `payments.provider` + `provider_reference`
räcker för alla tre utan schemaändring.

---

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
