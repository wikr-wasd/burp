# Öppna frågor

De sju frågorna ur arkitekturunderlaget, med status och var i koden svaret ska
landa. Fråga 8 tillkom när kartsidan byggdes, fråga 9 och 10 när koden mättes
mot UI-mockuperna, fråga 12 när avräkningen byggdes, fråga 13 när GDPR-flödet
byggdes, fråga 14 när kortterminalen kom och fråga 15 när William frågade vad
en makulering ska kosta.

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

**Status:** obesvarad för POÄNGEN · **Blockerar:** Fas 3

Burp, restaurangen eller delat? Det påverkar hela ekonomin i lojalitetsprogrammet.

`loyalty_transactions` är fortfarande en händelselogg utan kostnadsbärare.

**Två delsvar finns dock, båda tvingade fram av kod som byggdes 2026-08-19:**

- **Klippkortet** bekostas av restaurangen. Det är vad rubriken säger — "tionde
  besöket bjuder restaurangen på" — och kortet kunde inte byggas utan ett svar.
  `punch_card_redemptions.funded_by` står på raden, så beslutet går att ändra
  utan att historiken skrivs om.
- **Kuponger** bekostas i praktiken delat, eftersom `feeBaseAmount()` drar av
  rabatten ur avgiftsunderlaget: Burp avstår sin avgift på rabatterade pengar.
  `coupons.funded_by` säger vem som äger kampanjen.

Kvar är poängen: vem betalar när en gäst löser in intjänade poäng?

**Ett tekniskt beslut hänger på samma svar (2026-08-19).** När inlösen byggs
måste varje REDEEM veta VILKEN intjäning den förbrukade — partier med
först-in-först-ut. Utan det kan en poäng som redan lösts in gå ut en gång till,
eller tvärtom överleva sitt datum.

I dag skriver ingen kod REDEEM-rader, så frågan är inte akut. Både
`loyalty_balance()` (migration 0042) och `calculateBalance()` i `@burp/core`
räknar därför utan partier och tar ett tak mot saldot, så att det aldrig kan bli
negativt. Det ger rätt svar så länge ingen löser in något — och fel svar första
dagen någon gör det. Testet i `verify-schema-tests.sql` visar båda fallen.

---

## 4. Vilka krav på kassaregister gäller i Bosnien, Kroatien och Serbien?

**Status:** KARTLAGD 2026-08-19, fortfarande obesvarad · **Kan blockera lansering**

Fiskalisering betyder att varje kvitto rapporteras till skattemyndigheten i
realtid och förses med en signatur som ska stå på det. Det är inte bokföring —
det är att staten ser varje försäljning i samma sekund den sker.

| Land | System | Läge |
|---|---|---|
| **Kroatien** | Fiskalizacija 2.0. Varje B2C-kvitto ska fiskaliseras **oavsett betalsätt**. Kvittot får JIR + ZKI + QR-kod | **Obligatoriskt sedan 2026-01-01** |
| **Serbien** | ESIR (fakturaprogram) + LPFR/VPFR (signaturprocessor). Realtid till Poreska uprava, QR på kvittot, offline max 5 dygn | Gäller sedan 2022 |
| **Bosnien (FBiH)** | *Zakon o fiskalizaciji transakcija*, mjukvarubaserat ESET i stället för fiskalkassa. I kraft 2026-02-12, tillämpas när föreskrifterna är klara — senast omkring augusti 2027 | Övergångsperiod |
| **Republika Srpska** | Eget regelverk, skilt från FBiH | Eget spår |

**Beslutet 2026-08-19: Burp blir inte ett certifierat kassasystem nu.**
Restaurangen har redan en fiskalkassa och fortsätter använda den.

Det som gjordes i stället kostade nästan ingenting och tar bort den värsta
risken: **Burps kvitto säger rakt ut att det inte är ett kvitto.** Ett dokument
med ordersumma och momsuppdelning, utan JIR och utan signatur, kan i Kroatien
läsas som ett kvitto som borde ha fiskaliserats — och den missuppfattningen
kostar restaurangen, inte oss. Raden visas när landet kräver fiskalisering,
styrt av `CountryInfo.fiscalReceiptRequired` och inte av en hårdkodning.

