import Link from "next/link";
import { FoodImage } from "@/components/media/food-image";
import { priceTierLabel, todaysHours, type DiscoveryRestaurant } from "@/lib/discovery";
import { dictionary, localePath, type Locale } from "@/lib/i18n";
import { restaurantImage } from "@/lib/placeholder";

/**
 * Restauranglistan på stads- och kökssidorna.
 *
 * Serverkomponent utan klientstate. Sidorna finns för Googles skull, och en
 * lista som kräver JavaScript för att synas är en lista som inte indexeras.
 *
 * Samma redaktionella form som startsidan: bild överst, namn i antikva,
 * metadata som spärrad versaletikett. Två listor som visar samma sak ska se
 * likadana ut — annars läser gästen dem som två olika produkter.
 */
export function CityRestaurantList({
  locale,
  restaurants,
}: {
  locale: Locale;
  restaurants: readonly DiscoveryRestaurant[];
}) {
  const t = dictionary(locale);

  if (restaurants.length === 0) {
    return (
      <div className="mt-8 border-y border-[var(--rule)] py-14 text-center">
        <p className="font-display text-2xl">{t.city.emptyTitle}</p>
        <p className="mt-2 text-[var(--muted)]">{t.city.emptyBody}</p>
        <Link
          href="/logga-in"
          className="mt-6 inline-flex min-h-11 items-center bg-burp-600 px-6 text-sm font-medium tracking-[var(--tracking-label)] text-white uppercase transition-colors hover:bg-burp-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
        >
          {t.city.emptyAction}
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {restaurants.map((restaurant) => {
        const hours = todaysHours(restaurant.openingHours, restaurant.timeZone);
        const meta = [
          restaurant.cuisines.join(" · ") || null,
          priceTierLabel(restaurant.priceTier, restaurant.currency),
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <li key={restaurant.id}>
            <Link
              href={localePath(locale, `/r/${restaurant.citySlug}/${restaurant.slug}`)}
              className="group flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-burp-600"
            >
              <FoodImage
                src={restaurantImage(
                  restaurant.name,
                  restaurant.city,
                  restaurant.heroImageUrl,
                )}
                alt=""
              />

              <div className="mt-4 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl group-hover:text-burp-600">
                  {restaurant.name}
                </h2>
                {restaurant.ratingCount > 0 && restaurant.ratingAverage !== null ? (
                  <span className="shrink-0 text-sm tabular-nums">
                    <span aria-hidden="true" className="text-burp-600">
                      ★
                    </span>{" "}
                    {restaurant.ratingAverage.toFixed(1).replace(".", ",")}
                    <span className="text-[var(--muted)]"> ({restaurant.ratingCount})</span>
                  </span>
                ) : null}
              </div>

              {meta ? <p className="label-caps mt-1.5">{meta}</p> : null}

              {restaurant.description ? (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
                  {restaurant.description}
                </p>
              ) : null}

              <p className="mt-auto pt-3 text-sm text-[var(--muted)]">
                {restaurant.streetAddress}
                {hours ? ` · idag ${hours}` : ""}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
