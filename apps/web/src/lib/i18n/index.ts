import { DEFAULT_LOCALE, isLocale, pickLocale, type Locale } from "./config";
import { en } from "./en";
import { sv, type Dictionary } from "./sv";

export * from "./config";
export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { sv, en };

/**
 * Texterna för ett språk.
 *
 * Tar emot vad som helst och faller tillbaka på standardspråket. Anropas med
 * en ruttparameter som kommer rakt från URL:en, och en gäst som skriver
 * `/de/sarajevo` ska få svenska texter — inte en kraschad sida. Att rutten
 * dessutom 404:ar på okänt språk är en separat sak; den här funktionen ska
 * aldrig vara den som fäller sidan.
 */
export function dictionary(locale: unknown): Dictionary {
  return DICTIONARIES[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/**
 * Bygger en språkprefixad sökväg.
 *
 * Alla interna länkar på de publika ytorna går genom den här. En länk som
 * skrivs för hand tappar prefixet, och gästen kastas tillbaka till
 * standardspråket mitt i ett besök — vilket är svårt att upptäcka i test och
 * omedelbart irriterande att råka ut för.
 */
export function localePath(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

/**
 * Språket för en yta utan språkprefix i adressen.
 *
 * QR-sidan vid bordet och kvittona är noindex — de ska aldrig hamna i en
 * sökträff, och behöver därför inte en egen URL per språk. De kan i stället
 * läsa `Accept-Language`, alltså det språk gästens telefon redan är inställd
 * på.
 *
 * Det är dessutom rätt svar just där: QR-beställning används av turister. En
 * engelsktalande gäst i Sarajevo ska inte mötas av svenska för att produkten
 * råkar vara byggd i Sverige.
 */
export async function requestLocale(): Promise<Locale> {
  const { headers } = await import("next/headers");
  return pickLocale((await headers()).get("accept-language"));
}

/**
 * Fyller i variabler i en mall: `fill("Bord {number}", { number: "3" })`.
 *
 * Finns för att texter som passerar till klientkomponenter måste vara rena
 * strängar — en funktion går inte att serialisera över server/klient-gränsen
 * och ger 500. Variablerna skrivs därför som `{namn}` och fylls i där texten
 * ska visas.
 *
 * En variabel som saknas lämnas som den är i stället för att bli "undefined".
 * Ett synligt `{name}` är en bugg någon rättar; ordet "undefined" mitt i en
 * mening ser ut som ett systemfel för gästen.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