**Kvar:** integrationen i sig. `register_receipts` finns i schemat och fylls
fortfarande inte av någon kod. **Detta är en fråga för en lokal skattejurist i
varje land, inte för utvecklingsteamet** — och sannolikt tre olika svar.
Kroatien är mest brådskande; kravet gäller sedan januari.

---

## 5. Hur tas betalt i Bosnien, Kroatien och Serbien?

**Status:** BESVARAD 2026-08-19 · **Blockerar:** ingenting längre i kod

> **Williams svar:** väg **A** — restaurangen äger sitt eget inlösenavtal.
> Pengarna går från gästen till restaurangen, Burp rör dem aldrig.

Det är svaret som gör att kortbetalning kunde byggas nu i stället för efter ett
betaltjänsttillstånd i två länder utanför EU/EES. Burps avgift tas antingen som
en application fee hos leverantören (Stripe) eller faktureras i efterhand ur
`fees` (Monri).

**Det som avgjorde leverantörsvalet:** Stripe finns i Kroatien och Sverige men
**inte i Bosnien och inte i Serbien** — varken för att ta emot kort eller för
utbetalningskonton. Huvudmarknaden är alltså den Stripe inte täcker. Monri
(Payten/Asseco SEE) täcker BA, HR, RS, ME och SI, är PCI DSS nivå 1 och payment
facilitator för Visa och Mastercard.

**Byggt:** ett leverantörsneutralt skikt (`apps/web/src/lib/payments/`) där allt
som skiljer leverantörerna åt ligger bakom fyra metoder. Stripe-adaptern finns
och går att köra mot testnycklar. Monri läggs på samma gränssnitt när avtalet
finns — ingen stubbe under tiden, eftersom en adapter som svarar men inte
fungerar är sämre än ingen adapter alls.

**Apple Pay och Google Pay** är inte egna avtalsparter utan plånböcker ovanpå
kortet. De dyker upp av sig själva i Payment Element på enheter som har dem;
det som krävs är en verifierad domän hos leverantören.

**Kvar att göra, och det kräver dig:** avtal med Monri för BA och RS. Fråga dem
uttryckligen om DinaCard i Serbien, om utbetalning i BAM och RSD, och vem som
bär växlingen om de avräknar i euro.

Kartan över vad som faktiskt går att använda i regionen, som den såg ut när
beslutet fattades:

| Väg | Läge i BA / HR / RS |
|---|---|
| **Kontant** | Fungerar i dag. Kvitteras i kassan, migration 0024 |
| **Kort via Stripe eller Adyen** | Lätt att ta EMOT. Det svåra är **utbetalning** — Stripe stödjer inte utbetalningskonton i BA eller RS |
| **Lokal inlösare** | Monri (HR), Payten/Asseco (HR/RS), samt Raiffeisen och UniCredit med egna gateways i alla tre. Löser utbetalningen, kostar ett avtal per land |
| **Apple Pay / Google Pay** | Ligger ovanpå en kortinlösare, ingen egen avtalspart. Lyfter konvertering vid bordet mer än något annat |
| **PayPal** | Fungerar i HR. **Begränsat för mottagarkonton i BA och RS** |
| **IPS NBS (Serbien)** | Statligt realtidssystem med QR-betalning, gratis för handlaren, mycket använt. Passar QR-flödet ovanligt väl |
| **SEPA instant (Kroatien)** | Möjligt sedan euroinförandet 2023 |
| **Revolut, Wise** | Konsumentplånböcker, inte handlarrails. Gästen kan betala med kortet i dem, men de är ingen egen integration |

**Den bärande skillnaden:** att ta emot pengar är löst dag ett. Att få ut dem
till en restaurang i Sarajevo eller Belgrad är det inte, med en internationell
leverantör. Antingen ett lokalt avtal per land, eller börja i Kroatien (EU och
SEPA) och låt BA och RS köra kontant tills volymen bär ett avtal.

Resonemanget nedan står kvar som det skrevs, eftersom det är det som gör svaret
begripligt om ett år.

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

### Vad koden tålde, och vad som ändå behövde rättas

Schemat var leverantörsneutralt och höll: `payments.provider` och
`provider_reference` räckte. Två saker stämde ändå inte och rättades i
migration 0026:

