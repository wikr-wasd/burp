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
 * Kökssida — burp.se/malmo/sushi (avsnitt 9.1).
 *
 * Den mest specifika landningssidan, och den som matchar hur folk faktiskt
 * söker: "sushi malmö", inte "restauranger". Att den finns som egen URL är
 * skillnaden mellan att ranka på den frasen och att inte göra det.
 *
 * Kökstypen kommer från `restaurants.cuisines`, ett fritextfält. Sidan slår
 * därför upp den sluggade formen mot de kök som faktiskt finns i staden i
 * stället för att lita på URL:en — annars kan vilken sträng som helst bli en
 * indexerbar sida utan innehåll.
 */

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ locale: string; stad: string; kok: string }>;
}

async function resolve(citySlug: string, cuisineSlug: string) {
  const cities = await listCities();
  const city = cities.find((entry) => entry.slug === citySlug);
  if (!city) return null;

  const cuisines = await listCuisines(city.slug);
  const cuisine = cuisines.find((entry) => slugifyCuisine(entry) === cuisineSlug);
  if (!cuisine) return null;

  return { city, cuisine };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw, stad, kok } = await params;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);
  const resolved = await resolve(stad, kok);

  if (!resolved) return { title: "Sidan hittades inte" };

  const { city, cuisine } = resolved;

  return {
    title: t.city.cuisineTitle(cuisine, city.name),
    description: t.city.cuisineMeta(cuisine, city.name),
    alternates: { canonical: localePath(locale, `/${city.slug}/${kok}`) },
    openGraph: {
      title: `${t.city.cuisineTitle(cuisine, city.name)} | Burp`,
      description: t.city.cuisineMeta(cuisine, city.name),
      url: localePath(locale, `/${city.slug}/${kok}`),
      type: "website",
    },
  };
}

export default async function CuisinePage({ params }: PageProps) {
  const { locale: raw, stad, kok } = await params;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);
  const resolved = await resolve(stad, kok);

  if (!resolved) notFound();

  const { city, cuisine } = resolved;

  const [restaurants, allCuisines] = await Promise.all([
    searchRestaurants({ city: city.slug, cuisine }),
    listCuisines(city.slug),
  ]);

  const url = new URL(`/${city.slug}/${kok}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${cuisine} i ${city.name}`,
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
        path={`/${city.slug}/${kok}`}
        breadcrumbs={[
          { label: t.site.allCities, href: localePath(locale, "/") },
          { label: city.name, href: localePath(locale, `/${city.slug}`) },
          { label: cuisine },
        ]}
      />

      <main className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <p className="label-caps">{t.city.cuisineLabel(city.name)}</p>

        <h1 className="font-display mt-2 text-5xl sm:text-6xl">
          {t.city.cuisineTitle(cuisine, city.name)}
        </h1>

        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
          {t.city.cuisineIntro(restaurants.length, cuisine, city.name)}
        </p>

        
        <CityRestaurantList locale={locale} restaurants={restaurants} />

        {allCuisines.length > 1 ? (
          <nav aria-label={t.city.otherCuisines(city.name)} className="mt-16">
            <h2 className="label-caps mt-6">{t.city.otherCuisines(city.name)}</h2>
            <div className="mt-3 flex flex-wrap gap-x-1">
              {allCuisines
                .filter((entry) => entry !== cuisine)
                .map((entry) => (
                  <Link
                    key={entry}
                    href={localePath(locale, `/${city.slug}/${slugifyCuisine(entry)}`)}
                    className="inline-flex min-h-11 items-center rounded-full border border-[var(--rule-control)] bg-[var(--surface)] px-4 text-sm font-medium transition-colors duration-[var(--speed)] hover:border-burp-600 hover:text-burp-600"
                  >
                    {entry}
                  </Link>
                ))}
            </div>
          </nav>
        ) : null}
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
