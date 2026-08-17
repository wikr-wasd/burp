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

**Mockuperna är ljusa. Burp följer systemets inställning.** Det är samma tokens,
och en maskin i mörkt läge visar därför espressomörkt där mockupen visar vitt
papper — vilket ser ut som ett annat designspråk och inte är det. Vill man
jämföra måste man jämföra i samma läge.

Om mörkt läge ska gälla ÖVERALLT eller bara vid bordet är ett öppet beslut. Se
`docs/OPEN-QUESTIONS.md` fråga 9.

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
| `.chip` + `.chip-active` | Filter och genvägar. Fylld pillerform, 44 px, tryckbar |
| `.switch` | Ett av/på-filter. Reglage, inte chip |
| `.field-soft` | Fyllt, kantlöst sökfält i sidhuvudet |
| `.btn-pill` | Sidhuvudets värvningsknapp. Enda pillerknappen |
| `.burp-mark` + `.burp-wordmark` | Vinjetten. Se nedan |
| `.map-pin`, `.map-popup` | Kartnålen och dess bubbla på `/upptack` |

`.badge` och `.chip` ser lika ut men gör olika saker: ett märke rapporterar ett
tillstånd, en chip ändrar det. Skillnaden syns i träffytan — ett märke får vara
litet, en chip måste gå att träffa med en tumme.

`.chip` och `.switch` skiljer sig på samma sätt: en chip är ett av flera val,
ett reglage är av eller på. Formen måste säga vilken sorts val det är innan man
läser etiketten. "Öppet nu" var en chip bland chippar och läste därför som att
det gick att välja EN av dem.

Chippen är **fylld och kantlös**, inte en ruta med kontur — en chip med kant
läser som en knapp bland knappar. Fyllningen är `--surface-muted`, ett steg
mörkare än underlaget. I mockuperna ligger chippen på en vit panel och är
`#f3f4f6`; Burps sidor ligger på papperstonen, så samma **förhållande** kräver
ett steg till.

**Höjden är 44 px och inte mockupens 30.** Det är den enda punkt där mockupen
medvetet inte följs: den är ritad för en muspekare, filtret trycks av en tumme
på en gata.

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

En röd **pratbubbla** följd av ordbilden **burp**, gemen. Förslag 1b ur
`Burp Logo Concepts`, valt 2026-08-17.

Bubblan betyder beställning och samtal vid bordet — det produkten faktiskt gör
— och håller som siluett hela vägen ned till en 32 px favicon. Det gör inte de
fyra graffitiförslagen med hård skugga och droppar.

Ersatte ordet "Burp" satt i rubriktypsnittet. Ett ord är inget märke: det går
inte att känna igen på en flik, i en inkorg eller på en dekal vid ett bord,
vilket är tre av de fyra ställen produkten möter någon. Gement med flit —
"BURP" i versaler läser som ett läte, gement läser det som ett namn.

`<BurpMark>` i `components/ui/burp-mark.tsx` bär bubblan och måtten,
`globals.css` bara ordbilden. Bubblan är dekor och döljs för uppläsaren;
ordbilden bär namnet. Utan ordbild måste den som anropar sätta `aria-label` på
länken runt om.

**Kurvan finns i EN kopia.** `BUBBLE_PATH` exporteras ur `burp-mark.tsx` och
importeras av `lib/brand-glyph.tsx`, som ritar favicon, iOS-ikonen och
PWA-ikonerna. Två handskrivna bézierkurvor glider isär utan att någon ser det.

**Färgerna gör det däremot inte.** Satori, som ritar ikonerna, känner varken
Tailwind eller CSS-variabler, så `brand-glyph.tsx` bär råa hexvärden. Ändras
märkesfärgen måste båda ändras — att de kan glida isär är inte en teori, de
gjorde det i fyra månader: färgbytet nådde `globals.css` men inte favicon,
apple-icon, PWA-ikonerna eller manifestets `theme_color`.

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

Personalytan har en **sidomeny**, inte en topprad. Punkterna definieras en
gång i `STAFF_NAV` och renderas två gånger — sidomeny på stora skärmar, en
rullande rad på små. Två listor hade glidit isär första gången någon lade till
en yta i den ena. Ramen är `StaffShell`, som bär rubrik och bredd så att de
inte skrivs om per sida.

---

## Kontrast mäts, den bedöms inte

Färger i `oklch()` går inte att räkna på i huvudet, och `getComputedStyle`
returnerar dem oförändrade — en regex som läser dem som RGB ger nonsens. Mät
genom att rita färgen på en 1×1-canvas och läsa pixeln; då spelar syntaxen
ingen roll.

Aktuella värden finns i commit `dbb61a4` och `8b43071`.
