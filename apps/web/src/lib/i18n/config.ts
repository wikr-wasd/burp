/**
 * Språk i Burp.
 *
 * Språket ligger i URL:en — `/sv/sarajevo` och `/bs/sarajevo` — och inte i en
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

/**
 * Fem språk, valda efter vem som faktiskt läser dem.
 *
 *   bs   marknaden — Bosnien, Kroatien och Serbien
 *   en   turisten som inte talar något av de andra
 *   de   den största turistgruppen i regionen
 *   no   grannmarknaden, och den som ligger närmast svenskan
 *   sv   teamets språk, och det produkten skrivs på
 *
 * `bs` täcker bosniska, kroatiska OCH serbiska i latinsk skrift. Se `bs.ts` för
 * varför det är en ordbok och inte tre.
 */
export const LOCALES = ["bs", "en", "de", "no", "sv"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Svenska är standard.
 *
 * Inte för att den är störst på marknaden — den är minst — utan för att
 * produkten byggs och testas på svenska. Ett standardspråk som ingen i teamet
 * läser flytande blir ett standardspråk fullt av tryckfel.
 *
 * Valet syns sällan: roten väljer språk ur `Accept-Language`, och en gäst i
 * Sarajevo får bosniska utan att någonsin passera standardvärdet. Det är
 * återfallet för den vars telefon inte säger något vi känner igen.
 */
export const DEFAULT_LOCALE: Locale = "sv";

/**
 * Vad språket heter — på sitt eget språk.
 *
 * Aldrig översatt. Den som letar efter tyska i en språkmeny letar efter
 * "Deutsch", inte efter "Tyska", och en meny på ett språk hon inte läser är
 * precis den situation hon försöker ta sig ur.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  bs: "Bosanski / Hrvatski / Srpski",
  en: "English",
  de: "Deutsch",
  no: "Norsk",
  sv: "Svenska",
};

/**
 * Kortformen, för språkväljarens knapp.
 *
 * `LOCALE_LABELS.bs` är tjugoåtta tecken och spränger sidhuvudet. Knappen visar
 * därför bara det språk gästen står i, kort — hela namnet står i listan som
 * fälls ut, så att en kroat eller serb känner igen sitt eget språk där.
 */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  bs: "Bosanski",
  en: "English",
  de: "Deutsch",
  no: "Norsk",
  sv: "Svenska",
};

/** BCP 47-taggar för `<html lang>`. */
export const LOCALE_TAGS: Record<Locale, string> = {
  bs: "bs",
  en: "en",
  de: "de",
  // Texten är bokmål. `nb` vore exaktare men `no` är det som står i URL:en, och
  // att låta adress och tagg gå isär är en förvirring utan vinst.
  no: "no",
  sv: "sv-SE",
};

/**
 * Taggarna `hreflang` pekar ut mot samma sida.
 *
 * `bs` är en ordbok för tre standarder, och sidan ska hittas av någon som söker
 * på kroatiska i Zagreb eller på serbiska i Belgrad — inte bara av någon i
 * Sarajevo. Flera `hreflang` mot samma URL är tillåtet och är precis vad
 * standarden finns för.
 *
 * Serbiska anges som `sr-Latn`: sidan är skriven med latinska bokstäver, och en
 * omärkt `sr` hade lovat kyrilliska till den som söker på det.
 */
export const LOCALE_ALTERNATE_TAGS: Record<Locale, readonly string[]> = {
  bs: ["bs", "hr", "sr-Latn"],
  en: ["en"],
  de: ["de"],
  no: ["no"],
  sv: ["sv-SE"],
};

/**
 * Taggar för `Intl` — datum, tider och tal.
 *
 * Skilda från `LOCALE_TAGS` på grund av engelskan. Ett omärkt `en` ger
 * amerikanskt format i de flesta miljöer, alltså månad före dag: `8/20/2026`.
 * Hela marknaden skriver dag före månad, och ett datum som läses baklänges är
 * värre än ett datum på fel språk — den 8 augusti och den 20 augusti är båda
 * fullt rimliga dagar att ha beställt mat.
 */
export const LOCALE_DATE_TAGS: Record<Locale, string> = {
  bs: "bs-BA",
  en: "en-GB",
  de: "de-DE",
  no: "nb-NO",
  sv: "sv-SE",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Språk vi inte har en egen ordbok för, men som ska landa rätt ändå.
 *
 * En kroatisk telefon skickar `hr-HR` och en serbisk `sr-RS`. Utan de här
 * raderna faller båda till standardspråket — alltså svenska, mitt i Zagreb.
 * Det är inte ett kantfall utan halva marknaden.
 *
 * `nn` är nynorska och `nb` bokmål; båda får samma norska ordbok. Ingen av dem
 * skulle känna igen sig i svenska.
 */
const ALIASES: Record<string, Locale> = {
  hr: "bs",
  sr: "bs",
  bs: "bs",
  nb: "no",
  nn: "no",
};

/**
 * Väljer språk ur en `Accept-Language`-header.
 *
 * Används när gästen kommer till roten utan att ha valt något, och på QR-sidan
 * och kvittona, som är noindex och därför saknar språk i adressen. Kvalitet
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
        // "en-GB" → "en", "sr-RS" → "sr". Regionen spelar ingen roll; vi har
        // inga regionala varianter och kommer inte att ha det.
        base: tag.trim().toLowerCase().split("-")[0] ?? "",
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const entry of ranked) {
    if (isLocale(entry.base)) return entry.base;
    const alias = ALIASES[entry.base];
    if (alias) return alias;
  }

  return DEFAULT_LOCALE;
}
