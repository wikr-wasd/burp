# Att göra

Listan följs uppifrån. Flytta en rad till **Klart** först när den är verifierad
enligt `CLAUDE.md` — inte när koden är skriven.

En rad som blockeras av ett beslut ligger kvar under **Väntar på beslut** tills
beslutet är fattat. Att bygga vidare på en gissning är hur man bygger fel sak
snabbt.

---

## Väntar på beslut — William

Ingenting går vidare här utan svar. Båda blockerar lansering.

- [ ] **Betalväg.** Se `OPEN-QUESTIONS.md` fråga 5. Det svåra är utbetalningar
      till restauranger i Bosnien och Serbien, som ligger utanför EU/EES — inte
      att ta emot kort. Betalning på plats fungerar idag och är möjligen rätt
      v1; det avgör om frågan blockerar lansering eller bara intäktsmodellen.
- [ ] **Supabase och Vercel i molnet.** Kräver inloggning. Supabase-orgen har
      två projektplatser på gratisnivån och båda är upptagna av 123Connect —
      antingen uppgradering eller ett frigjort projekt.
- [ ] **Fiskalisering.** `OPEN-QUESTIONS.md` fråga 4. Kroatien och Serbien
      kräver realtidsrapportering av kvitton. Tre länder, tre lokala jurister.

---

## Näst på tur

- [x] ~~Ikoner på de sista ytorna.~~ Sökknapp, betyg, öppetmärken,
      vägbeskrivning, kopiera adress, personalytornas navigering, varukorgen,
      QR-menyns sökruta, kvittots statussteg och samtliga tomma tillstånd.
      De tomma tillstånden delar numera en byggsten (`EmptyState`) i stället
      för att vara en grå mening formulerad på nio olika sätt.
      **Sett i webbläsaren:** gästytorna. **Inte sett:** personalytornas och
      backoffices tomma tillstånd — de kräver inloggning, och jag skriver inte
      in lösenord. Samma spärr som raden om backoffice längre ned.

- [ ] **QR-menyn mätt mot Qopla.** Referens:
      `qopla.com/restaurant/partille-sushi/…/order?qr=1`. Klart efter
      jämförelsen: sökruta, markerad avdelning i den klistrade raden,
      prisintervall ("Från 16,00 KM") och kvittens på kortet när en rätt läggs
      till. Kvar att bedöma: om gästen vid bordet ska kunna välja **ta med**
      i stället för att äta på plats — Qopla frågar det före menyn, vilket är
      fel läge för en QR-gäst, men frågan i sig är rimlig för en ćevabdžinica.
      Kräver ett beslut, inte kod.
- [x] ~~Platshållarbilderna i takt med paletten.~~ Tonerna dämpades och två togs
      bort: rödbetan var i praktiken magenta, vilket designspråket förbjuder,
      och tomaten låg så nära handlingsfärgen att en tallrik läste som en stor
      knapp. Kvar är sju varma toner i apelsin, tegel, saffran och kanel.
      Ersätts ändå av riktiga fotografier när de kommer in.
- [x] ~~Designbytet på alla ytor.~~ Startsida, stadssida, kökssida,
      restaurangsida, QR-meny, kvitton, kontosidor, dashboard och backoffice.
      Köksskärmen står utanför med flit — stora träffytor på några meters håll.
- [x] ~~Restaurangansökan.~~ `/anslut` för restauranger, och "Lägg upp en
      restaurang" i backoffice för Burp. Kvar: ingen notis går ut när en
      ansökan kommer in — se nedan.
- [ ] **Notiser.** Ingen e-post, ingen push. Restaurangen vet inte att en order
      kommit om ingen stirrar på köksskärmen.
- [ ] **Karta över alla restauranger.** Beslutad. Koordinater och OSM-inbäddning
      finns redan.
- [ ] **Surfplatta vid bordet.** Beslutad. Delar mycket med QR-flödet.
- [ ] **Mobilapp (React Native).** Beslutad. `@burp/core` är byggt för att delas.

- [ ] **Riktiga bilder i seed-datan.** Platshållaren är så bra den kan bli;
      nästa steg kräver fotografier. Utan dem går det inte att bedöma hur
      sajten faktiskt ser ut för en gäst.
