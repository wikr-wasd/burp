import Link from "next/link";
import { Star } from "lucide-react";
import type { RecommendedRestaurant } from "@/lib/recommendations";
import { FavoriteButton } from "@/components/guest/favorite-button";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * En rekommendationslista.
 *
 * Serverkomponent: raderna är länkar och en spara-knapp som redan är
 * klientkod. Att göra hela listan till klientkod hade skickat en lista i JSON
 * för att rendera samma HTML.
 *
 * Antalet sparningar skrivs ut när det finns. Det är skillnaden mellan en
 * rekommendation och en gissning — gästen ska kunna se ATT den bygger på
 * något.
 */
export function RecommendationList({
  restaurants,
  labels,
}: {
  restaurants: readonly RecommendedRestaurant[];
  labels: Dictionary["account"];
}) {
  if (restaurants.length === 0) return null;

  return (
    <ul className="mt-4 space-y-3">
      {restaurants.map((restaurant) => (
        <li key={restaurant.id} className="card flex flex-wrap items-start gap-3 p-4">
          <div className="mr-auto min-w-0">
            <Link
              href={`/r/${restaurant.citySlug}/${restaurant.slug}`}
              className="font-semibold underline-offset-4 hover:underline"
            >
              {restaurant.name}
            </Link>

            <p className="text-sm opacity-60">
              {restaurant.city}
              {restaurant.cuisines.length > 0 ? ` · ${restaurant.cuisines.join(", ")}` : ""}
            </p>

            <p className="mt-0.5 flex items-center gap-3 text-sm opacity-60">
              {restaurant.ratingAverage !== null ? (
                <span className="inline-flex items-center gap-1">
                  <Star aria-hidden="true" className="size-3.5 fill-gold-400 text-gold-400" />
                  {restaurant.ratingAverage.toFixed(1).replace(".", ",")}
                </span>
              ) : null}

              {restaurant.saves !== null && restaurant.saves > 0 ? (
                <span>
                  {restaurant.saves === 1
                    ? labels.savedByOne
                    : fill(labels.savedBy, { n: restaurant.saves })}
                </span>
              ) : null}
            </p>
          </div>

          <FavoriteButton
            restaurantId={restaurant.id}
            isFavorite={false}
            saveLabel={labels.saveFavorite}
            removeLabel={labels.removeFavorite}
            failedLabel={labels.errors.favoriteFailed}
          />
        </li>
      ))}
    </ul>
  );
}