- `payments.currency` var `char(3)` med `'SEK'` som default, alltså från innan
  marknaden bestämdes. En betalning kunde få en annan valuta än sin order trots
  att valutan är fryst där. Nu enum och satt av trigger ur ordern.
- `place_order` satte `placed_at` på varje order oavsett status. En kortorder
  skapas som `DRAFT` och ska inte ha en läggtidpunkt förrän den lagts — annars
  visar kvittot och statistiken att ordern lades klockan sju medan gästen
  aldrig betalade.

Migration 0024:s krav att en kontantrad står i `CAPTURED` skrevs innan
återbetalning fanns och gjorde en felaktig kontantnota omöjlig att motboka.
Villkoret släpper nu även `PARTIALLY_REFUNDED` och `REFUNDED` (0027).

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

**Status:** obesvarad · **Blockerar:** fakturan, inte underlaget

Burps avgift är en tjänst till restaurangen och bär moms — med vilken sats beror
på var Burp är etablerat och var restaurangen är det, och det är en fråga för en
revisor och inte för utvecklingsteamet.

**Vad som byggdes trots att svaret saknas (2026-08-19):** avräkningen räknar
`amount_due_ore` **exklusive moms på avgiften**. Det är beloppet fakturan ska
utgå från, oavsett vilken sats som sedan läggs på — och det är därför frågan
inte blockerade bygget. Momsraden hör hemma på fakturan, som skrivs i Burps
bokföring, inte i produkten. `settlements.invoice_number` binder ihop de två.

Skulle svaret bli att momsen ska stå på underlaget också är det en kolumn till
och ingen omräkning.

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

**Frågan blev större 2026-08-23, inte mindre.** Här stod att den enskilda
restaurangens karta inte berördes, eftersom den var en iframe till
openstreetmap.org och inte en ruthämtning. Den iframen är borta — restaurangens
karta ritas nu av Leaflet, precis som startsidans, och hämtar rutor från samma
URL.

Det är rätt beslut för allt annat: ingen tredje part i gästens webbläsare, ett
utseende som hör ihop med resten, och ett avstånd som går att räkna. Men det
betyder att ruthämtningen nu ligger på **den mest besökta sidtypen i
produkten**, och att en betald leverantör måste finnas på plats innan Burp går
skarpt — inte bara innan startsidans karta gör det.

En egen stil är värd att väga in: OSM:s standardkarta är blå och grön, och blått
finns annars inte i produkten av ett uttalat skäl.

---

## 9. Ska mörkt läge gälla överallt, eller bara vid bordet?

**Status:** BESVARAD 2026-08-17 · **Blockerar:** ingenting längre

> **Williams svar:** "mörktläge vid bordet."

Alltså alternativ 2 nedan. Genomfört: `.theme-table` i `globals.css` bär de
mörka värdena, och exakt två ytor sätter klassen — QR-menyn (`/t/[token]`) och
bordskvittot. Allt annat är alltid papper, oavsett vad telefonen står i.

Tailwinds `dark:`-variant är omdefinierad till att betyda "inuti
`.theme-table`" i stället för `prefers-color-scheme`. Ett steg i CSS i stället
för sjuttio ändrade klassnamn — och utan det hade varje `dark:` på startsidan
slagit till på en maskin i mörkt läge och lagt ljusröd text på vitt papper.

Bakgrunden, för den som undrar varför frågan ställdes: Burp följde systemets
inställning på varje yta. Mockuperna är ljusa, och en maskin i mörkt läge visade
därför espressomörkt där mockupen visar vitt papper. Samma tokens, spegelvända —
men det ser ut som ett annat designspråk.

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

Mitt förslag var **2**, och det blev svaret.

---

## 10. Vilken logotyp?

**Status:** BESVARAD 2026-08-17, **ändrad 2026-08-20** · **Blockerar:** ingenting

> **Williams svar 2026-08-17:** "logo med pratbubblan."
>
> **Williams svar 2026-08-20:** skickade konceptark 4 (4a–4e) och sa "fortsätt"
> på rekommendationen **4c, serveringsklockan**.

Gäller nu: förslag **4c** ur `Burp Logo Concepts` — en röd serveringsklocka
följd av den gemena ordbilden **burp**. Klockan betyder bordsservering, som är
produktens kärnfunktion. Pratbubblan (1b) betydde "samtal", vilket varenda
chattapp också betyder.

