import { sanitizeQuery, type OpeningHours } from "@/lib/discovery-format";
import { resolveMediaUrl } from "@/lib/media-url";
import { createClient } from "@/lib/supabase/server";

export { priceTierLabel, todaysHours } from "@/lib/discovery-format";
export type { OpeningHours } from "@/lib/discovery-format";

/**
 * Uppslag för marknadsplatsens upptäcktsyta (avsnitt 9).
 *
 * Läser via den vanliga RLS-klienten, aldrig service role: aktiva restauranger
 * är publikt läsbara enligt policy i migration 0009. Data som ändå är offentlig
 * ska inte hämtas med en nyckel som kringgår RLS.
 */

export interface DiscoveryRestaurant {
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  city: string;
  description: string | null;
  streetAddress: string;
  cuisines: string[];
  priceTier: number | null;
  ratingAverage: number | null;
  ratingCount: number;
  heroImageUrl: string | null;
  openingHours: OpeningHours | null;
}

export interface DiscoveryFilters {
  /** Fritext mot namn och beskrivning. */
  query?: string;
  /** Exakt kökstyp, så som den står i `restaurants.cuisines`. */
  cuisine?: string;
  /** `city_slug`, inte stadens visningsnamn. */
  city?: string;
}

const COLUMNS =
  "id, name, slug, city, city_slug, description, street_address, cuisines, price_tier, rating_average, rating_count, hero_image_url, opening_hours";

interface RestaurantRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  city_slug: string;
  description: string | null;
  street_address: string;
  cuisines: string[] | null;
  price_tier: number | null;
  rating_average: number | null;
  rating_count: number | null;
  hero_image_url: string | null;
  opening_hours: OpeningHours | null;
}

function toRestaurant(row: RestaurantRow): DiscoveryRestaurant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    citySlug: row.city_slug,
    description: row.description,
    streetAddress: row.street_address,
    cuisines: row.cuisines ?? [],
    priceTier: row.price_tier,
    ratingAverage: row.rating_average,
    ratingCount: row.rating_count ?? 0,
    heroImageUrl: resolveMediaUrl(row.hero_image_url),
    openingHours: row.opening_hours,
  };
}

export async function searchRestaurants(
  filters: DiscoveryFilters = {},
): Promise<DiscoveryRestaurant[]> {
  const supabase = await createClient();

  let request = supabase.from("restaurants").select(COLUMNS).eq("status", "ACTIVE");

  const query = filters.query ? sanitizeQuery(filters.query) : "";
  if (query) {
    request = request.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
  }

  if (filters.cuisine) {
    // `cuisines` är en text[]. `contains` blir `@>` och kan använda GIN-index.
    request = request.contains("cuisines", [filters.cuisine]);
  }

  if (filters.city) {
    request = request.eq("city_slug", filters.city);
  }

  // Högst betyg först. Restauranger utan omdömen hamnar sist i stället för
  // överst — en tom rating ska inte se ut som ett toppbetyg.
  const { data, error } = await request
    .order("rating_average", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(60);

  if (error) throw new Error(`Kunde inte hämta restauranger: ${error.message}`);

  return (data as RestaurantRow[] | null)?.map(toRestaurant) ?? [];
}

/** Alla kökstyper som finns på minst en aktiv restaurang, i bokstavsordning. */
export async function listCuisines(city?: string): Promise<string[]> {
  const supabase = await createClient();

  let request = supabase.from("restaurants").select("cuisines").eq("status", "ACTIVE");
  if (city) request = request.eq("city_slug", city);

  const { data, error } = await request;
  if (error) throw new Error(`Kunde inte hämta kökstyper: ${error.message}`);

  const rows = (data as { cuisines: string[] | null }[] | null) ?? [];
  const unique = new Set(rows.flatMap((row) => row.cuisines ?? []));

  return [...unique].sort((a, b) => a.localeCompare(b, "sv"));
}

/** Alla städer som har minst en aktiv restaurang. */
export async function listCities(): Promise<{ name: string; slug: string }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("restaurants")
    .select("city, city_slug")
    .eq("status", "ACTIVE");

  if (error) throw new Error(`Kunde inte hämta städer: ${error.message}`);

  const rows = (data as { city: string; city_slug: string }[] | null) ?? [];
  const bySlug = new Map(rows.map((row) => [row.city_slug, row.city]));

  return [...bySlug.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}
