# Affärsmodellen

Skriven 2026-08-25. Handlar om **Bosnien först**, och om vad som ska vara sant
innan Burp går vidare till ett andra land.

Förutsättningarna som dokumentet räknar på: Burp drivs som **sidoprojekt,
solo**, och **3,4 %-modellen ligger fast** (öppen fråga 1, besvarad
2026-08-16). Ändras någon av de två är scenarierna i avsnitt 4 fel och ska
räknas om.

---

## 1. Intäktsmodellen som den faktiskt är byggd

Ingenting här är ett förslag. Det är vad koden gör i dag.

| Fakta | Var |
|---|---|
| Avgiften är 3,40 % — 340 baspunkter | `packages/core/src/types.ts:148` (`DEFAULT_FEE_BPS`) |
| Underlaget är `GROSS_ITEMS`: varukorgen inkl. moms, exkl. dricks och leverans | `packages/core/src/pricing.ts` (`calculateFee`, `feeBaseAmount`) |
| Rabatt dras från underlaget — restaurangen betalar inte avgift på pengar den aldrig fick | `feeBaseAmount` |
| Dricks ingår aldrig. Den är gästens pengar till personalen | regel 8 i `CLAUDE.md`, migration `0040` |
| Kortavgiften ligger **ovanpå** och bärs av restaurangen. 3,4 % är nettomarginal | `fees.provider_fee_ore`, öppen fråga 5 |
| Faktureras i efterskott per period | migration `0039_settlements.sql`, `amount_due_ore` |
| Burp håller aldrig gästens pengar (väg A) | öppen fråga 5, besvarad |
| Avtal per restaurang går att avvika med | `restaurants.fee_override_bps` (migration `0002`) |
| **Inget abonnemang, ingen fast avgift, ingen gästavgift finns i schemat** | — |

Alltså:

> **Intäkt = 3,4 % × den ordervolym som går genom QR-flödet.**
> Inte 3,4 % av restaurangens omsättning.

Skillnaden mellan de två talen är hela affären. En restaurang som omsätter
80 000 KM men kör 10 % genom Burp är värd lika mycket som en som omsätter
8 000 KM och kör allt.

---

## 2. Marknaden i siffror

| Post | Värde | Källa |
|---|---|---|
| Restauranger och takeaway i BiH | ~4 070 företag, ~772 M€ | IBISWorld 2025/26 |
| Barer, kaféer, pubar | ~4 890 företag, ~711 M€ | IBISWorld 2025 |
| **Summa HoReCa** | **~8 960 ställen, ~1,48 mdr €** | — |
| Valutan | 1 € = 1,95583 KM, fast kurs | — |
| Prisankaret i regionen | doXmenu: 12,99 €/mån platt, 1 000+ ställen | doxmenu.com |
| Leveransplattformarnas provision | Glovo 25–35 %, Wolt 20–30 % | branschdata 2025 |

**Räkna aldrig på TAM här.** 3,4 % av 1,48 mdr € är 50 M€ och kommer aldrig att
inträffa. Enda användbara riktningen är nedifrån, per restaurang.

### Prisankaret är 13 € i månaden — inte Glovos 30 %

Det är den viktigaste raden i tabellen. Glovo får ta 30 % därför att de
**levererar nya gäster**. Burp tar 3,4 % av gäster restaurangen redan hade.
Restaurangägaren som jämför kommer att jämföra med doXmenus 13 €, inte med
Glovo — och för en restaurang med 5 000 KM/mån genom Burp är fakturan 170 KM,
alltså sex gånger så mycket.

Motargumentet måste vara mätbart, och det måste bevisas hos de första kunderna:

- **Högre snittnota.** Tillvalen syns i menyn i stället för att servitören ska
  komma ihåg att fråga.
- **Fler varv per bord.** Gästen beställer en omgång till utan att vänta på
  ögonkontakt.
