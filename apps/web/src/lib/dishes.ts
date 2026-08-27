import "server-only";

import { createClient } from "./supabase/server";

/**
 * Rätter som egna sidor.
 *
 * ── Varför uppslaget ligger i databasen ─────────────────────────────────────
 *
 * "Vilka rätter finns i staden" är en gruppering över alla menyrader, och
 * "vilka restauranger har den här rätten" en join med ett distinct. Båda hör
 * hemma där raderna finns. `slugify()` är dessutom densamma som ger
 * restaurangernas adresser deras form (migration 0023) — en egen slugifiering
 * i TypeScript hade betytt att "Ćevapi" fick två olika adresser beroende på
 * vem som räknade.
 */

export interface DishSummary {
  slug: string;
  /** Namnet som restaurangerna faktiskt skrivit det. */
  name: string;
  restaurants: number;
}

/**
 * Rätterna som är värda en egen sida i staden.
 *
 * Tröskeln — minst två restauranger — sitter i SQL-funktionen och inte här.
 * Den är ett innehållsbeslut och gäller lika mycket för sitemapen som för
 * sidan, och två kopior av den hade gett en sitemap som pekar på 404:or.
 */
export async function dishesInCity(citySlug: string): Promise<DishSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("dishes_in_city", { p_city_slug: citySlug });

  if (error || !data) return [];

  return data.map((row) => ({
    slug: row.dish_slug as string,
    name: row.dish_name as string,
    restaurants: Number(row.restaurants),
  }));
}

export interface DishAtRestaurant {
  restaurantId: string;
  /** Rättens namn hos just den här restaurangen. */
  dishName: string;
  priceOre: number;
  currency: string;
}

/**
 * Restaurangerna i staden som har rätten, med lägsta pris.
 *
 * Returnerar id och pris — inte hela restaurangen. Kortet hämtas sedan genom
 * `searchRestaurants({ ids })`, så att en restaurang ser likadan ut här som på
 * stads- och kökssidorna. Två sätt att rita samma kort glider isär.
 */
export async function restaurantsWithDish(
  citySlug: string,
  dishSlug: string,
): Promise<DishAtRestaurant[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("restaurants_with_dish", {
    p_city_slug: citySlug,
    p_dish_slug: dishSlug,
  });

  if (error || !data) return [];

  return data.map((row) => ({
    restaurantId: row.restaurant_id as string,
    dishName: row.dish_name as string,
    priceOre: row.price_ore as number,
    currency: row.currency as string,
  }));
}
