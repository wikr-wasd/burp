import { permanentRedirect } from "next/navigation";
import { isLocale, localePath, type Locale } from "@/lib/i18n";

/**
 * `/upptack` pekar på startsidan.
 *
 * Kart- och listvyn låg här i en dag. Sedan flyttade den till `/` — den som
 * kommer till burp.se utan att ha skannat en QR-kod frågar "vad finns nära
 * mig", och det svaret ska inte ligga en klick bort.
 *
 * En permanent omdirigering och inte en radering: adressen hann komma ut i en
 * sitemap, och två sidor med samma innehåll är dubblerat innehåll för Google.
 * 308 säger vilken av dem som gäller.
 *
 * Frågesträngen följer med. Den som delat en länk med ett filter ska landa på
 * samma filter, inte på allt.
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DiscoverRedirect({
  params: routeParams,
  searchParams,
}: PageProps) {
  const { locale: raw } = await routeParams;
  const locale: Locale = isLocale(raw) ? raw : "sv";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string" && value) params.set(key, value);
  }

  const query = params.toString();
  permanentRedirect(localePath(locale, query ? `/?${query}` : "/"));
}