- [x] ~~Meny i seed-datan som går att bedöma.~~ Tre rätter räckte inte:
      kategorinavigeringen hade inget att navigera i, sökrutan visades aldrig
      och inget slutsålt kort syntes. Nu 27 rätter i sex avdelningar, en
      obligatorisk storleksgrupp och en slutsåld dryck.
- [ ] **Mobilvyn sedd på riktigt.** Verifierad strukturellt (inget element
      utan radbrytning är bredare än 390 px) men aldrig sedd. QR-flödet lever
      på telefon.
- [ ] **Köksskärmen på en surfplatta.** Byggd för det, aldrig provad på en.
- [x] ~~Personalytorna genomgångna sida för sida i webbläsaren.~~ Hittade två
      fel: sju ifyllda röda veckodagsknappar, och en navigering som markerade
      "Order" på varje undersida. Backoffice återstår.
- [ ] **Backoffice genomgången i webbläsaren.** Översikt, restauranger, media.
      Påbörjad men inte gjord: utloggningen kräver POST, så mitt kontobyte tog
      inte och jag granskade fel roll. Logga in som `burp@burp.test` via
      formuläret, inte genom att navigera till `/logga-ut`.
      **Den här behöver du göra, William** — jag skriver inte in lösenord i
      formulär, inte ens seedens. Allt bakom inloggning är därför verifierat
      med typkontroll, lint, test och bygge, men aldrig sett.

---

## Kända begränsningar

Medvetna luckor, inte buggar. Var och en ska åtgärdas före sin fas.

| Vad | Var | Före |
|---|---|---|
| Rate limiter i processminnet — fungerar inte över flera Vercel-instanser | `lib/rate-limit.ts` | Fas 2 live |
| Öppettider stödjer inte pass över midnatt | `is_restaurant_open()`, migration 0004 | Nattöppet |
| Avgiftsbasen gissad (`GROSS_ITEMS`) | Öppen fråga 1 | Fas 1 |
| Ingen GDPR-export eller radering | — | Fas 4 |
| Personalytorna är enbart svenska | — | Medvetet. Köket ska inte byta språk för att en gäst gjorde det |
| `<html lang>` följer inte språksegmentet | `app/layout.tsx` | Next tillåter ett `<html>`, och det ligger utanför segmentet. Språket märks på ett omslutande element i stället |
| Inga laddningsskelett på publika sidor | — | `loading.tsx` gör varje `notFound()` till en 200:a. Se CLAUDE.md |
| `smoke.sh` går inte att köra på den här maskinen | `bash` är WSL2, inte Git Bash | Kräver Git Bash eller en miljö som delar Windows nätverksstack. Se CLAUDE.md |

---

## Klart

Fas 1 i sin helhet, utom det som väntar på beslut ovan.

- [x] Monorepo, `@burp/core`, Next.js-app, Supabase-migrationer med RLS
- [x] QR-beställning vid bordet — meny, varukorg, kassa, kvitto
- [x] Orderns livscykel, statusmaskin, orderredigering för gästen
- [x] Köksskärm, dashboard, menyhantering, bordshantering, statistik
- [x] Backoffice för plattformen, mediamoderering
- [x] Kundpanel, lojalitetspoäng, omdömen med restaurangsvar
- [x] Google-synlighet: sitemap med hreflang, robots, landningssidor per stad
      och kök, schema.org med öppettider
- [x] **Land och valuta per restaurang** — BA, HR, RS, SE. Valutan fryses på
      ordern; belopp från olika valutor summeras aldrig
- [x] **Restaurangens egen sida**, redigerbar av restaurangen: presentation,
      bild, kökstyper, prisklass, adress, kartnål
- [x] **Kartor** — Google Maps, Apple Kartor, Waze, plus karta via OSM
- [x] **Två språk** — svenska och engelska, språket i URL:en för indexerade
      ytor och via Accept-Language för QR och kvitton
- [x] **Ett designspråk** i hela produkten, med mätt kontrast
- [x] Schemalagd tillgänglighet (`item_availability`) — skriv, läs och
      kontroll i API:t
- [x] Egen 404 och felsida
