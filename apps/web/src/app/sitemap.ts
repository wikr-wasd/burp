import { localePath, LOCALES, LOCALE_ALTERNATE_TAGS } from "@/lib/i18n";
import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Sitemap (avsnitt 9).
 *
 * Google hittar sidorna även utan sitemap, men en sitemap gör två saker som
 * länkstrukturen inte gör: den talar om när en sida senast ändrades, och den
 * ger nya restauranger en väg in innan någon länkar till dem.
 *
 * Bara ACTIVE restauranger tas med. En PENDING-restaurang som ännu inte
 * godkänts ska inte indexeras, och en avstängd ska inte fortsätta ligga kvar
 * som en levande träff.
 */

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.NEXT_PUBLIC_SITE_URL;
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("slug, city_slug, cuisines, updated_at")
    .eq("status", "ACTIVE");

  const rows = restaurants ?? [];

  const cities = [...new Set(rows.map((row) => row.city_slug))];
  const cuisines = [...new Set(rows.flatMap((row) => row.cuisines ?? []))];

  /*
   * Varje sida en gång per språk, med `alternates` som knyter ihop dem.
   *
   * Utan `hreflang` läser Google språkversionerna som dubblerat innehåll och
   * väljer själv vilken som får synas — ofta fel. Med den vet den att
   * `/sv/sarajevo` och `/bs/sarajevo` är samma sida på två språk, och kan visa
   * rätt version för rätt användare.
   *
   * Ett språk kan peka ut FLERA taggar. `/bs/` är skriven på bosniska,
   * kroatiska och serbiska på en gång — en ordbok för tre standarder — och ska
   * hittas av någon som söker på kroatiska i Zagreb lika väl som av någon i
   * Sarajevo. Flera `hreflang` mot samma URL är precis vad standarden finns för.
   */
  const languages = (path: string) =>
    Object.fromEntries(
      LOCALES.flatMap((locale) =>
        LOCALE_ALTERNATE_TAGS[locale].map(
          (tag) => [tag, `${base}${localePath(locale, path)}`] as const,
        ),
      ),
    );

  const forEachLocale = <T extends Record<string, unknown>>(
    path: string,
    rest: T,
  ) =>
    LOCALES.map((locale) => ({
      url: `${base}${localePath(locale, path)}`,
      alternates: { languages: languages(path) },
      ...rest,
    }));

  return [
    ...forEachLocale("/", {
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 1,
    }),

    // Ingen egen rad för /upptack: den pekar permanent på startsidan sedan
    // kartan flyttade dit. En sitemap som listar en omdirigering ber Google
    // indexera en adress som inte finns.

    // Stadssidorna är landningssidorna för "ćevapi sarajevo"-sökningar och är
    // därför viktigare än enskilda restauranger.
    ...cities.flatMap((city) =>
      forEachLocale(`/${city}`, {
        lastModified: new Date(),
        changeFrequency: "daily" as const,
        priority: 0.9,
      }),
    ),

    ...cities.flatMap((city) =>
      cuisines.flatMap((cuisine) =>
        forEachLocale(`/${city}/${slugifyCuisine(cuisine)}`, {
          lastModified: new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }),
      ),
    ),

    ...rows.flatMap((row) =>
      forEachLocale(`/r/${row.city_slug}/${row.slug}`, {
        lastModified: new Date(row.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }),
    ),
  ];
}

/** "Mellanöstern" → "mellanostern". Samma regel som databasens slugify(). */
export function slugifyCuisine(cuisine: string): string {
  return cuisine
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
