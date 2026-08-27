import { NextResponse } from "next/server";
import { z } from "zod";
import { listCities, searchRestaurants } from "@/lib/discovery";
import { findDishes } from "@/lib/dishes";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Sökförslag medan gästen skriver.
 *
 * ── Varför en egen rutt och inte sidans egen sökning ────────────────────────
 *
 * Startsidan söker fortfarande genom sin `<form method="get">`, och den vägen
 * ska finnas kvar: den fungerar utan JavaScript, den ger en adress som går att
 * dela, och den är vad Google följer. Den här rutten är förslagen ovanpå —
 * samma frågor, men besvarade medan man skriver.
 *
 * ── Varför tre sorters träffar ──────────────────────────────────────────────
 *
 * "Sarajevo", "Željo" och "punjene paprike" är tre olika frågor med tre olika
 * svar, och gästen skiljer dem inte åt när hon skriver. Rutten svarar på alla
 * tre och låter gränssnittet visa vilken sorts träff varje rad är.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(1).max(80),
  /** Stadens slug, när gästen redan filtrerat på en. */
  city: z.string().trim().max(80).optional(),
});

export async function GET(request: Request) {
  const ip = clientIp(request.headers);
  const limit = await rateLimit(`suggest:${ip}`, RATE_LIMITS.searchSuggest);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, detail: "Vänta en stund och försök igen." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.ceil((limit.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q"),
    city: url.searchParams.get("city") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: true, restaurants: [], dishes: [], cities: [] },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { q, city } = parsed.data;

  const [restaurants, dishes, cities] = await Promise.all([
    searchRestaurants({ query: q, city }),
    findDishes({ query: q, citySlug: city, limit: 5 }),
    listCities(),
  ]);

  const needle = q.toLowerCase();

  return NextResponse.json(
    {
      ok: true,
      /*
       * Fem av varje sort.
       *
       * En lista som fyller skärmen är inte förslag, det är ett sökresultat —
       * och sökresultatet finns redan, en Enter bort.
       */
      restaurants: restaurants.slice(0, 5).map((entry) => ({
        id: entry.id,
        name: entry.name,
        slug: entry.slug,
        citySlug: entry.citySlug,
        city: entry.city,
        cuisines: entry.cuisines,
      })),
      dishes: dishes.map((dish) => ({
        slug: dish.slug,
        name: dish.name,
        citySlug: dish.citySlug,
        city: dish.city,
        restaurants: dish.restaurants,
      })),
      // Städerna filtreras här och inte i databasen: de är en handfull rader
      // som ändå läses för filterraden, och en fråga till hade kostat mer än
      // jämförelsen.
      cities: cities
        .filter((entry) => entry.name.toLowerCase().includes(needle))
        .slice(0, 3),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
