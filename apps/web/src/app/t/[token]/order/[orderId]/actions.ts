"use server";

import { revalidatePath } from "next/cache";
import { reviewSchema } from "@burp/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentTableSessionId, lookupTable } from "@/lib/table-session";

/**
 * Omdöme från bordet.
 *
 * Gästen är anonym och har ingen `auth.uid()` att skriva en policy mot.
 * Åtkomsten bevisas med bordssessionens cookie i stället, och servern skriver
 * sedan med service role — samma modell som `POST /api/orders`, och ett av de
 * fall regel 5 pekar ut som legitima.
 *
 * Tre kontroller, alla nödvändiga, och de är samma tre som kvittosidan gör:
 *
 *   1. Bordstokenet är giltigt.
 *   2. Ordern hör till den bordssession cookien pekar på. Utan det räcker det
 *      att gissa ett order-id för att sätta betyg på en främmande måltid.
 *   3. Ordern hör till den restaurang tokenet pekar på.
 *
 * Att ordern är slutförd kontrolleras inte här utan av triggern från 0010, som
 * gäller även för service role. Spärren mot dubbla omdömen är det unika indexet
 * `reviews_order_key`.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function submitTableReview(
  token: string,
  orderId: string,
  input: { ratingFood: number; ratingService: number | null; comment: string },
): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse({
    order_id: orderId,
    rating_food: input.ratingFood,
    ...(input.ratingService ? { rating_service: input.ratingService } : {}),
    ...(input.comment.trim() ? { comment: input.comment.trim() } : {}),
  });

  if (!parsed.success) {
    return { ok: false, message: "REVIEW_INVALID" };
  }

  const lookup = await lookupTable(token);
  if (!lookup.ok) return { ok: false, message: "REVIEW_FAILED" };

  const sessionId = await currentTableSessionId();
  if (!sessionId) return { ok: false, message: "REVIEW_FAILED" };

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, restaurant_id, table_session_id")
    .eq("id", orderId)
    .maybeSingle();

  if (
    !order ||
    order.table_session_id !== sessionId ||
    order.restaurant_id !== lookup.table.restaurantId
  ) {
    return { ok: false, message: "REVIEW_FAILED" };
  }

  const { error } = await supabase.from("reviews").insert({
    order_id: order.id,
    restaurant_id: order.restaurant_id,
    // Ingen användare. Raden bär i stället sessionen som bevisade åtkomsten.
    table_session_id: sessionId,
    rating_food: parsed.data.rating_food,
    rating_service: parsed.data.rating_service ?? null,
    comment: parsed.data.comment ?? null,
  });

  if (error) {
    // 23505 = det unika indexet per order. Gästen har redan svarat, vilket är
    // ett besked och inte ett fel.
    if (error.code === "23505") return { ok: false, message: "REVIEW_ALREADY" };
    return { ok: false, message: "REVIEW_FAILED" };
  }

  revalidatePath(`/t/${token}/order/${orderId}`);
  return { ok: true };
}
