import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listCities, listCuisines, searchRestaurants } from "@/lib/discovery";
import { publicEnv } from "@/lib/env";
import { CityRestaurantList } from "@/components/discovery/city-restaurant-list";
import { dictionary, isLocale, localePath, type Locale } from "@/lib/i18n";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { slugifyCuisine } from "@/app/sitemap";
import { serializeJsonLd } from "@/lib/seo/jsonld";

/**
 * Stadssida — burp.se/malmo (avsnitt 9.1, 9.3).
 *
 * Landningssidan för "restaurang malmö"-sökningar. Den finns för Googles skull
 * lika mycket som för gästens: en egen URL per stad ger något att ranka, och
 * något att länka till från en annons.
 *
 * Rutten är avsiktligt en enkel `/[stad]` och inte `/stad/[namn]`. Kortare
 * URL:er delas oftare och ser mindre ut som en databas. Priset är att den
 * krockar med varje statisk rutt på toppnivå — Next ger statiska segment
 * företräde, och uppslaget nedan 404:ar allt som inte är en känd stad, så en
 * ny rutt kan aldrig av misstag bli en "stad".
 */

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ locale: string; stad: string }>;
}

async function findCity(slug: string) {
  const cities = await listCities();
  return cities.find((city) => city.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, stad } = await params;
  const city = await findCity(stad);

  if (!city) return { title: "404" };
  const t = dictionary(locale);

  return {
    title: t.city.title(city.name),
    description: `Beställ mat från restauranger i ${city.name}. Avhämtning, leverans eller direkt vid bordet — utan app.`,
    alternates: { canonical: localePath(locale as Locale, `/${city.slug}`) },
    openGraph: {
      title: `Restauranger i ${city.name} | Burp`,
      description: `Hitta och beställ från restauranger i ${city.name}.`,
      url: localePath(locale as Locale, `/${city.slug}`),
      type: "website",
    },
  };
}

export default async function CityPage({ params }: PageProps) {
  const { locale: raw, stad } = await params;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);
  const city = await findCity(stad);

  if (!city) notFound();

  const [restaurants, cuisines] = await Promise.all([
    searchRestaurants({ city: city.slug }),
    listCuisines(city.slug),
  ]);

  const url = new URL(`/${city.slug}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString();

  /**
   * ItemList med restaurangerna. Google använder den för att förstå att sidan
   * är en lista och inte en enskild restaurang — utan den riskerar sidan att
   * konkurrera med sina egna restaurangsidor om samma sökning.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Restauranger i ${city.name}`,
    url,
    numberOfItems: restaurants.length,
    itemListElement: restaurants.map((restaurant, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: new URL(
        `/r/${restaurant.citySlug}/${restaurant.slug}`,
        publicEnv.NEXT_PUBLIC_SITE_URL,
      ).toString(),
      name: restaurant.name,
    })),
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <SiteHeader
        locale={locale}
        path={`/${city.slug}`}
        breadcrumbs={[
          { label: t.site.allCities, href: localePath(locale, "/") },
          { label: city.name },
        ]}
      />

      <main className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <p className="label-caps">{t.city.label}</p>

        <h1 className="font-display mt-2 text-5xl sm:text-6xl">{t.city.title(city.name)}</h1>

        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
          {t.city.intro(restaurants.length, city.name)}
        </p>

        {cuisines.length > 0 ? (
          <nav aria-label={t.home.cuisine} className="mt-8 flex flex-wrap items-center gap-2">
            {/* Utan etiketten läser raden som brödtext. Gästen ska se på en
                halv sekund att det är något att klicka på, inte en uppräkning. */}
            <span className="label-caps mr-3">{t.home.cuisine}</span>
            {cuisines.map((cuisine) => (
              <Link
                key={cuisine}
                href={localePath(locale, `/${city.slug}/${slugifyCuisine(cuisine)}`)}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--rule-control)] bg-[var(--surface)] px-4 text-sm font-medium transition-colors duration-[var(--speed)] hover:border-burp-600 hover:text-burp-600"
              >
                {cuisine}
              </Link>
            ))}
          </nav>
        ) : null}

        
        <CityRestaurantList locale={locale} restaurants={restaurants} />
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
