import "server-only";

import { distanceMeters } from "@burp/core";
import { resolveMediaUrl } from "./media-url";
import { createClient } from "./supabase/server";

/**
 * Gästens egna matrundor.
 *
 * ── Varför den inloggades egen session och inte service role ────────────────
 *
 * En rutt hör till en människa med ett konto. `routes_own` (migration 0056) är
 * hela skyddet, och det fungerar bara om frågan ställs som den inloggade. Det
 * är skillnaden mot QR-flödet och bokningen, där gästen är anonym och servern
 * måste agera för hennes räkning.
 *
 * ── Varför avstånden räknas här ─────────────────────────────────────────────
 *
 * `distanceMeters()` i @burp/core används redan av upptäcktsvyn. Att räkna
 * sträckan mellan stoppen är samma uträkning på samma data, och en andra
 * formel i SQL hade gett två svar på "hur långt är det".
 */

export interface RouteStop {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  citySlug: string;
  city: string;
  cuisines: string[];
  heroImageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  position: number;
  note: string | null;
  /** Meter till FÖREGÅENDE stopp. Null för det första och när punkt saknas. */
  metersFromPrevious: number | null;
}

export interface RouteSummary {
  id: string;
  name: string;
  note: string | null;
  updatedAt: string;
  stopCount: number;
  /** Städerna rutten rör vid, i ordning och utan dubbletter. */
  cities: string[];
}

export interface RouteDetail extends RouteSummary {
  stops: RouteStop[];
  /** Summan av sträckorna mellan stoppen. Null när någon punkt saknas. */
  totalMeters: number | null;
}

const STOP_COLUMNS =
  "id, restaurant_id, position, note, restaurants!inner (name, slug, city, city_slug, cuisines, hero_image_url, latitude, longitude)";

/** Gästens rutter, senast ändrade först. */
export async function listRoutes(): Promise<RouteSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("routes")
    .select("id, name, note, updated_at, route_stops (id, restaurants!inner (city))")
    .order("updated_at", { ascending: false });

  return (data ?? []).map((row) => {
    const stops = (row.route_stops ?? []) as unknown as { restaurants: { city: string } }[];

    return {
      id: row.id,
      name: row.name,
      note: row.note,
      updatedAt: row.updated_at,
      stopCount: stops.length,
      cities: [...new Set(stops.map((stop) => stop.restaurants.city))],
    };
  });
}

/** En rutt med sina stopp i ordning, eller null när den inte är gästens. */
export async function getRoute(routeId: string): Promise<RouteDetail | null> {
  const supabase = await createClient();

  const { data: route } = await supabase
    .from("routes")
    .select("id, name, note, updated_at")
    .eq("id", routeId)
    .maybeSingle();

  if (!route) return null;

  const { data: rows } = await supabase
    .from("route_stops")
    .select(STOP_COLUMNS)
    .eq("route_id", routeId)
    .order("position", { ascending: true });

  const stops: RouteStop[] = [];
  let previous: { latitude: number | null; longitude: number | null } | null = null;
  let totalMeters: number | null = 0;

  for (const row of rows ?? []) {
    const restaurant = row.restaurants as unknown as {
      name: string;
      slug: string;
      city: string;
      city_slug: string;
      cuisines: string[] | null;
      hero_image_url: string | null;
      latitude: number | null;
      longitude: number | null;
    };

    /*
     * Sträckan är fågelvägen och inte gångvägen.
     *
     * Att lova en gångväg kräver en ruttberäkningstjänst, ett avtal och en
     * kostnad per anrop. Fågelvägen mellan två ställen i Baščaršija är ändå
     * rätt storleksordning, och etiketten i gränssnittet säger vad den är.
     */
    let metersFromPrevious: number | null = null;

    if (
      previous &&
      previous.latitude !== null &&
      previous.longitude !== null &&
      restaurant.latitude !== null &&
      restaurant.longitude !== null
    ) {
      metersFromPrevious = Math.round(
        distanceMeters(
          { latitude: previous.latitude, longitude: previous.longitude },
          { latitude: restaurant.latitude, longitude: restaurant.longitude },
        ),
      );
    }

    // Saknas en punkt går summan inte att lita på, och då ska den inte visas.
    if (previous && metersFromPrevious === null) totalMeters = null;
    else if (totalMeters !== null && metersFromPrevious !== null) {
      totalMeters += metersFromPrevious;
    }

    stops.push({
      id: row.id,
      restaurantId: row.restaurant_id,
      name: restaurant.name,
      slug: restaurant.slug,
      citySlug: restaurant.city_slug,
      city: restaurant.city,
      cuisines: restaurant.cuisines ?? [],
      heroImageUrl: resolveMediaUrl(restaurant.hero_image_url),
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      position: row.position,
      note: row.note,
      metersFromPrevious,
    });

    previous = { latitude: restaurant.latitude, longitude: restaurant.longitude };
  }

  return {
    id: route.id,
    name: route.name,
    note: route.note,
    updatedAt: route.updated_at,
    stopCount: stops.length,
    cities: [...new Set(stops.map((stop) => stop.city))],
    stops,
    totalMeters: stops.length > 1 ? totalMeters : null,
  };
}

/**
 * Restaurangen som ska läggas till i en rutt.
 *
 * Bara ACTIVE. En restaurang som pausat eller stängts av ska inte gå att
 * planera en kväll runt, och den som redan har den i en rutt ser den kvar —
 * stoppet är sparat, det är TILLÄGGET som stoppas här.
 */
export async function restaurantForRoute(
  restaurantId: string,
): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("id", restaurantId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  return data ? { id: data.id, name: data.name } : null;
}
