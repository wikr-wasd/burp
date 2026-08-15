import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
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
