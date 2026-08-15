import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listCities, listCuisines, searchRestaurants } from "@/lib/discovery";
import { publicEnv } from "@/lib/env";
import { CityRestaurantList } from "@/components/discovery/city-restaurant-list";
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
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <SiteHeader
        breadcrumbs={[{ label: "Alla städer", href: "/" }, { label: city.name }]}
      />

      <main className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <p className="label-caps">Stad</p>

        <h1 className="font-display mt-2 text-5xl sm:text-6xl">
          Restauranger i {city.name}
        </h1>

        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
          {restaurants.length === 1
            ? "En restaurang"
            : `${restaurants.length} restauranger`}{" "}
          tar emot beställningar via Burp i {city.name}. Beställ för avhämtning eller skanna
          QR-koden vid bordet.
        </p>

        {cuisines.length > 0 ? (
          <nav aria-label="Kök" className="mt-8 flex flex-wrap items-center gap-x-1 gap-y-1">
            {/* Utan etiketten läser raden som brödtext. Gästen ska se på en
                halv sekund att det är något att klicka på, inte en uppräkning. */}
            <span className="label-caps mr-3">Kök</span>
            {cuisines.map((cuisine) => (
              <Link
                key={cuisine}
                href={`/${city.slug}/${slugifyCuisine(cuisine)}`}
                className="inline-flex min-h-11 items-center border-b-2 border-[var(--rule)] px-3 text-sm transition-colors duration-[var(--speed)] hover:border-burp-600 hover:text-burp-600"
              >
                {cuisine}
              </Link>
            ))}
          </nav>
        ) : null}

        <hr className="rule mt-8" />

        <CityRestaurantList restaurants={restaurants} />
      </main>

      <SiteFooter />
    </div>
  );
}
