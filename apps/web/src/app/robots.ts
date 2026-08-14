import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/**
 * robots.txt.
 *
 * Det som utestängs är inte hemligt — det skyddas av RLS och inloggning. Men
 * en indexerad `/t/R7K2M9X4TB` vore en katastrof av ett annat slag: en
 * sökträff som ger vem som helst en giltig bordssession på någon annans bord.
 *
 * Kontopanelerna utestängs för att de inte har något värde i ett sökresultat
 * och bara skulle konsumera crawl-budget.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/t/", // bordskoder — får aldrig indexeras
          "/order/", // gästens kvitton
          "/konto/",
          "/dashboard/",
          "/kok",
          "/backoffice/",
          "/logga-in",
          "/api/",
        ],
      },
    ],
    sitemap: `${publicEnv.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
