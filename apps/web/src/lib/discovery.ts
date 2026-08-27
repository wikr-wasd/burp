import { COUNTRY_INFO, type CountryCode, type CurrencyCode } from "@burp/core";
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
  country: CountryCode;
  currency: CurrencyCode;
  /**
   * Restaurangens tidszon, härledd ur landet.
   *
   * Ligger med i objektet i stället för att slås upp i varje komponent. En
   * komponent som gör uppslaget själv kommer förr eller senare att glömma det
   * och falla tillbaka på serverns tidszon — vilket på Vercel är UTC.
   */
  timeZone: string;
  /**
   * Kartnålens läge. Null när restaurangen saknar punkt.
   *
   * Genererade kolumner ur `location` (migration 0013) — skriv aldrig till
   * dem. En restaurang utan koordinater hamnar i listan men inte på kartan;
   * det är avsiktligt och bättre än att gissa mitt i staden.
   */
  latitude: number | null;
  longitude: number | null;
}

export interface DiscoveryFilters {
  /** Fritext mot namn och beskrivning. */
  query?: string;
  /** Exakt kökstyp, så som den står i `restaurants.cuisines`. */
  cuisine?: string;
  /** `city_slug`, inte stadens visningsnamn. */
  city?: string;
  /**
   * Bara de här restaurangerna.
   *
   * Används av rättsidorna, som först frågar `restaurants_with_dish()` vilka
   * som har rätten och sedan hämtar dem HÄR — så att kortet ser likadant ut
   * som på stads- och kökssidorna. Tom lista ger tomt svar och inte allt:
   * "inga träffar" är ett svar, "alla" är ett fel.
   */
  ids?: readonly string[];
}

const COLUMNS =
  "id, name, slug, city, city_slug, description, street_address, cuisines, price_tier, rating_average, rating_count, hero_image_url, opening_hours, country, currency, latitude, longitude";

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
  country: CountryCode;
  currency: CurrencyCode;
  latitude: number | null;
  longitude: number | null;
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
    country: row.country,
    currency: row.currency,
    timeZone: COUNTRY_INFO[row.country].timeZone,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

export async function searchRestaurants(
  filters: DiscoveryFilters = {},
): Promise<DiscoveryRestaurant[]> {
  const supabase = await createClient();

  let request = supabase.from("restaurants").select(COLUMNS).eq("status", "ACTIVE");

  const query = filters.query ? sanitizeQuery(filters.query) : "";
  if (query) {
    /*
     * Sökningen ser MENYN, inte bara skylten.
     *
     * Fältet lovade "restaurang, rätt eller kök" och letade i namn och
     * beskrivning. Den som skrev "punjene paprike" fick noll träffar fastän
     * två restauranger har rätten — och det är den sökningen produkten finns
     * för att kunna svara på.
     *
     * Menyuppslaget görs i databasen (`restaurant_ids_matching_dish`, migration
     * 0059), som viker bort diakriterna med samma `slugify()` som adresserna
     * använder. En egen jämförelse här hade kunnat säga något annat än
     * rättsidan gör.
     */
    const { data: byDish } = await supabase.rpc("restaurant_ids_matching_dish", {
      p_query: filters.query ?? "",
    });

    const dishIds = (byDish ?? []).map((row) => row.restaurant_id as string);

    const clauses = [`name.ilike.%${query}%`, `description.ilike.%${query}%`];
    if (dishIds.length > 0) clauses.push(`id.in.(${dishIds.join(",")})`);

    request = request.or(clauses.join(","));
  }

  if (filters.cuisine) {
    // `cuisines` är en text[]. `contains` blir `@>` och kan använda GIN-index.
    request = request.contains("cuisines", [filters.cuisine]);
  }

  if (filters.city) {
    request = request.eq("city_slug", filters.city);
  }

  if (filters.ids) {
    if (filters.ids.length === 0) return [];
    request = request.in("id", [...filters.ids]);
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

/**
 * Id på restauranger som är öppna just nu.
 *
 * Svaret kommer från databasen (`open_restaurant_ids`, migration 0025), inte
 * från en uträkning här. Öppettider är lokala och avgörs av serverns klocka —
 * `discovery-format.ts` säger det uttryckligen om sin egen `todaysHours`, som
 * bara formaterar schemat och aldrig svarar på om köket tar emot order.
 *
 * Två svar på samma fråga glider isär. Den dagen skulle listan visa "öppet"
 * och beställningen nekas, vilket är sämre än att inte visa något alls.
 */
export async function openRestaurantIds(): Promise<Set<string>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("open_restaurant_ids");

  if (error) throw new Error(`Kunde inte hämta öppna restauranger: ${error.message}`);

  const rows = (data as { restaurant_id: string }[] | null) ?? [];
  return new Set(rows.map((row) => row.restaurant_id));
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
