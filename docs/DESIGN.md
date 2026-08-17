# Burps designspråk

Burp följer **123Connect Design System**. Tokens, typskala och komponentformer
är lyfta ur `colors_and_type.css` i designprojektet, så att Burp och 123Connect
ser ut att komma från samma hus.

Det var ett val av **släktskap framför särart**, fattat 2026-08-16. Burp hade
dessförinnan en egen redaktionell form — papper, antikva, inga rundade hörn.
Den var ovanligare och därmed mer minnesvärd, men Burp och 123Connect är samma
avsändare och ska se ut så.

---

## Färger

| Roll | Värde | Används till |
|---|---|---|
| Handlingsrött | `#dc2626`, hover `#b91c1c` | Varje primärknapp, aktiva lägen |
| Ytor | `#ffffff` på `#f3f4f6` | Kort på bakgrund |
| Text | `#111827` / dämpad `#6b7280` | Brödtext och metadata |
| Guld | `#d97706` ljust, `#fbbf24` mörkt | Betyg. Ska glimma, inte trycka |
| Grönt | `#16a34a` | Bekräftelse, öppen nota |
| Kant | `#e5e7eb` avdelare, `#9ca3af` kontroll | Se nedan |

**Burp använder inte** systemets lila och rosa marknadsföringsgradienter. De hör
till 123Connects säljsidor; här skulle de konkurrera med maten, som är det enda
som ska sticka ut på en matmarknadsplats.

### Två kanter, inte en

`--rule` är en avdelare och behöver ingen kontrast. `--rule-control` är kanten
på något man trycker på eller skriver i och håller 3:1 enligt WCAG 1.4.11.
Kravet är inte formalia: fälten ritade en gång sin enda avgränsning med den
svagare tonen och blev osynliga tills de fokuserades.

### Mörkt läge

Designsystemet dokumenterar inget. Burp behöver ett ändå: QR-menyn läses vid ett
bord på kvällen, ofta i en mörk lokal, och en vit skärm i ansiktet är inte en
detalj utan hela upplevelsen. Samma gråskala, spegelvänd.

---

## Typografi

**Geist**, en familj till både rubrik och brödtext — vikten är skillnaden.
`latin-ext` är inte valfritt: Ćevabdžinica och Tri Šešira faller annars tillbaka
på ett systemtypsnitt mitt i ett ord.

Rubriker är feta med tät spärrning (`-0.025em`). Klassen heter fortfarande
`.font-display` av historiska skäl men betyder nu fet grotesk, inte antikva.

---

## Byggstenarna definieras en gång

I `apps/web/src/app/globals.css`. Skriv **aldrig** en egen knapp, ett eget fält
eller en egen kantlinje i en komponent.

| Klass | Till vad |
|---|---|
| `.font-display` | Rubriker. Fet grotesk, tät spärrning |
| `.label-caps` | Metadata: stad, kategori, sektionsetikett |
| `.rule` | Avdelare mellan sektioner |
| `.card` | Vit yta, rundade hörn, låg skugga |
| `.btn` + `.btn-primary` / `.btn-secondary` | Alla knappar. Minst 44 px höga |
| `.field` | Alla textfält. Rundad ruta |
| `.link` | Länk i löpande text. Röd och understruken i viloläge |
| `.badge` | Status, kategori, antal. Pillerform. Visas, trycks inte |
| `.chip` + `.chip-active` | Filter och genvägar. Pillerform, 44 px, tryckbar |
| `.burp-mark` + `.burp-wordmark` | Vinjetten. Se nedan |
| `.map-pin`, `.map-popup` | Kartnålen och dess bubbla på `/upptack` |

`.badge` och `.chip` ser lika ut men gör olika saker: ett märke rapporterar ett
tillstånd, en chip ändrar det. Skillnaden syns i träffytan — ett märke får vara
litet, en chip måste gå att träffa med en tumme.

Kartans två klasser ligger i `globals.css` trots att de bara används på ett
ställe. Leaflet skriver in nålen och bubblan som HTML-strängar, så det finns
ingen komponent att sätta stilen på. **Väljarna måste dessutom vara tyngre än
de behöver:** Leaflets egen CSS laddas som en egen bunt efter `globals.css`, och
vid lika specificitet vinner den. Utan `.leaflet-container` framför ritades
restaurangnamnet i Leaflets blå länkfärg — den enda blå färgen i produkten, och
just den som är förbjuden.

Regeln finns för att produkten en gång talade tre designspråk samtidigt:
startsidan i antikva, stadssidan i fet grotesk, inloggningen i varken eller.
Varje sida som skriver sin egen knapp glider isär från resten nästa gång någon
rör den.

---

## Vinjetten

Ett märke — röd ruta med ett B — följt av ordbilden **burp**, gemen.

Ersatte ordet "Burp" satt i rubriktypsnittet. Ett ord är inget märke: det går
inte att känna igen på en flik, i en inkorg eller på en dekal vid ett bord,
vilket är tre av de fyra ställen produkten möter någon. Gement med flit —
"BURP" i versaler läser som ett läte, gement läser det som ett namn.

Gradienten mellan `--color-burp-600` och `--color-burp-700` är den enda i
produkten. Designsystemets lila och rosa marknadsföringsgradienter används inte.

`<BurpMark>` i `components/ui/burp-mark.tsx` bär måtten, `globals.css` formen.
Märket är dekor och döljs för uppläsaren; ordbilden bär namnet. Utan ordbild
måste den som anropar sätta `aria-label` på länken runt om.

**De genererade ikonerna läser ur `lib/brand-glyph.tsx`, inte ur temat.** Satori
känner varken Tailwind eller CSS-variabler. Ändras märkesfärgen måste båda
ändras — att de kan glida isär är inte en teori, de gjorde det i fyra månader:
färgbytet nådde `globals.css` men inte favicon, apple-icon, PWA-ikonerna eller
manifestets `theme_color`.

---

## Sidchrome

`SiteHeader` och `SiteFooter` ligger på varje publik sida.

Undantaget är **QR-sidan vid bordet**. Där har gästen redan bestämt sig, sitter
framför maten, och varje länk bort från menyn är en länk bort från
beställningen.

---

## Bilder

Mat säljs med bilder. Startsidans förstaskärm bär därför ett collage av tre
restauranger — förskjutet, eftersom tre lika stora rutor i rad läser som en
annons och tre i otakt som ett uppslag.

En rätt utan uppladdat foto får en genererad platta: en tallrik sedd uppifrån
med mjuka former, allt härlett ur namnet så att samma rätt alltid ser likadan
ut. Den ska göra en tom marknadsplats presentabel — **inte ersätta
fotografier**. En restaurang som laddat upp ett riktigt foto ska alltid se
bättre ut.

Se `apps/web/src/app/bild/[namn]/route.ts`.

---

## Ytor som lyder under andra regler

**Köksskärmen.** Körs på en surfplatta på några meters håll i ett stökigt kök.
Läsbarhet och träffyta går före ton. Den stora statusknappen är medvetet
rundad och större än allt annat i produkten.

**Dashboard och backoffice.** Samma byggstenar och samma färger, men tätare.
Det är arbetsredskap, inte en bilaga.

---

## Kontrast mäts, den bedöms inte

Färger i `oklch()` går inte att räkna på i huvudet, och `getComputedStyle`
returnerar dem oförändrade — en regex som läser dem som RGB ger nonsens. Mät
genom att rita färgen på en 1×1-canvas och läsa pixeln; då spelar syntaxen
ingen roll.

Aktuella värden finns i commit `dbb61a4` och `8b43071`.