Rekommendationen var 4c framför 4d (gaffel med bordsnummer), som är närmare
QR-flödet men fel för formatet: bordsnummer-badgen blir en röd gröt vid 32 px,
och app-ikonen ritas redan på en platta som iOS och Android maskar själva.

Genomfört. Konturen står som `CLOCHE_PATH` i `components/ui/burp-mark.tsx` och
importeras av `lib/brand-glyph.tsx`, som ritar favicon, iOS-ikonen och
PWA-ikonerna. **En enda kopia av konturen** — två handskrivna hade glidit isär
utan att någon såg det. I ikonerna är klockan vit på röd platta, som i
förslaget.

Två saker på arket som **inte** genomfördes, därför att de är egna beslut och
inte var det som frågades: den mörka varianten står på marinblått, och Burp har
inga mörka ytor alls (vita kort på `#f3f4f6`); och ordbilden i skissen är ett
rundat geometriskt snitt, medan produkten kör Geist 800.

---

## 11. Startsidan och QR-gästens val

**Status:** BESVARAD 2026-08-17 · **Blockerar:** ingenting

> **Williams svar:** "förstasidan kan vara upptäck men jag vill gärna ha kartor
> som listar samtliga restauranger redan i toppen av sidan. qr-gäst skall inte
> kunna ta med då qr-koden skall vara kopplad till ett bord."

**Startsidan.** Kart- och listvyn ligger nu på `/`. Kartan är det första på
sidan, före rubriken — den som kommer till burp.se utan att ha skannat en
QR-kod frågar "vad finns nära mig", och det svaret är en karta, inte en
ingress. Bildcollaget som låg där är borta; rutnätet under bär bilderna ändå.

`/upptack` svarar 308 mot `/` och behåller frågesträngen. Två sidor med samma
innehåll är dubblerat innehåll för Google och två ställen att underhålla.

**"Ta med" i QR-flödet: nej.** Koden hör till ett bord, alltså är beställningen
en bordsbeställning. Ingen kod behövde ändras — QR-menyn har aldrig erbjudit
valet, och `orders.type` sätts till `TABLE` av flödet, inte av gästen. Det som
ändrades är att skälet nu står skrivet, så att nästa person som ser `PICKUP` i
enumet inte lägger till knappen i tron att den saknas.

---

## 12. Ska en delåterbetalning kreditera Burps avgift?

**Status:** obesvarad · **Blockerar:** ingenting — ett beslut är fattat och går
att ändra

Avräkningen (migration 0039) krediterar avgiften för order som blivit **helt**
återbetalda. En delåterbetalning gör det inte.

**Skälet är att alternativet kräver ett svar produkten inte har.** En
proportionell kreditering måste veta hur mycket av avgiften som redan
krediterats i en TIDIGARE period, annars kan summan över tid överstiga
avgiften — och det kräver en post per order och period i stället för en summa
per period. Det är en tabell till, och den ska inte byggas på en gissning.

**Sakskälet håller ändå på egen hand:** en delåterbetalning — en kall förrätt
som kompenseras — upphäver inte att måltiden såldes. Gästen satt kvar och åt
resten. En hel återbetalning upphäver den.

Vill du ha proportionell kreditering är det en `settlement_lines`-tabell med en
rad per krediterad order, och krediten räknas då mot vad som redan tagits ut.
Historiken skrivs inte om — gamla perioder står kvar som de fakturerades.

---

## 13. Vad ska raderas och vad ska avidentifieras?

**Status:** BYGGT PÅ ETT ANTAGANDE 2026-08-19 · **Blockerar:** ingenting — men
bör bekräftas av jurist före lansering

Rätten till radering (artikel 17) väger inte över en rättslig förpliktelse
(17.3 b). Order, betalningar, avgifter och moms är bokföring och måste sparas —
sju år i regionen. Det som ska bort är **personen**, inte affärshändelsen.

Så här drogs gränsen i migration 0041. Varje rad är ett val, och varje val går
att ändra utan att bygga om:

| Vad | Vad som händer | Varför |
|---|---|---|
| Konto, profil, adresser, favoriter, notisprenumerationer | **Raderas** | Rena personuppgifter utan bokföringsvärde |
| Beställningar, orderrader, betalningar, avgifter | **Står kvar, utan köpare** | Bokföring. `guest_id` nollas |
| Omdömets betyg | **Står kvar, utan författare** | En siffra pekar inte ut någon, och restaurangens snittbetyg ska inte skrivas om för att en gäst lämnar |
| Omdömets fritext och bild | **Raderas** | Gästens egna ord kan bära vad som helst om henne själv |
| Lojalitetspoäng | **Kontot lossas, loggen står kvar** | Loggen är oföränderlig. Poängen går inte längre att nå av någon |
| Kuponginlösen och klippkortsuttag | **Står kvar, utan gäst** | Restaurangen bekostade en rabatt; det är en affärshändelse |

**Den svåraste raden är omdömet.** Att behålla betyget men stryka texten är
vanlig praxis och rimligt, men det är inte ett juridiskt besked. Vill du i
stället radera hela omdömet är ändringen en rad i `erase_guest()` — och
restaurangens snittbetyg ändras då i efterhand varje gång någon lämnar.

**Personal och Burp-anställda kan inte radera sig själva** genom flödet.
`staff` och `platform_admins` kaskaderar från kontot, så en radering hade tyst
tagit bort någons anställning — och med den en restaurangs sista ägare. Vägen
dit går genom att först avsluta anställningen. Rätten gäller dem också; det som
saknas är en yta för det.

**Kvar att besluta:** gallringstid. Burp raderar inget av sig självt i dag — en
gäst som slutar använda tjänsten ligger kvar för alltid. Artikel 5.1 e kräver
att uppgifter inte sparas längre än nödvändigt, alltså behövs en gräns och ett
jobb som städar. Det kräver ett svar på "hur länge är nödvändigt".

---

## 14. Ska Burp läsa restaurangens kortterminal?

**Status:** obesvarad · **Blockerar:** ingenting — registreringen är löst

Sedan 2026-08-20 kan personalen registrera **kort i terminal** i kassan
(migration 0044). Det löser bokföringen: en terminalbetalning bokförs inte
längre som kontanter, och kassaavstämningen slutar tro att det ligger sedlar i
lådan som inte finns.

**Men Burp läser inte terminalen.** Beloppet skrivs in av en människa, precis
som med kontanter, och kan avvika från notan. Frågan är om det ska förbli så.

**Vad en riktig integration kräver:** en terminal som rapporterar till ett
moln-API vi får fråga. Fristående terminaler — den sort banken lämnar över
disk — har oftast inget API alls; de talar bara med sin inlösare.

| Väg | Läge i BA / HR / RS |
|---|---|
| **Stripe Terminal** | Bara där Stripe finns. Alltså HR och SE, inte BA eller RS — och BA och RS är huvudmarknaden |
| **Monri / Payten** | Har terminaler i hela regionen. **Fråga om moln-API i samma samtal som avtalet** (fråga 5) |
| **SumUp, myPOS** | Har publika API:er och finns i regionen. Egna avtal, egen hårdvara |
| **Bankernas egna** (Raiffeisen, UniCredit, NLB, Intesa) | Vanligast hos små restauranger. Sällan något API |

**Det som avgör:** om restaurangen ska kunna behålla den terminal den redan har
går det inte att kräva ett moln-API. Då är den inskrivna siffran vad som finns,
och det är inte sämre än kontanthanteringen — som redan bygger på samma
förtroende.

**Fråga i samma andetag som Monri-avtalet.** Har de en terminal med API är
frågan besvarad utan ett extra avtal; har de det inte är svaret sannolikt att
det får förbli en inskriven siffra.

---

## 15. Ska en makulerad order kosta restaurangen något?

**Status:** obesvarad · **Blockerar:** ingenting — men avgör om avgiftsmodellen
håller när volymen kommer · **Ställd av William 2026-08-21**

**Vad som gäller i dag.** Avgiftsunderlaget i `settlement_preview()` räknar
bara order i `COMPLETED` och `REFUNDED` (migration 0039). En order som avbryts
når aldrig `COMPLETED` och faller därför ur underlaget helt. **En makulering
kostar alltså ingenting.** Migration 0038 lämnar dessutom tillbaka kupong,
klippkort och presentkort — med en trigger, eftersom ordern kan avbrytas på
fyra olika vägar och den femte kommer att skrivas av någon som inte läst det.