- **Mindre spring.** Notan och betalningen sköter sig själva.

Finns inte de siffrorna efter första säsongen är varje förnyelse en förhandling
om priset, och den förhandlingen vinner den som tar 13 €.

---

## 3. Enhetsekonomi per restaurang

Antagandena nedan är antaganden. De ska ersättas med utfall ur `settlements` så
snart tre restauranger kört en hel månad.

### Profil A — kafana eller kafé i ett bostadsområde, Sarajevo

| | |
|---|---|
| Omsättning | 20 000–30 000 KM/mån |
| QR-andel år 1 | ~15 % — gästen är stammis och vinkar på servitören |
| Volym genom Burp | ~3 750 KM/mån |
| **Avgift till Burp** | **~128 KM/mån ≈ 65 €** |
| Årsvärde | ~1 500 KM ≈ 770 € |

### Profil B — restaurang i Baščaršija eller vid Stari most i Mostar

| | Högsäsong (maj–sep) | Lågsäsong (okt–apr) |
|---|---|---|
| Omsättning | ~80 000 KM/mån | ~25 000 KM/mån |
| QR-andel | ~35 % | ~20 % |
| Volym genom Burp | ~28 000 KM | ~5 000 KM |
| **Avgift** | **~950 KM/mån ≈ 485 €** | ~170 KM/mån |
| Årsvärde | **~5 950 KM ≈ 3 040 €** | |

**Profil B är värd fyra gånger profil A.** Det styr försäljningen: turistytor
först — Baščaršija, Mostar, Trebinje, Neum, Jahorina — inte lokalkaféer.

Det är också där produkten redan är starkast. Turisten **föredrar** att beställa
utan att prata: hen kan inte språket, vet inte vad ćevapi kostar och vill inte
peka. Fem språk finns byggda, och `bs`, `en` och `de` täcker både regionen och
tyskarna, som är största turistgruppen.

---

## 4. Scenarier år 1–3 — sidoprojekt, solo

Flaskhalsen är inte koden. Varje restaurang kräver ett fysiskt besök, dekaler på
borden, en genomgång med personalen och någon som svarar i telefon när
köksskärmen krånglar en fredag kväll. Det går inte på distans från Sverige, och
det går inte på tio ställen i veckan vid sidan av annat.

| | Försiktigt | Rimligt | Bra |
|---|---|---|---|
| **År 1** — aktiva ställen vid årets slut | 3 | 8 | 15 |
| varav turistprofil | 1 | 3 | 6 |
| Intäkt år 1 | ~2 500 KM | **~10 000 KM** | ~28 000 KM |
| | ~1 300 € | ~5 100 € | ~14 300 € |
| **År 2** — aktiva ställen | 8 | 22 | 45 |
| Intäkt år 2 | ~9 000 KM | **~38 000 KM** | ~95 000 KM |
| | ~4 600 € | ~19 400 € | ~48 600 € |
| **År 3** — aktiva ställen | 15 | 45 | 100 |
| Intäkt år 3 | ~20 000 KM | **~85 000 KM** | ~210 000 KM |
| | ~10 200 € | ~43 500 € | ~107 000 € |

Antaganden: snittvärde 150 KM/mån per ställe år 1, stigande mot 175 KM år 3 när
QR-andelen mognar; ungefär 30 % av tillskottet är turistprofil; avhopp 2 % per
månad.

> **Ärlig läsning: som sidoprojekt blir Burp en extra inkomst år 3, inte ett
> företag.** Den enda posten som ändrar storleksordningen är någon som säljer
> och supportar på plats, på bosniska, på heltid. Det är ingen kodfråga och går
> inte att bygga bort.

### Kostnadsbasen

| Post | Per månad |
|---|---|
| Vercel Pro | ~20 € |
| Supabase Pro — gratisnivån räcker inte, orgens två platser är upptagna av 123Connect | ~25 € |
| Resend, domän, kartrutor (MapTiler gratisnivå) | ~10 € |
| Sentry | 0 € på gratisnivån |
| **Drift totalt** | **~55 €/mån ≈ 110 KM** |

