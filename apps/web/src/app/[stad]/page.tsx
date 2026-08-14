import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listCities, listCuisines, searchRestaurants } from "@/lib/discovery";
import { publicEnv } from "@/lib/env";
import { CityRestaurantList } from "@/components/discovery/city-restaurant-list";
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
  params: Promise<{ stad: string }>;
}

async function findCity(slug: string) {
  const cities = await listCities();
  return cities.find((city) => city.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { stad } = await params;
  const city = await findCity(stad);

  if (!city) return { title: "Staden hittades inte" };

  return {
    title: `Restauranger i ${city.name}`,
    description: `Beställ mat från restauranger i ${city.name}. Avhämtning, leverans eller direkt vid bordet — utan app.`,
    alternates: { canonical: `/${city.slug}` },
    openGraph: {
      title: `Restauranger i ${city.name} | Burp`,
      description: `Hitta och beställ från restauranger i ${city.name}.`,
      url: `/${city.slug}`,
      type: "website",
    },
  };
}

export default async function CityPage({ params }: PageProps) {
  const { stad } = await params;
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
          <span>{city.name}</span>
        </nav>

        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Restauranger i {city.name}
        </h1>
        <p className="mt-2 opacity-70">
          {restaurants.length === 1
            ? "En restaurang"
            : `${restaurants.length} restauranger`}{" "}
          tar emot beställningar via Burp i {city.name}. Beställ för avhämtning eller skanna
          QR-koden vid bordet.
        </p>

        {cuisines.length > 0 ? (
          <nav aria-label="Kök" className="mt-5 flex flex-wrap gap-2">
            {cuisines.map((cuisine) => (
              <Link
                key={cuisine}
                href={`/${city.slug}/${slugifyCuisine(cuisine)}`}
                className="min-h-9 rounded-full border border-black/15 px-3.5 py-1.5 text-sm hover:border-black/35 dark:border-white/20 dark:hover:border-white/40"
              >
                {cuisine} i {city.name}
              </Link>
            ))}
          </nav>
        ) : null}

        <CityRestaurantList restaurants={restaurants} />
      </main>
    </div>
  );
}
