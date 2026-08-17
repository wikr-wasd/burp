# Öppna frågor

De sju frågorna ur arkitekturunderlaget, med status och var i koden svaret ska
landa. Fråga 8 tillkom när kartsidan byggdes, fråga 9 och 10 när koden mättes
mot UI-mockuperna.

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

**b) Kontant betalning ska registreras av restaurangen.** Byggd som en **egen
kassavy** (`/dashboard/kassa`), beslutat 2026-08-16.

Valet stod mellan att lägga beloppsfrågan på "Serverad"-knappen, att bygga en
egen vy, och att tvinga fram en betalningsrad med en databastrigger. Kassavyn
vann därför att kassan och köket är olika platser och olika personer: knappen
hade gjort köksskärmen till en kassaapparat, och en order som kocken slutför
hade ändå aldrig blivit kvitterad. En tvingande trigger hade låtit maten stå
kvar i luckan för att en siffra saknades.

Så här fungerar den:

- Vyn visar slutförda order från det senaste dygnet, delade i **att kvittera**
  och **kvitterat**. Ett dygn räcker för ett pass; en obetald order från förra
  veckan är ett bokföringsärende, inte en nota någon jagar i kassan.
- Fältet är förifyllt med notan men går att ändra. Serbiska dinarer har noll
  decimaler och bosniska sedlar slutar i praktiken på hela och halva mark — en
  nota på 12,37 KM betalas med 12,40. Ett fält som vägrar ta emot det tvingar
  fram en felaktig siffra, och det är sämre än en synlig avvikelse.
- Avvikelsen räknas ut av `settleCash()` i `@burp/core` och visas **innan** man
  trycker. Beloppet som sparas är det som faktiskt togs emot; avvikelsen och
  ordersumman läggs i `provider_payload` så att frågan "varför gick kassan plus
  3 fening i fredags" har ett svar.
- Servitören (`staff`) får kvittera, inte bara ägaren. Kravet att kräva ägaren
  för varje nota hade betytt att ingen kvitterar något en fredag kväll.
  `kitchen` får inte — köket hanterar mat.

Spärrarna ligger i databasen och inte i gränssnittet (migration 0024): ett
partiellt unikt index gör dubbelkvittering omöjlig, en check-constraint kräver
att en kontantrad är `CAPTURED` med tidpunkt, och det finns varken UPDATE- eller
DELETE-policy. En felkvittering rättas med en motbokning när
återbetalningsflödet byggs, inte genom att skriva om historien — samma princip
som `order_events` och `loyalty_transactions`.

Att notera: `payments.order_id` är `not null`, alltså en betalning per order.
Ett bordssällskap som betalar tre order i en klump får tre rader. Det är vad
schemat stödjer och det räcker för avstämning — men det är inte samma sak som
en gemensam nota per bord, och den dagen någon vill ha det krävs en
schemaändring.

---

## 7. Hur hanteras moms på Burps avgift gentemot restaurangen?

**Status:** obesvarad · **Blockerar:** Fas 1 (bokföringsunderlag)

Burps avgift är en tjänst till restaurangen och bär sannolikt 25 % moms. Det
påverkar vad som ska stå på restaurangens underlag och hur `payouts` redovisas.
Fråga en revisor.

---

## 8. Vem levererar kartrutorna?

**Status:** obesvarad · **Blockerar:** lansering av `/upptack`

Kartsidan är byggd och fungerar. Det som saknas är ett konto hos någon som får
leverera rutorna.

Standardvärdet i `NEXT_PUBLIC_MAP_TILE_URL` pekar på OpenStreetMaps egna
servrar. Det räcker i utveckling, men **deras användningsvillkor tillåter inte
att en publik tjänst hämtar rutor därifrån** — de driftas av donerade medel för
kartredigerarnas skull, inte för produkter. Att lansera med den inställningen är
att bygga på något som när som helst kan spärras, med rätta.

Bytet är två miljövariabler och ingen kod:

```
NEXT_PUBLIC_MAP_TILE_URL=https://…/{z}/{x}/{y}.png?key=…
NEXT_PUBLIC_MAP_TILE_ATTRIBUTION=…
```

Alternativ, i grov ordning efter hur lite de kostar för Burps volym:

| Leverantör | Anmärkning |
|---|---|
| **MapTiler** | Gratisnivå räcker långt. Egen stil går att rita, så kartan kan matcha paletten |
| **Stadia Maps** | Gratis under en tröskel. Kräver att domänen registreras |
| **Protomaps** | Rutorna ligger i en fil man hostar själv. Ingen tredje part alls, men mer att drifta |
| **Google Maps** | Dyrast, och en nyckel som måste rullas i tre miljöer. Gästen har ändå sin egen kartapp för vägbeskrivningen |

Den enskilda restaurangens karta (`map-embed.tsx`) berörs inte — den är en
iframe till openstreetmap.org, inte en ruthämtning, och ryms i villkoren.

En egen stil är värd att väga in: OSM:s standardkarta är blå och grön, och blått
finns annars inte i produkten av ett uttalat skäl.

---

## 9. Ska mörkt läge gälla överallt, eller bara vid bordet?

**Status:** obesvarad · **Blockerar:** ingenting, men avgör vad man ser

Burp följer systemets inställning på varje yta. Mockuperna är ljusa, och en
maskin i mörkt läge visar därför espressomörkt där mockupen visar vitt papper.
Samma tokens, spegelvända — men det ser ut som ett annat designspråk.

Skälet till mörkt läge är gott och gäller **en** yta: QR-menyn läses vid ett
bord på kvällen, ofta i en mörk lokal, och en vit skärm i ansiktet är hela
upplevelsen. Det skälet gäller inte startsidan, kartan eller backoffice.

Tre vägar:

1. **Som idag** — systemets inställning gäller överallt. Mest respektfullt mot
   gästens val, men marknadsföringsytorna ser inte ut som mockupen på hälften
   av alla maskiner.
2. **Ljust överallt utom QR-sidan och kvittona.** De två ytor där skälet
   faktiskt finns behåller mörkt läge; resten är alltid papper. Kostar en
   `color-scheme`-låsning per segment.
3. **Ljust överallt.** Enklast, men ger en vit skärm i ansiktet på en gäst som
   sitter i en mörk ćevabdžinica klockan elva.

Mitt förslag är **2**. Skälet till mörkt läge är platsbundet, och då ska
inställningen vara det också.

---

## 10. Vilken logotyp?

**Status:** obesvarad · **Blockerar:** ingenting akut

`Burp Logo Concepts.dc.html` i designprojektet innehåller **fjorton förslag** i
tre omgångar — wordmark, pratbubbla, skål med ånga, app-ikonplatta, ångprick,
runt monogram, QR-ruta, negative-space-bricka, kursiv rörelse-wordmark,
understreck som bordslinje, och fyra i graffitistil. Inget är valt.

Koden använder i dag **app-ikonplattan** (`1d`): röd ruta med ett B plus
gemen ordbild. Det är den UI-mockuperna använder i varje sidhuvud, så den var
det enda valet som inte hade varit en gissning. Byte är billigt: formen ligger
i `.burp-mark` i `globals.css` och i `lib/brand-glyph.tsx` för ikonerna.

Värt att veta innan valet: de fyra graffitiförslagen har hård skugga och
droppar, vilket är svårt att få skarpt i 32 px favicon och under Androids
maskning. `3d` (skiva-badge) och `1f` (runt monogram) är de som skalar bäst av
de mer utpräglade.

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
