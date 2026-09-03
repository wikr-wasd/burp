import type { GuestOrder } from "./guest";

/**
 * Gästens egen sammanfattning — vad hon faktiskt äter, och var.
 *
 * Ren funktion över den orderhistorik sidan ändå hämtar. Ingen ny insamling:
 * det personliga byggs av det gästen redan gjort, inte av fler frågor till
 * henne. Det är också skälet till att den ligger här och inte som en SQL-vy —
 * datan är redan i minnet, och en andra fråga hade räknat samma sak en gång
 * till med risk att räkna annorlunda.
 *
 * Avbrutna och återbetalda order räknas inte. En måltid som aldrig blev av
 * säger ingenting om vad gästen tycker om, och "din favoriträtt" som pekar på
 * något hon fick pengarna tillbaka för läser som ett hån.
 */

const NOT_A_VISIT = ["CANCELLED", "REFUNDED"];

export interface PlaceSummary {
  restaurantId: string;
  name: string;
  slug: string;
  citySlug: string;
  visits: number;
}

export interface DishSummary {
  name: string;
  times: number;
}

export interface GuestSummary {
  /** Antal genomförda besök i den hämtade historiken. */
  visits: number;
  /** Datum för den äldsta ordern vi ser, som ISO-sträng. Null utan historik. */
  since: string | null;
  places: PlaceSummary[];
  dishes: DishSummary[];
}

export function summariseGuest(orders: readonly GuestOrder[], top = 3): GuestSummary {
  const real = orders.filter((order) => !NOT_A_VISIT.includes(order.status));

  const places = new Map<string, PlaceSummary>();
  const dishes = new Map<string, DishSummary>();
  let since: string | null = null;

  for (const order of real) {
    const when = order.completedAt ?? order.placedAt;
    if (when && (since === null || when < since)) since = when;

    const place = places.get(order.restaurantId);
    if (place) {
      place.visits += 1;
    } else {
      places.set(order.restaurantId, {
        restaurantId: order.restaurantId,
        name: order.restaurantName,
        slug: order.restaurantSlug,
        citySlug: order.citySlug,
        visits: 1,
      });
    }

    /*
     * Samma rätt två gånger på en nota räknas som ett tillfälle, inte två.
     *
     * "Du beställer oftast X" ska svara på hur många gånger hon VALDE rätten,
     * och den som beställer två portioner åt sällskapet har valt en gång.
     */
    for (const name of new Set(order.itemNames)) {
      const dish = dishes.get(name);
      if (dish) dish.times += 1;
      else dishes.set(name, { name, times: 1 });
    }
  }

  return {
    visits: real.length,
    since,
    // Flest först, och vid lika många i bokstavsordning — annars byter listan
    // ordning mellan två sidladdningar utan att något hänt.
    places: [...places.values()]
      .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name))
      .slice(0, top),
    dishes: [...dishes.values()]
      .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name))
      .slice(0, top),
  };
}
