import "server-only";

import { createClient } from "./supabase/server";

/**
 * Rekommendationer på gästens favoritsida.
 *
 * TVÅ listor med var sin sanning, och de får aldrig blandas:
 *
 *   `alsoSaved`  räknas ur riktiga favoriter. Rubriken "andra sparade också"
 *                är ett påstående om vad gäster faktiskt gjort, och en
 *                handplockad lista under den rubriken vore en annons som utger
 *                sig för att vara något annat.
 *
 *   `featured`   Burps eget urval per stad, under sin egen rubrik.
 *
 * Samma tillit som `lib/reviews.ts` skyddar: betyg får bara komma från
 * genomförda order. En påhittad popularitetslista hade underminerat exakt det.
 */

export interface RecommendedRestaurant {
  id: string;
  name: string;
  slug: string;
  city: string;
  citySlug: string;
  cuisines: string[];
  ratingAverage: number | null;
  /** Antal gäster som sparat stället. Null för Burps utvalda. */
  saves: number | null;
}

export interface Recommendations {
  alsoSaved: RecommendedRestaurant[];
  /** Sant när listan bygger på gäster som delar en favorit med den här. */
  fromSimilarGuests: boolean;
  featured: RecommendedRestaurant[];
  /** Staden urvalet gäller, eller null när gästen inte sparat något än. */
  citySlug: string | null;
  cityName: string | null;
}

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  city: string;
  city_slug: string;
  cuisines: string[] | null;
  rating_average: number | null;
};

const COLUMNS = "id, name, slug, city, city_slug, cuisines, rating_average";

function toRecommended(row: RestaurantRow, saves: number | null): RecommendedRestaurant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    citySlug: row.city_slug,
    cuisines: row.cuisines ?? [],
    ratingAverage: row.rating_average,
    saves,
  };
}

export async function getRecommendations(
  userId: string,
  favouriteCitySlugs: readonly string[],
): Promise<Recommendations> {
  const supabase = await createClient();

  /*
   * Området först, hela plattformen sedan.
   *
   * "Lokalt" betyder staden gästen faktiskt sparar i. Den som sparat två
   * ställen i Mostar ska få Mostar — men hellre något från Sarajevo än en tom
   * lista, och därför faller uppslaget tillbaka på hela plattformen.
   */
  const citySlug = favouriteCitySlugs[0] ?? null;

  const local = citySlug
    ? await supabase.rpc("co_favourites", {
        p_user_id: userId,
        p_city_slug: citySlug,
        p_limit: 6,
      })
    : { data: null };

  const rows =
    local.data && local.data.length > 0
      ? local.data
      : ((
          await supabase.rpc("co_favourites", {
            p_user_id: userId,
            // Utelämnad och inte null: parametern har ett DEFAULT i SQL:en, och
            // de genererade typerna speglar det.
            p_limit: 6,
          })
        ).data ?? []);

  const savesById = new Map(rows.map((row) => [row.restaurant_id, row.saves]));
  const fromSimilarGuests = rows.some((row) => row.from_others);

  const { data: recommended } = rows.length
    ? await supabase
        .from("restaurants")
        .select(COLUMNS)
        .in(
          "id",
          rows.map((row) => row.restaurant_id),
        )
    : { data: [] };

  // Ordningen kommer från funktionen, inte från tabellen — den vet vad som är
  // mest sparat.
  const byId = new Map((recommended ?? []).map((row) => [row.id, row as RestaurantRow]));
  const alsoSaved = rows
    .map((row) => byId.get(row.restaurant_id))
    .filter((row): row is RestaurantRow => row !== undefined)
    .map((row) => toRecommended(row, savesById.get(row.id) ?? null));

  /* ── Burps utvalda i samma stad ─────────────────────────────────────────── */

  const { data: featuredRows } = citySlug
    ? await supabase
        .from("featured_restaurants")
        .select("restaurant_id, sort_order")
        .eq("city_slug", citySlug)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const featuredIds = (featuredRows ?? []).map((row) => row.restaurant_id);

  const { data: featuredDetails } = featuredIds.length
    ? await supabase.from("restaurants").select(COLUMNS).in("id", featuredIds).eq("status", "ACTIVE")
    : { data: [] };

  const featuredById = new Map(
    (featuredDetails ?? []).map((row) => [row.id, row as RestaurantRow]),
  );

  const featured = featuredIds
    .map((id) => featuredById.get(id))
    .filter((row): row is RestaurantRow => row !== undefined)
    .map((row) => toRecommended(row, null));

  return {
    alsoSaved,
    fromSimilarGuests,
    featured,
    citySlug,
    cityName: alsoSaved[0]?.city ?? featured[0]?.city ?? null,
  };
}
