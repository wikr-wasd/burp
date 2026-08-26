import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pickLocale } from "@/lib/i18n";

/**
 * `/r/{stad}/{restaurang}` utan språk väljer språk åt besökaren.
 *
 * Restaurangsidan bor under `/{språk}/r/…` — Google indexerar en URL och inte
 * en cookie, så språket måste stå i adressen. Men adressen UTAN språk är den
 * naturliga att skriva av, att klistra in och att länka till internt, och den
 * svarade 404. Backoffice "Visa publikt" pekade dit, vilket såg ut som att
 * restaurangen inte fanns fastän den var ACTIVE.
 *
 * Samma lösning som roten: 307 mot det språk webbläsaren redan är inställd på.
 * Tillfällig och inte permanent — en permanent omdirigering cachas hårt och
 * skulle låsa fast besökaren vid det språk hen råkade ha första gången.
 *
 * Ingen kontroll av att restaurangen finns görs här. Sidan bakom svarar 404
 * om den inte gör det, och en uppslagning till hade varit ett andra svar på
 * samma fråga.
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ city: string; slug: string }>;
}

export default async function RestaurantLocaleRedirect({ params }: PageProps) {
  const { city, slug } = await params;
  const locale = pickLocale((await headers()).get("accept-language"));

  redirect(`/${locale}/r/${city}/${slug}`);
}
