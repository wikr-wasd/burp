/**
 * Språk i Burp.
 *
 * Språket ligger i URL:en — `/sv/sarajevo` och `/en/sarajevo` — och inte i en
 * cookie. Skälet är sökbarhet: Google indexerar en URL, inte en cookie. Med
 * språket dolt i sessionen finns bara en adress per sida, och då kan bara en
 * av språkversionerna hamna i sökresultaten. För en marknadsplats som lever
 * på organisk trafik är det skillnaden mellan att synas och inte.
 *
 * Bara de publika ytorna har språkprefix. Dashboarden, köksskärmen och
 * backoffice ligger kvar på sina adresser: de är noindex ändå, och statiska
 * segment vinner över dynamiska i Next:s router, så `/dashboard` kan aldrig
 * tolkas som ett språk.
 */

export const LOCALES = ["sv", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Svenska är standard.
 *
 * Inte för att den är störst på marknaden — engelska når fler — utan för att
 * produkten byggs och testas på svenska. Ett standardspråk som ingen i teamet
 * läser flytande blir ett standardspråk fullt av tryckfel.
 */
export const DEFAULT_LOCALE: Locale = "sv";

export const LOCALE_LABELS: Record<Locale, string> = {
  sv: "Svenska",
  en: "English",
};

/** BCP 47-taggar för `hreflang` och `<html lang>`. */
export const LOCALE_TAGS: Record<Locale, string> = {
  sv: "sv-SE",
  en: "en",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Väljer språk ur en `Accept-Language`-header.
 *
 * Används bara när gästen kommer till roten utan att ha valt något. Kvalitet
 * (`;q=`) respekteras, och en tagg som `en-GB` matchar `en`. Hittas inget känt
 * språk blir det standardspråket — aldrig ett fel, aldrig en tom sida.
 */
export function pickLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));

      const quality = q ? Number(q.slice(2)) : 1;

      return {
        // "en-GB" → "en". Regionen spelar ingen roll; vi har inga regionala
        // varianter och kommer inte att ha det.
        base: tag.trim().toLowerCase().split("-")[0] ?? "",
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const entry of ranked) {
    if (isLocale(entry.base)) return entry.base;
  }

  return DEFAULT_LOCALE;
}
