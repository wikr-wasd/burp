import "server-only";

import { createClient } from "./supabase/server";

/**
 * Omdömen (avsnitt 7).
 *
 * Alla betyg här är kopplade till en genomförd order — det enforcas av
 * `reviews_require_completed_order` i migration 0010. Det är den kopplingen
 * som gör att `AggregateRating` på restaurangsidorna får publiceras: Google
 * kräver att betyg går att härleda till riktiga köp, och en plattform som
 * publicerar annat riskerar en manuell åtgärd mot hela domänen.
 */

export interface PublicReview {
  id: string;
  ratingFood: number;
  ratingService: number | null;
  ratingDelivery: number | null;
  comment: string | null;
  createdAt: string;
  response: string | null;
  respondedAt: string | null;
  /**
   * Alltid null. Omdömen är pseudonyma, och det är ett beslut — inte en lucka.
   *
   * Fältet fanns för att visa skribentens förnamn, och uppslaget mot
   * `profiles` gjordes via RLS-klienten. Policyn `profiles_select_own` släpper
   * bara igenom din EGEN rad, så frågan returnerade alltid tomt: varje omdöme
   * visade reservtexten ändå. Utfallet var rätt, men koden såg ut att mena
   * motsatsen — och nästa person som undrade varför namnet aldrig syns hade en
   * uppenbar "fix": byt till `createAdminClient()`. Då publiceras varje
   * recensents riktiga namn på en indexerad sida, och ingen policy stoppar det.
   *
   * Uppslaget är borttaget 2026-08-22 och beslutet skrivet i stället. Ska
   * namnet visas är vägen ett eget visningsnamn gästen själv väljer att
   * publicera — inte hennes profilnamn. Se docs/TODO.md.
   *
   * Fältet står kvar i typen så att gränssnitten inte behöver ändras den dagen
   * ett sådant namn finns.
   */
  authorName: null;
}

/**
 * Publicerade omdömen för en restaurang.
 *
 * Pseudonyma. Skribenten står som "Gäst" — se `authorName`. Ett omdöme är
 * knutet till ett riktigt köp av en riktig person, men gästen har aldrig sagt
 * ja till att hennes namn publiceras på en indexerad sida.
 */
export async function getPublicReviews(restaurantId: string, limit = 20): Promise<PublicReview[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("reviews")
    .select(
      "id, rating_food, rating_service, rating_delivery, comment, created_at, response, responded_at",
    )
    .eq("restaurant_id", restaurantId)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!rows || rows.length === 0) return [];

  return rows.map((row) => ({
    id: row.id,
    ratingFood: row.rating_food,
    ratingService: row.rating_service,
    ratingDelivery: row.rating_delivery,
    comment: row.comment,
    createdAt: row.created_at,
    response: row.response,
    respondedAt: row.responded_at,
    authorName: null,
  }));
}

/* ── Restaurangens vy ────────────────────────────────────────────────────── */

export interface StaffReview extends PublicReview {
  isPublished: boolean;
  orderId: string;
}

export async function getReviewsForStaff(restaurantId: string): Promise<StaffReview[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("reviews")
    .select(
      "id, order_id, rating_food, rating_service, rating_delivery, comment, created_at, response, responded_at, is_published",
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return [];

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    ratingFood: row.rating_food,
    ratingService: row.rating_service,
    ratingDelivery: row.rating_delivery,
    comment: row.comment,
    createdAt: row.created_at,
    response: row.response,
    respondedAt: row.responded_at,
    isPublished: row.is_published,
    authorName: null,
  }));
}
