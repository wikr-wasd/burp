# Burps designspråk

Formspråket är en tryckt matbilaga, inte en SaaS-produkt. Papper i stället för
vitt, antikva i rubrikerna, hårfina linjaler, spärrade versaler till metadata.

**Inga rundade hörn. Inga skuggor.** Det är signaturen, och den fungerar bara
om den är undantagslös. En gäst som sett Burp en gång ska känna igen den, och
igenkänning kommer av konsekvens — inte av effekter.

---

## Färgerna ska göra mat aptitlig

Det är hela urvalskriteriet. Varmt, inte neutralt; kryddfärger, inte
gränssnittsfärger. Blått och kallt grönt finns inte i paletten, av samma skäl
som de inte finns på en tallrik.

| Token | Ljust | Mörkt | Roll |
|---|---|---|---|
| `--background` | Varmt benvit | Espresso | Ren vit får mat att se blek ut. Ett neutralt mörkt läge drar blått ur bilderna |
| `--foreground` | Nästan svart, varm | Varmt benvit | Text |
| `--muted` | Dämpad brun | Ljus varmgrå | Metadata, ingresser |
| `--color-burp-600` | Djup tomat | samma | Huvudaccent. Det som ska tryckas |
| `--star` | Mörk saffran | Ljus saffran | Betyg. Ska glimma, inte trycka |
| `--rule` | Hårfin | Hårfin | Avdelare. **Dekor — ingen kontrast krävs** |
| `--rule-control` | 3,6:1 mot papper | 3,5:1 mot botten | Kant på något man trycker på eller skriver i |

### Två linjaler, inte en

`--rule` är dekor. `--rule-control` är en kontrolls kant och håller 3:1, enligt
WCAG 1.4.11. Kravet är inte formalia: fälten ritade en gång sin enda
avgränsning med `--rule` och gav 1,41:1 mot pappret — i praktiken osynliga
tills de fokuserades, och jag såg sidan flera gånger utan att reagera.

Använd `--rule-control` på varje `button`, `input`, `select` och `textarea` som
ritar en egen kant.

### Två accenter, inte fler

Rött bär handling. Saffran bär betyg. En tredje accent gör att ingen av dem
längre betyder något.

---

## Byggstenarna definieras en gång

I `apps/web/src/app/globals.css`. Skriv **aldrig** en egen knapp, ett eget fält
eller en egen kantlinje i en komponent.

| Klass | Till vad |
|---|---|
| `.font-display` | Rubriker. Aldrig under ~1,5rem — antikvan blir oläslig liten |
| `.label-caps` | Metadata: stad, kategori, sektionsetikett |
| `.rule` | Avdelare mellan sektioner |
| `.card` | Yta som ligger på pappret. Ingen skugga |
| `.btn` + `.btn-primary` / `.btn-secondary` | Alla knappar. Minst 44 px höga |
| `.field` | Alla textfält. Understruken linje, inte ruta |
| `.link` | Länk i löpande text. Understruken redan i viloläge |

Regeln finns för att produkten en gång talade tre designspråk samtidigt:
startsidan i antikva, stadssidan i fet grotesk, inloggningen i varken eller.
Varje sida som skriver sin egen knapp glider isär från resten nästa gång någon
rör den.

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
