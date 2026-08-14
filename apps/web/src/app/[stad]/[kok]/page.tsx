import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listCities, listCuisines, searchRestaurants } from "@/lib/discovery";
import { publicEnv } from "@/lib/env";
import { CityRestaurantList } from "@/components/discovery/city-restaurant-list";
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
  params: Promise<{ stad: string; kok: string }>;
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
  const { stad, kok } = await params;
  const resolved = await resolve(stad, kok);

  if (!resolved) return { title: "Sidan hittades inte" };

  const { city, cuisine } = resolved;

  return {
    title: `${cuisine} i ${city.name}`,
    description: `Beställ ${cuisine.toLowerCase()} i ${city.name}. Avhämtning eller beställning direkt vid bordet — utan app.`,
    alternates: { canonical: `/${city.slug}/${kok}` },
    openGraph: {
      title: `${cuisine} i ${city.name} | Burp`,
      description: `Restauranger som serverar ${cuisine.toLowerCase()} i ${city.name}.`,
      url: `/${city.slug}/${kok}`,
      type: "website",
    },
  };
}

export default async function CuisinePage({ params }: PageProps) {
  const { stad, kok } = await params;
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
    <div className="min-h-screen pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <header className="border-b border-black/10 dark:border-white/15">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          <div className="flex items-baseline justify-between gap-4">
            <Link href="/" className="text-2xl font-bold tracking-tight">
              Burp
            </Link>
            <Link
              href="/logga-in"
              className="text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
            >
              För restauranger
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <nav aria-label="Brödsmulor" className="text-sm opacity-60">
          <Link href="/" className="underline-offset-4 hover:underline">
            Alla städer
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/${city.slug}`} className="underline-offset-4 hover:underline">
            {city.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{cuisine}</span>
        </nav>

        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {cuisine} i {city.name}
        </h1>
        <p className="mt-2 opacity-70">
          {restaurants.length === 1
            ? "En restaurang"
            : `${restaurants.length} restauranger`}{" "}
          serverar {cuisine.toLowerCase()} i {city.name}.
        </p>

        <CityRestaurantList restaurants={restaurants} />

        {allCuisines.length > 1 ? (
          <nav aria-label="Andra kök" className="mt-10">
            <h2 className="text-sm font-semibold opacity-70">Andra kök i {city.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {allCuisines
                .filter((entry) => entry !== cuisine)
                .map((entry) => (
                  <Link
                    key={entry}
                    href={`/${city.slug}/${slugifyCuisine(entry)}`}
                    className="min-h-9 rounded-full border border-black/15 px-3.5 py-1.5 text-sm hover:border-black/35 dark:border-white/20 dark:hover:border-white/40"
                  >
                    {entry}
                  </Link>
                ))}
            </div>
          </nav>
        ) : null}
      </main>
    </div>
  );
}
