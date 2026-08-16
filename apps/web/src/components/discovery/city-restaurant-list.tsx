import Link from "next/link";
import { Clock, MapPin, Star } from "lucide-react";
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
        const open = Boolean(hours);
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
              className="card group flex h-full flex-col overflow-hidden transition-shadow duration-[var(--speed)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
            >
              <div className="relative">
                <FoodImage
                  src={restaurantImage(
                    restaurant.name,
                    restaurant.city,
                    restaurant.heroImageUrl,
                  )}
                  alt=""
                />
                <span
                  className={`badge absolute top-3 left-3 backdrop-blur ${
                    open
                      ? "bg-green-600/90 text-white"
                      : "bg-[var(--surface)]/90 text-[var(--muted)]"
                  }`}
                >
                  <Clock size={12} aria-hidden="true" />
                  {open ? `Idag ${hours}` : "Stängt idag"}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-lg group-hover:text-burp-600">
                    {restaurant.name}
                  </h2>
                  {restaurant.ratingCount > 0 && restaurant.ratingAverage !== null ? (
                    <span className="shrink-0 text-sm tabular-nums">
                      <Star
                        size={14}
                        aria-hidden="true"
                        className="inline fill-[var(--star)] text-[var(--star)]"
                      />{" "}
                      {restaurant.ratingAverage.toFixed(1).replace(".", ",")}
                      <span className="text-[var(--muted)]"> ({restaurant.ratingCount})</span>
                    </span>
                  ) : null}
                </div>

                {meta ? <p className="label-caps mt-1">{meta}</p> : null}

                {restaurant.description ? (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
                    {restaurant.description}
                  </p>
                ) : null}

                <p className="mt-auto flex items-center gap-1.5 pt-3 text-sm text-[var(--muted)]">
                  <MapPin size={13} aria-hidden="true" className="shrink-0" />
                  {restaurant.streetAddress}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
