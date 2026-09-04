/**
 * Översättning av det MÄNNISKOR skrivit — inte av gränssnittet.
 *
 * Gränssnittet har fem ordböcker och behöver ingen maskin. Det här handlar om
 * texten som restaurangen och gästen skriver själva: en rättbeskrivning, ett
 * meddelande till köket, en anteckning på en bokning. Den finns bara på ett
 * språk, och det är sällan läsarens.
 *
 * ── Vad som INTE går den här vägen ──────────────────────────────────────────
 *
 * **Allergener.** De blev koder i migration 0071 just därför att en maskin som
 * gissar fel på "nötter" ger ett svar man inte vill ge en allergiker. Koder
 * översätts av vår egen ordbok, exakt, varje gång.
 *
 * **Priser och belopp.** De är tal i valutans minsta enhet och formateras av
 * `formatMoney()`. En maskin som "översätter" ett tal har gjort något fel.
 *
 * **Restaurangens namn.** Ett egennamn. "Ćevabdžinica Željo" heter så i
 * Sarajevo och i Stockholm.
 *
 * ── Nyckeln är innehållet, inte raden ───────────────────────────────────────
 *
 * Cachen slås upp på en hash av TEXTEN och målspråket — inte på (tabell, id,
 * fält). Två följder, båda önskade:
 *
 *   1. En ändrad text får en ny nyckel. Den gamla översättningen blir därmed
 *      oanvänd i stället för fel, och ingen invalidering behöver skrivas —
 *      den sortens kod glöms bort och lämnar gammal text kvar i månader.
 *   2. "utan lök" skrivs av tusen gäster och översätts EN gång, för alla
 *      restauranger. Det är skillnaden mellan en kostnad och en avgift.
 */

/** Längsta text vi skickar iväg. Längre än så är inte en anteckning. */
export const TRANSLATION_MAX_LENGTH = 2000;

/**
 * Texten som den ser ut för cachen.
 *
 * Radbrytningar och dubbla mellanslag skiljer inte två meddelanden åt för en
 * översättningsmotor, men de skiljer två hashar åt. Utan normaliseringen
 * betalar vi för samma mening flera gånger.
 */
export function normalizeSource(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, TRANSLATION_MAX_LENGTH);
}

/**
 * Är det här värt att skicka iväg?
 *
 * Nej för tomt, nej för en enda bokstav, och nej för text utan en enda
 * bokstav i sig: "3", "12:30", "!!!" och "500 g" betyder samma sak på alla
 * fem språken. Varje sådan sträng som ändå skickas är ett API-anrop som
 * kostar pengar och ger tillbaka det den fick.
 */
export function isTranslatable(text: string): boolean {
  const normalized = normalizeSource(text);
  if (normalized.length < 2) return false;

  // \p{L} = vilken bokstav som helst, i vilket skriftsystem som helst. En
  // regex över a–z hade sagt nej till "čevapi" och till kyrilliska.
  return /\p{L}{2,}/u.test(normalized);
}

/**
 * Cachenyckeln: målspråket och textens innehåll.
 *
 * SHA-256 via Web Crypto och inte `node:crypto` — `@burp/core` får inte bero
 * på en runtime, och samma kod ska kunna köras i webbläsaren, i Node och på
 * kanten. Därför också asynkron: `crypto.subtle` är det.
 *
 * Målspråket ingår i nyckeln. Utan det hade samma mening delat rad mellan
 * tyska och norska, och den som skrev sist hade vunnit.
 */
export async function translationKey(text: string, targetLocale: string): Promise<string> {
  const payload = `${targetLocale}\n${normalizeSource(text)}`;
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Delar upp en lista i omgångar.
 *
 * Översättningsleverantörer tar emot flera texter per anrop men inte hur många
 * som helst, och ett anrop med hundra menyrader avvisas i sin helhet — alltså
 * en meny utan en enda översatt rad, för att den var för lång.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) return [[...items]];

  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}
