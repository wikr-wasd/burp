import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { localePath, pickLocale } from "@/lib/i18n";

/**
 * `/anslut` väljer språk och skickar vidare.
 *
 * Sidan flyttade under språksegmentet 2026-08-22 — se `[locale]/anslut`. Den
 * gamla adressen står kvar därför att den hann komma ut: den låg i sidfoten
 * och i sidhuvudets enda knapp på varje publik sida, och en restauratör som
 * sparat länken ska inte mötas av en 404.
 *
 * Omdirigeringen är tillfällig (307) och inte permanent, av samma skäl som
 * roten: målet beror på `Accept-Language`, och en 308 hade cachats hårt i
 * webbläsaren och låst fast besökaren vid det språk hen råkade ha första
 * gången. En kroatisk telefon som en gång landat på `/bs/anslut` hade aldrig
 * kunnat komma till `/en/anslut` igen.
 *
 * Den ligger därför inte i sitemapen. Det gör de fem riktiga adresserna.
 */

export const dynamic = "force-dynamic";

export default async function JoinRedirect() {
  const locale = pickLocale((await headers()).get("accept-language"));
  redirect(localePath(locale, "/anslut"));
}
