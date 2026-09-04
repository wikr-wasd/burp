import type { Metadata } from "next";
import { popularRestaurantIds } from "@/lib/activity";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney, type CurrencyCode } from "@burp/core";
import { CityRestaurantList } from "@/components/discovery/city-restaurant-list";
import { listCities, searchRestaurants } from "@/lib/discovery";
import { dishesInCity, restaurantsWithDish } from "@/lib/dishes";
import { publicEnv } from "@/lib/env";
import { dictionary, fill, isLocale, localePath, LOCALE_TAGS, type Locale } from "@/lib/i18n";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { ShareButton } from "@/components/site/share-button";

/**
 * Rättsida — burp.se/sv/sarajevo/ratt/punjene-paprike.
 *
 * ── Varför den här sidan finns ──────────────────────────────────────────────
 *
 * Det är den enda sökningen Burp realistiskt kan vinna. På "restaurang
 * Sarajevo" står Googles egen karta först och restaurangernas egna profiler
 * därefter; på "punjene paprike Sarajevo" finns oftast ingen sida alls. Att
 * lägga till mer schema-märkning på restaurangsidorna hade inte hjälpt —
 * Google indexerar en URL, och den här adressen fanns inte.
 *
 * ── Varför slugen slås upp och inte litas på ────────────────────────────────
 *
 * Samma skäl som kökssidan: utan uppslag blir vilken sträng som helst en
 * indexerbar sida utan innehåll. `dishes_in_city()` kräver dessutom att minst
 * TVÅ restauranger har rätten. En sida som listar ett enda ställe är en sämre
 * kopia av det ställets egen sida — dubblerat innehåll för Google och en
 * återvändsgränd för den som klickar.
 */

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ locale: string; stad: string; ratt: string }>;
}

async function resolve(citySlug: string, dishSlug: string) {
  const cities = await listCities();
  const city = cities.find((entry) => entry.slug === citySlug);
  if (!city) return null;

  const dishes = await dishesInCity(city.slug);
  const dish = dishes.find((entry) => entry.slug === dishSlug);
  if (!dish) return null;

  return { city, dish, dishes };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw, stad, ratt } = await params;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);
  const resolved = await resolve(stad, ratt);

  if (!resolved) return { title: "Sidan hittades inte" };

  const { city, dish } = resolved;
  const path = `/${city.slug}/ratt/${ratt}`;

  return {
    title: fill(t.dish.title, { dish: dish.name, city: city.name }),
    description: fill(t.dish.meta, { dish: dish.name, city: city.name }),
    alternates: { canonical: localePath(locale, path) },
    openGraph: {
      title: `${fill(t.dish.title, { dish: dish.name, city: city.name })} | Burp`,
      description: fill(t.dish.meta, { dish: dish.name, city: city.name }),
      url: localePath(locale, path),
      type: "website",
    },
  };
}

export default async function DishPage({ params }: PageProps) {
  const { locale: raw, stad, ratt } = await params;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);

  const resolved = await resolve(stad, ratt);
  if (!resolved) notFound();

  const { city, dish, dishes } = resolved;

  const serving = await restaurantsWithDish(city.slug, dish.slug);
  const restaurants = await searchRestaurants({
    city: city.slug,
    ids: serving.map((row) => row.restaurantId),
  });

  // Veckans mest beställda — samma märkning som i listorna på övriga ytor.
  const popularIds = await popularRestaurantIds();

  const priceById = new Map(serving.map((row) => [row.restaurantId, row]));

  /*
   * Lägsta priset i staden.
   *
   * Talet är hela skälet att listan är värd att läsa — och det är samma
   * `formatMoney()` som notan använder, med restaurangens egen valuta. Ett
   * pris i fel valuta är sämre än inget pris.
   */
  const cheapest = serving.reduce<(typeof serving)[number] | null>(
    (lowest, row) => (lowest === null || row.priceOre < lowest.priceOre ? row : lowest),
    null,
  );

  const path = `/${city.slug}/ratt/${ratt}`;
  const url = new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).toString();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: fill(t.dish.title, { dish: dish.name, city: city.name }),
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
        path={path}
        breadcrumbs={[
          { label: t.site.allCities, href: localePath(locale, "/") },
          { label: city.name, href: localePath(locale, `/${city.slug}`) },
          { label: dish.name },
        ]}
      />

      <main className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <p className="label-caps">{city.name}</p>

        <h1 className="font-display mt-2 text-5xl sm:text-6xl">
          {fill(t.dish.title, { dish: dish.name, city: city.name })}
        </h1>

        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
          {fill(t.dish.intro, {
            n: String(restaurants.length),
            dish: dish.name,
            city: city.name,
          })}
          {cheapest
            ? ` ${fill(t.dish.fromPrice, {
                price: formatMoney(
                  cheapest.priceOre,
                  cheapest.currency as CurrencyCode,
                  LOCALE_TAGS[locale],
                ),
              })}`
            : ""}
        </p>

        {/* Rättsidan är den mest delbara ytan som finns: "var äter man bäst
            X i Y" är själva frågan man skickar till en vän. */}
        <p className="mt-5">
          <ShareButton
            title={fill(t.dish.title, { dish: dish.name, city: city.name })}
            label={t.site.share}
            copiedLabel={t.site.shareCopied}
          />
        </p>

        <CityRestaurantList
          locale={locale}
          restaurants={restaurants}
          popularIds={popularIds}
        />

        {/*
          Priset per restaurang står under listan och inte på korten.

          Kortet är detsamma som på stads- och kökssidorna, och att ge det ett
          extra fält bara här hade betytt två sorters kort att hålla i takt.
          Tabellen svarar dessutom på den fråga sidan faktiskt ställer: vad
          kostar rätten var?
        */}
        {serving.length > 0 ? (
          <section className="mt-14">
            <h2 className="font-display text-2xl">
              {fill(t.dish.priceTitle, { dish: dish.name })}
            </h2>

            <ul className="mt-4 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
              {restaurants.map((restaurant) => {
                const row = priceById.get(restaurant.id);
                if (!row) return null;

                return (
                  <li
                    key={restaurant.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
                  >
                    <Link
                      href={localePath(locale, `/r/${restaurant.citySlug}/${restaurant.slug}`)}
                      className="font-medium hover:text-burp-600"
                    >
                      {restaurant.name}
                    </Link>
                    <span className="text-sm text-[var(--muted)]">{row.dishName}</span>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(
                        row.priceOre,
                        row.currency as CurrencyCode,
                        LOCALE_TAGS[locale],
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {dishes.length > 1 ? (
          <nav aria-label={fill(t.dish.otherDishes, { city: city.name })} className="mt-16">
            <h2 className="label-caps">{fill(t.dish.otherDishes, { city: city.name })}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {dishes
                .filter((entry) => entry.slug !== dish.slug)
                .slice(0, 12)
                .map((entry) => (
                  <Link
                    key={entry.slug}
                    href={localePath(locale, `/${city.slug}/ratt/${entry.slug}`)}
                    className="chip"
                  >
                    {entry.name}
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