Break-even mot driften är **en enda turistrestaurang**, eller ungefär tre
kaféer. Tillkommer dekaltryck, resor, bolag och bokföring — och tiden, som är
den dyraste posten och inte prissätts här.

---

## 5. Fyra risker som är större än marknaden

### 1. Indrivningen är en följd av väg A

Burp rör aldrig gästens pengar. Avgiften kan därför **inte nettas ur en
utbetalning** — den måste faktureras och drivas in. En faktura på 128 KM till
ett kafé i en kontantkultur är administrativt dyrare än den är värd, och den som
slutar betala måste stängas av för hand.

**Åtgärd som inte rör 3,4 %-modellen:** kortmandat vid onboarding, avgiften dras
automatiskt. Burp tar då emot betalning för **sin egen tjänst**, vilket är något
helt annat än att hålla gästens pengar och inte kräver betaltjänsttillstånd.
Detta finns inte byggt. Se `TODO.md`.

### 2. Fiskaliseringen är en hemmamarknadsfråga, inte en expansionsfråga

FBiH:s lag är i kraft sedan 2026-02-12 och tillämpas när föreskrifterna är
klara — senast omkring augusti 2027 (öppen fråga 4). **Det är ungefär 18 månader
från i dag.** Fram till dess kan Burp arbeta bredvid restaurangens befintliga
kassa. Efter det krävs ett svar även i Bosnien.

Fönstret ligger alltså inte "före expansionen". Det ligger före den dag
hemmamarknaden får samma krav som Kroatien redan har.

### 3. QR-andelen går inte att mäta i dag

Burp ser bara sina egna order. Måttet som avgör hela affären — hur stor del av
restaurangens bordsorder som går genom Burp — kräver att restaurangen uppger sin
omsättning. Fråga efter den i onboarding och följ upp kvartalsvis. Utan den är
varje uttalande om QR-andel en gissning, och tröskel T2 nedan omätbar.

### 4. Säsongen

Turistprofilen bär 5 av 12 månader. En restaurang som inte ser något värde i
februari säger upp sig i februari — inte i juli, när den var nöjd.

---

## 6. När är det läge att gå till nästa land

Alla sex ska vara uppfyllda **samtidigt, tre månader i rad**, innan ett andra
land ens undersöks.

| # | Tröskel | Varför just den |
|---|---|---|
| **T1** | ≥ 80 % av restaurangerna aktiva 6 månader efter start (aktiv = ≥ 50 QR-order/mån) | Avhopp är dödsorsaken i segmentet. Ett andra land multiplicerar problemet i stället för att lösa det |
| **T2** | Medianrestaurangen kör ≥ 20 % av sina bordsorder genom Burp | Under det är Burp en meny — och en meny kostar 13 €/mån någon annanstans |
| **T3** | ≥ 25 aktiva ställen i BiH, varav ≥ 10 i samma stadskärna | Täthet gör dekalen igenkänd. Utspridda ställen lär inte upp någon gäst |
| **T4** | ≥ 4 000 KM/mån i återkommande avgift, kreditförlust < 5 % | Bevisar att fakturan betalas, inte bara skickas |
| **T5** | Du kan vara borta en vecka utan att något faller | Supporten får inte vara William personligen på WhatsApp |
| **T6** | Skriftligt besked från skattejurist i **mållandet**, före första kunden | HR och RS kräver fiskalisering från dag ett. Där finns ingen övergångsperiod att luta sig mot |

Uppfylls inte T1–T5 är svaret på "när ska jag gå till Kroatien" alltid: **inte
än**. Ett andra land kostar en fiskaliseringslösning, en inlösare, ett bolag, en
bokföring och en supportkanal till — samtliga fasta kostnader som inte delas med
Bosnien.

