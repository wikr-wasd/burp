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

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },

    // Stadssidorna är landningssidorna för "sushi malmö"-sökningar och är
    // därför viktigare än enskilda restauranger.
    ...cities.map((city) => ({
      url: `${base}/${city}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),

    ...cities.flatMap((city) =>
      cuisines.map((cuisine) => ({
        url: `${base}/${city}/${slugifyCuisine(cuisine)}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ),

    ...rows.map((row) => ({
      url: `${base}/r/${row.city_slug}/${row.slug}`,
      lastModified: new Date(row.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
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
