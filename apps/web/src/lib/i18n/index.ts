import { DEFAULT_LOCALE, isLocale, pickLocale, type Locale } from "./config";
import { bs } from "./bs";
import { de } from "./de";
import { en } from "./en";
import { no } from "./no";
import { sv, type Dictionary } from "./sv";

export * from "./config";
export type { Dictionary };

/**
 * Alla ordböcker är typade som `Dictionary`, som härleds ur svenskan. En nyckel
 * som läggs till där och glöms i något av de andra språken stoppar bygget —
 * en oöversatt text ska aldrig nå en gäst som en tom sträng.
 */
const DICTIONARIES: Record<Locale, Dictionary> = { bs, en, de, no, sv };

/**
 * Texterna för ett språk.
 *
 * Tar emot vad som helst och faller tillbaka på standardspråket. Anropas med
 * en ruttparameter som kommer rakt från URL:en, och en gäst som skriver
 * `/fr/sarajevo` ska få svenska texter — inte en kraschad sida. Att rutten
 * dessutom 404:ar på okänt språk är en separat sak; den här funktionen ska
 * aldrig vara den som fäller sidan.
 */
export function dictionary(locale: unknown): Dictionary {
  return DICTIONARIES[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/**
 * Ordboken för en personalyta som ännu inte är översatt.
 *
 * Personalytorna översätts en yta i taget. Under tiden finns en fälla som är
 * värre än att inte ha börjat: en sida vars brödtext står på svenska men vars
 * enstaka etiketter — en veckodag, en roll, en orderstatus — följer personens
 * språkval. Resultatet är en svensk mening med ett bosniskt ord i, vilket är
 * svårare att läsa än vilketdera språket som helst.
 *
 * Sidor som inte är färdiga håller sig därför HELT på svenska, och säger det
 * genom att anropa den här i stället för `dictionary(staff.locale)`. Namnet är
 * med flit obekvämt: `grep untranslatedSurface` räknar exakt hur mycket som
 * återstår, och raden försvinner av sig själv när ytan blir klar.
 */
export function untranslatedSurface(): Dictionary {
  return DICTIONARIES[DEFAULT_LOCALE];
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
