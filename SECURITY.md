# Rapportera en sårbarhet

Har du hittat ett säkerhetsproblem i Burp — rapportera det privat, inte som ett
öppet issue.

**Skriv till:** `sakerhet@burp.se`

⚠️ Adressen måste sättas upp innan repot blir publikt eller innan någon extern
får tillgång. Fram till dess går rapporter till samma adress som
`BURP_OPS_EMAIL` i miljön.

## Vad som hjälper

- Vad du gjorde, och vad som hände i stället för det förväntade
- Vilken yta det gäller: gästens sida, QR-flödet vid bordet, restaurangens
  dashboard eller Burps backoffice
- Om du kom åt data som hörde till någon annan — och i så fall vad, ungefär, men
  **inte** själva innehållet

## Vad du kan vänta dig

- Besked att rapporten är mottagen inom **tre arbetsdagar**
- En bedömning av allvaret och en tidsplan inom **sju arbetsdagar**
- Besked när det är rättat

Burp är i förlanseringsfas och drivs av ett litet team. Det finns inget
bug bounty-program och ingen ersättning utgår.

## Snälla, låt bli

- Att köra automatiska sårbarhetsskannrar mot produktionen
- Att läsa, ändra eller radera data som hör till någon annan än dig själv, mer
  än vad som krävs för att visa att problemet finns
- Att göra problemet offentligt innan det är rättat

## Vad som inte räknas

- Sårbarheter i utvecklingsverktyg som inte levereras till användarna.
  `npm run audit:prod` granskar det som faktiskt går ut; brus från vercel-CLI:t
  är inte en produktsårbarhet.
- Att en bild eller PDF går att nå med en gissad URL innan den granskats.
  Lagringen är publik med flit — modereringen avgör vad som *visas på Burp*, och
  sökvägarna innehåller ett slumpat uuid. Se `docs/SECURITY.md`.
- Att Content-Security-Policy inte blockerar något. Den går i rapportläge tills
  ISR-frågan är löst, och det står dokumenterat.

För hur systemet är byggt och var förtroendegränserna går, se
[`docs/SECURITY.md`](docs/SECURITY.md).