### Ordningen, när trösklarna väl nås

| # | Land | Varför där | Vad det kostar |
|---|---|---|---|
| 1 | **Bosnien** — nu | Hemmamarknad, språket finns, lättast compliance fram till ~2027 | — |
| 2 | **Montenegro** | Samma ordbok (`bs`, latinsk skrift), euro, notorna i Budva och Kotor är 2–3× Bosniens | Litet land (~620 000), fiskalisering sedan 2021 |
| 3 | **Kroatien** | Högst ARPU per gäst, euro, och **den enda marknaden där utbetalningen redan är löst** — Stripe stödjer HR | Fiskalizacija 2.0 tvingande sedan 2026-01-01 på *varje* B2C-kvitto, oavsett betalsätt. Kräver kassaintegration eller certifierad egen fiskalisering |
| 4 | **Serbien** | Störst (~6,6 M). **IPS NBS QR-betalning är gratis för handlaren och passar QR-flödet bättre än kort gör** | ESIR + LPFR sedan 2022, DinaCard-krav, och Stripe stödjer inte utbetalning till RS |
| 5 | **Albanien / Kosovo** | Sist | Nytt språk = en sjätte ordbok (`sq`, hela `Dictionary`), egen fiskalisering sedan 2021, lägst ARPU |

**Kroatien och Serbien är inte länder att expandera till. De är
integrationsprojekt mot kassaleverantörer, förklädda till länder.** Budgetera
dem därefter, och räkna med att den första kunden i respektive land ligger
månader efter beslutet — inte veckor.

Vad ett nytt land kostar i kod, för fullständighetens skull: en post i
`COUNTRY_INFO` (`packages/core/src/country.ts`), samma post i
`allowed_vat_rates()` (migration `0019`) **och** i `country_time_zone()`
(migration `0033`), org.nr-validering, samt `DEFAULT_LOCALE_BY_COUNTRY` i
`i18n/config.ts`. Det är den billiga delen. Juridiken är den dyra.

---

## 7. Billigare expansion än ett nytt land

Ett nytt land multiplicerar fasta kostnader. Tre andra riktningar gör det inte.

**a) Fler sorters ställen i Bosnien** — samma lag, samma språk, samma support:
hotellfrukost, skidanläggningarna (Jahorina, Bjelašnica), stränderna i Neum,
festivaler som SFF, bagerier och ćevabdžinice med avhämtning, och **nattklubbar
med bordsservering**. Den sista är intressantast rent ekonomiskt: hög nota per
order ger hög avgift per order, och där är väntan på en servitör som värst.

**b) Mer produktyta per befintlig kund** — varje procentenhet QR-andel är ren
tillväxt utan en enda ny restaurang. `TODO.md` punkt 8 (avhämtning med tid och
notis) och punkt 5 (bordsbokning) höjer volymen hos ställen som redan är kunder,
och kostar noll i juridik.

**c) Diasporan.** Bosniska restauranger i Sverige, Tyskland och Österrike talar
språket, ligger inom fysiskt räckhåll, och Sverige finns redan i `country.ts`
med SEK och 12/25 % moms. Det är ingen strategi — men det är den billigaste
pilotkund som går att besöka på en lördag, och en referens som talar samma språk
som marknaden den ska övertyga.

---

## 8. Hur siffrorna följs upp när det väl är skarpt

Allt ovan är modell. Facit ligger i databasen så snart en restaurang är igång:

- `settlements.amount_due_ore` per period — det Burp fakturerar.
- `fees`-raderna bär bas, sats **och** belopp per order, så historiken står kvar
  även om modellen någon gång ändras.
- `tips` med `released_at is null` är personalens pengar och ingår aldrig här.

Belopp i olika valutor summeras aldrig. Går Burp någon gång in i ett andra land
redovisas varje land för sig, av samma skäl som plattformsöversikten gör det.
