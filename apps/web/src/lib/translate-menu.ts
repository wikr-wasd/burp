import "server-only";

import type { Locale } from "./i18n/config";
import type { Menu } from "./menu";
import { translateMany } from "./translate";

/**
 * Menyn på gästens språk — beskrivningarna, inte namnen.
 *
 * ── Varför inte rättnamnen ─────────────────────────────────────────────────
 *
 * "Ćevapi" är inte ett ord att översätta, det är vad rätten HETER. En maskin
 * gör den till "minced meat sausages", och sedan står gästen vid bordet och
 * pekar på något som inte finns i menyn hon läste. Fyra saker bär dessutom
 * namnet vidare oöversatt hela vägen: köksbiljetten, notan, kvittot och
 * `order_items.name_snapshot`. Ett översatt namn i menyn hade betytt att
 * gästen och köket talar om olika rätter.
 *
 * Beskrivningen är motsatsen. Den finns just för att förklara vad rätten är,
 * och den är oläslig för den som inte kan språket. Det är där översättningen
 * gör hela nyttan — "Sarma" säger ingenting, "kåldolmar med rökt kött" säger
 * allt.
 *
 * Samma sak för avdelningsnamnen: "Predjela" översätts, för det är en rubrik
 * och inte ett namn.
 *
 * ── Vad som aldrig går den här vägen ───────────────────────────────────────
 *
 * Allergenerna. De är koder sedan migration 0071 och översätts av vår egen
 * ordbok — exakt, varje gång. En maskin som gissar fel på "nötter" ger ett
 * svar man inte vill ge en allergiker.
 *
 * ── Ett anrop för hela menyn ───────────────────────────────────────────────
 *
 * Alla beskrivningar samlas i EN omgång. Och eftersom cachen slår på
 * innehållet betalas en meny bara första gången någon läser den på ett visst
 * språk — därefter är den gratis, för alla gäster.
 */
export async function translateMenu(
  menu: Menu,
  locale: Locale,
): Promise<{ menu: Menu; translated: boolean }> {
  const sources: string[] = [];

  for (const category of menu.categories) {
    sources.push(category.name);
    if (category.description) sources.push(category.description);

    for (const item of category.items) {
      if (item.description) sources.push(item.description);
      if (item.unavailableReason) sources.push(item.unavailableReason);
    }
  }

  if (sources.length === 0) return { menu, translated: false };

  const results = await translateMany(sources, locale);
  if (!results.some((result) => result.translated)) return { menu, translated: false };

  // Samma ordning som listan sattes ihop i. Ordningen ÄR kontraktet — en
  // förskjutning här sätter fel beskrivning på fel rätt, vilket är värre än
  // ingen översättning alls.
  let position = 0;
  const next = () => results[position++]?.text ?? "";

  const categories = menu.categories.map((category) => {
    const name = next();
    const description = category.description ? next() : null;

    const items = category.items.map((item) => ({
      ...item,
      description: item.description ? next() : null,
      unavailableReason: item.unavailableReason ? next() : null,
    }));

    return { ...category, name, description, items };
  });

  return { menu: { ...menu, categories }, translated: true };
}