**Varför det ändå är en fråga.** Har gästen betalat med kort tar inlösaren sin
avgift på transaktionen, och vid en återbetalning får man i regel inte tillbaka
den. Burp får då noll i intäkt på en order som redan kostat pengar att flytta.
Vid enstaka makuleringar är det en kostnad för att göra affärer. Vid en
restaurang som makulerar var tredje order är det något annat.

**Tre vägar:**

| Väg | Innebörd | Invändning |
|---|---|---|
| **A. Fritt att makulera** — som i dag | Enklast att förklara, och rätt när felet är restaurangens eller gästens ångrar sig direkt | Ingen broms alls. En restaurang som tar order den inte kan leverera märker det aldrig i sin faktura |
| **B. Avgift efter att köket accepterat** | Skiljer "gästen ångrade sig innan någon rörde maten" från "maten var lagad". Följer statusmaskinen som redan finns — `PLACED` är gratis, efter `ACCEPTED` inte | Kräver att makuleringsorsak registreras, annars straffas restaurangen för gästens ångrande |
| **C. Ingen avgift, men synlig frekvens** | Makuleringsgraden per restaurang på avräkningen och i backoffice. Ingen debitering, bara ett tal som går att prata om | Löser inte kostnaden, men gör problemet upptäckbart innan det blir stort |

**Rekommendation: C nu, B senare om siffran visar att det behövs.** Att införa
en avgift innan man vet hur ofta det händer är att lösa ett problem man inte
mätt. Makuleringsgraden går att räkna ur `orders` redan i dag utan en enda ny
kolumn — `cancelled_at` finns sedan migration 0005.

Hänger ihop med fråga 12: den handlar om samma pengar från andra hållet, när
måltiden såldes men delvis gavs tillbaka.

---

## Beslutade frågor

| Fråga | Beslut | Var |
|---|---|---|
| Hur tas betalt? | Restaurangen äger sitt eget inlösenavtal. Burp håller aldrig gästens pengar | `lib/payments/`, migration 0026 |
| Vilken leverantör? | Stripe i HR och SE. Monri för BA och RS när avtalet finns — samma gränssnitt | `lib/payments/stripe.ts` |
| Ska Burp fiskalisera kvitton? | Nej. Restaurangen har sin egen fiskalkassa; Burps kvitto säger att det inte är ett kvitto | `CountryInfo.fiscalReceiptRequired` |
| Får gästen ha en plånbok hos Burp? | Nej — det är utgivning av elektroniska pengar. Presentkort hos EN restaurang i stället | Migration 0030 |
| Vem bekostar klippkortet? | Restaurangen | `punch_card_redemptions.funded_by` |
| Vad räknas 3,4 % på? | Ordersumman inkl. moms, utan dricks — `GROSS_ITEMS` | `calculateFee()`, `restaurants.fee_base` |
| Ligger kortavgiften ovanpå? | Ja. 3,4 % är Burps netto; restaurangen bär leverantörens avgift | `fees.provider_fee_ore` |
| Ska gästen kunna betala i plattformen? | Ja — men väntar på fråga 5 | — |
| Dricks i avgiftsunderlaget? | Nej. Dricks är gästens pengar till personalen | `calculateFee()`, `tips`-tabellen |
| Lagrat lojalitetssaldo? | Nej. Saldot räknas ur händelseloggen | `loyalty_transactions` |
| Får klienten skicka priser? | Nej. Servern räknar om från menyn | `POST /api/orders` |
| Statiska eller dynamiska QR-koder? | Statiska. De trycks på dekaler | `tables.qr_public_id` |
| Pengar som decimaltal? | Nej. Heltal öre överallt | `@burp/core/money` |
| Betalar Burp ut något till restaurangen? | Nej. Pengarna går direkt dit; Burp fakturerar sin avgift i efterhand | `settlements`, migration 0039 |
| Krediteras avgiften vid återbetalning? | Ja vid hel återbetalning, nej vid del | Fråga 12 |
| Läser Burp restaurangens kortterminal? | Nej. Personalen registrerar den som ett eget betalsätt | `TERMINAL`, migration 0044. Fråga 14 |
