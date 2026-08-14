import Link from "next/link";
import { priceTierLabel, todaysHours, type DiscoveryRestaurant } from "@/lib/discovery";

/**
 * Restauranglistan på stads- och kökssidorna.
 *
 * Serverkomponent utan klientstate. Sidorna finns för Googles skull, och en
 * lista som kräver JavaScript för att synas är en lista som inte indexeras.
 */
export function CityRestaurantList({
  restaurants,
}: {
  restaurants: readonly DiscoveryRestaurant[];
}) {
  if (restaurants.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-black/10 p-6 dark:border-white/15">
        <p className="opacity-70">
          Inga restauranger här än. Driver du en restaurang i området?
        </p>
        <Link
          href="/logga-in"
          className="mt-3 inline-block rounded-md bg-burp-600 px-4 py-2.5 font-medium text-white"
        >
          Anslut din restaurang
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {restaurants.map((restaurant) => {
        const hours = todaysHours(restaurant.openingHours);

        return (
          <li key={restaurant.id}>
            <Link
              href={`/r/${restaurant.citySlug}/${restaurant.slug}`}
              className="block h-full rounded-xl border border-black/10 p-4 transition-colors hover:border-black/30 dark:border-white/15 dark:hover:border-white/35"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">{restaurant.name}</h2>
                {restaurant.ratingCount > 0 && restaurant.ratingAverage !== null ? (
                  <span className="shrink-0 text-sm tabular-nums opacity-70">
                    {restaurant.ratingAverage.toFixed(1).replace(".", ",")}
                    <span className="opacity-70"> ({restaurant.ratingCount})</span>
                  </span>
                ) : null}
              </div>

              <p className="mt-1 text-sm opacity-60">
                {[
                  restaurant.cuisines.join(", ") || null,
                  priceTierLabel(restaurant.priceTier),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {restaurant.description ? (
                <p className="mt-2 line-clamp-2 text-sm opacity-70">{restaurant.description}</p>
              ) : null}

              <p className="mt-2 text-sm opacity-60">
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
