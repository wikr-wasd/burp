"use server";

import { revalidatePath } from "next/cache";
import { reviewSchema } from "@burp/core";
import { createClient } from "@/lib/supabase/server";

/**
 * Gästens egna åtgärder.
 *
 * Allt går via den inloggades session. RLS avgör: `favorites_own`,
 * `addresses_own` och `reviews_insert_own` släpper bara igenom rader som hör
 * till `auth.uid()`, så den här filen behöver aldrig jämföra användar-id själv.
 * Skulle den försöka vore det ett andra ställe att glömma bort.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });

export async function toggleFavorite(restaurantId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail("Du måste vara inloggad för att spara favoriter.");

  const { data: existing } = await supabase
    .from("favorites")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("restaurant_id", restaurantId)
    : await supabase.from("favorites").insert({ user_id: user.id, restaurant_id: restaurantId });

  if (error) return fail(error.message);

  revalidatePath("/konto/favoriter");
  return { ok: true };
}

/**
 * Lämnar ett omdöme.
 *
 * Att ordern är genomförd och tillhör gästen kontrolleras på tre ställen:
 * RLS-policyn, en trigger i databasen, och schemat här. Det låter överdrivet
 * tills man minns vad kopplingen order→omdöme är till för — den är hela skälet
 * att betygen går att lita på, och därmed hela värdet i `AggregateRating` på
 * restaurangsidorna.
 */
export async function submitReview(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail("Du måste vara inloggad.");

  const parsed = reviewSchema.safeParse({
    order_id: String(formData.get("order_id") ?? ""),
    rating_food: Number(formData.get("rating_food") ?? 0),
    rating_service: formData.get("rating_service")
      ? Number(formData.get("rating_service"))
      : undefined,
    comment: String(formData.get("comment") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return fail("Betyget kunde inte tolkas. Välj minst ett betyg på maten.");
  }

  // Restaurangen hämtas ur ordern i stället för att skickas med formuläret.
  // Skickades den in kunde en gäst lägga sitt omdöme på fel restaurang.
  const { data: order } = await supabase
    .from("orders")
    .select("id, restaurant_id, status")
    .eq("id", parsed.data.order_id)
    .maybeSingle();

  if (!order) return fail("Beställningen hittades inte.");
  if (order.status !== "COMPLETED") {
    return fail("Du kan lämna omdöme först när beställningen är klar.");
  }

  const { error } = await supabase.from("reviews").insert({
    order_id: order.id,
    restaurant_id: order.restaurant_id,
    user_id: user.id,
    rating_food: parsed.data.rating_food,
    rating_service: parsed.data.rating_service ?? null,
    comment: parsed.data.comment ?? null,
  });

  if (error) {
    // 23505 = unique_violation på reviews_order_key.
    if (error.code === "23505") return fail("Du har redan lämnat omdöme på den här beställningen.");
    return fail(error.message);
  }

  revalidatePath("/konto");
  return { ok: true, message: "Tack för ditt omdöme." };
}

export async function saveAddress(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail("Du måste vara inloggad.");

  const street = String(formData.get("street_address") ?? "").trim();
  const postalCode = String(formData.get("postal_code") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();

  if (!street || !postalCode || !city) return fail("Fyll i gata, postnummer och ort.");
  if (!/^\d{3}\s?\d{2}$/.test(postalCode)) return fail("Postnumret ska vara fem siffror.");

  const { error } = await supabase.from("addresses").insert({
    user_id: user.id,
    label: String(formData.get("label") ?? "").trim() || null,
    street_address: street,
    postal_code: postalCode.replace(/\s/g, ""),
    city,
    door_code: String(formData.get("door_code") ?? "").trim() || null,
  });

  if (error) return fail(error.message);

  revalidatePath("/konto/adresser");
  return { ok: true };
}

export async function deleteAddress(addressId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("addresses").delete().eq("id", addressId);

  if (error) return fail(error.message);

  revalidatePath("/konto/adresser");
  return { ok: true };
}
