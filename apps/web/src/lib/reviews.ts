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
  /** Förnamn, eller null för den som inte fyllt i något namn. */
  authorName: string | null;
}

/**
 * Publicerade omdömen för en restaurang.
 *
 * Visar förnamn, inte hela namnet. Ett omdöme är knutet till ett riktigt köp
 * av en riktig person, och efternamnet tillför ingenting för läsaren men gör
 * skribenten sökbar.
 */
export async function getPublicReviews(restaurantId: string, limit = 20): Promise<PublicReview[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("reviews")
    .select(
      "id, rating_food, rating_service, rating_delivery, comment, created_at, response, responded_at, user_id",
    )
    .eq("restaurant_id", restaurantId)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!rows || rows.length === 0) return [];

  const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => !!id))];

  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };

  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return rows.map((row) => ({
    id: row.id,
    ratingFood: row.rating_food,
    ratingService: row.rating_service,
    ratingDelivery: row.rating_delivery,
    comment: row.comment,
    createdAt: row.created_at,
    response: row.response,
    respondedAt: row.responded_at,
    authorName: row.user_id ? firstName(names.get(row.user_id) ?? null) : null,
  }));
}

function firstName(fullName: string | null): string | null {
  if (!fullName) return null;
  return fullName.trim().split(/\s+/)[0] ?? null;
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
      "id, order_id, rating_food, rating_service, rating_delivery, comment, created_at, response, responded_at, is_published, user_id",
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) return [];

  const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => !!id))];

  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };

  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

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
    authorName: row.user_id ? firstName(names.get(row.user_id) ?? null) : null,
  }));
}
