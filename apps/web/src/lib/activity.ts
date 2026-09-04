import "server-only";

import { createClient } from "./supabase/server";

/**
 * Pulsen — vad som faktiskt händer på plattformen.
 *
 * Önskemålet var att en gäst ska känna att Burp är i gång och att många är
 * aktiva. Det finns två sätt att göra det, och bara det ena går att stå för:
 * hitta på siffror, eller visa de riktiga. Det här är de riktiga.
 *
 * Uppslagen går genom `platform_pulse()` och `recent_orders_pulse()`
 * (migration 0073) och inte genom egna frågor. `orders` är inte publikt
 * läsbart och ska aldrig bli det; funktionerna svarar på HUR MÅNGA, aldrig
 * VILKA, och behöver därför ingen service role-nyckel.
 *
 * ── Trösklarna ─────────────────────────────────────────────────────────────
 *
 * Ett tal visas bara när det bär sig självt. "1 beställning den här veckan"
 * säger tvärtom att här är tomt, och "2 restauranger" ser ut som en katalog
 * någon glömt. Under tröskeln utelämnas talet — det ersätts aldrig av ett
 * påhittat. En marknadsplats som påstår tusen beställningar innan den har dem
 * är genomskådad på en sekund, och den kostnaden är större än att vara liten.
 */

export interface PlatformPulse {
  restaurants: number;
  cities: number;
  ordersWeek: number;
  reviews: number;
  /** Snittbetyg på maten, en decimal. Null innan något omdöme finns. */
  rating: number | null;
}

export interface PulseEntry {
  dish: string;
  city: string;
  /** Minuter sedan beställningen lades. Alltid inom det senaste dygnet. */
  minutesAgo: number;
}

/** Under så här många är talet inte värt att visa. Se modulens kommentar. */
export const PULSE_THRESHOLDS = {
  restaurants: 3,
  cities: 2,
  ordersWeek: 25,
  reviews: 5,
} as const;

/** Så många rader i "just nu" — färre än så är ingen ström. */
export const MIN_ACTIVITY_ROWS = 3;

export async function platformPulse(): Promise<PlatformPulse | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_pulse");

  // Ett fel här får aldrig fälla startsidan. Pulsen är ett tillägg; menyn,
  // kartan och listan är sidan.
  if (error || !data) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    restaurants: Number(row.restaurants ?? 0),
    cities: Number(row.cities ?? 0),
    ordersWeek: Number(row.orders_week ?? 0),
    reviews: Number(row.reviews ?? 0),
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
  };
}

export async function recentActivity(limit = 6): Promise<PulseEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recent_orders_pulse", { p_limit: limit });

  if (error || !Array.isArray(data)) return [];

  const now = Date.now();

  return data
    .map((row) => ({
      dish: String(row.dish ?? ""),
      city: String(row.city ?? ""),
      // Golvet på noll: en klocka som går någon sekund fel i databasen ska
      // inte ge "för -1 minut sedan".
      minutesAgo: Math.max(0, Math.round((now - new Date(String(row.at)).getTime()) / 60000)),
    }))
    .filter((entry) => entry.dish !== "" && entry.city !== "");
}

/**
 * Veckans mest beställda restauranger.
 *
 * Bara id:n — hur många order en enskild restaurang har lämnar aldrig
 * databasen. Det talet är restaurangens affär, och en konkurrent på andra
 * sidan gatan hade kunnat räkna om det till omsättning.
 *
 * Högst tio kan bära märkningen samtidigt. En "populär"-etikett som alla har
 * är ingen etikett, och då hade den bara varit dekoration på ett kort som
 * redan bär betyg, kök, pris och öppettid.
 */
export async function popularRestaurantIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("popular_restaurant_ids");

  if (error || !Array.isArray(data)) return new Set();

  return new Set(
    data
      .map((row) => (typeof row === "string" ? row : String((row as { id?: string }).id ?? "")))
      .filter(Boolean),
  );
}

/**
 * Rätterna gästerna väljer oftast hos en restaurang.
 *
 * Namn, aldrig antal — av samma skäl som ovan. Tom lista när stället inte
 * haft tillräckligt många order för att listan ska vara ett mönster och inte
 * tre slumpar; avsnittet ritas då inte alls.
 */
export async function favouriteDishes(restaurantId: string, limit = 3): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restaurant_favourite_dishes", {
    p_restaurant_id: restaurantId,
    p_limit: limit,
  });

  if (error || !Array.isArray(data)) return [];

  return data.map((row) => String(row.name ?? "")).filter(Boolean);
}
