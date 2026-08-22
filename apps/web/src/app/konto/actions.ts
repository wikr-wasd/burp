"use server";

import { revalidatePath } from "next/cache";
import { reviewSchema } from "@burp/core";
import { dictionary, requestLocale, type Dictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * Gästens egna åtgärder.
 *
 * Allt går via den inloggades session. RLS avgör: `favorites_own`,
 * `addresses_own` och `reviews_insert_own` släpper bara igenom rader som hör
 * till `auth.uid()`, så den här filen behöver aldrig jämföra användar-id själv.
 * Skulle den försöka vore det ett andra ställe att glömma bort.
 *
 * Beskeden går på `Accept-Language`, samma källa som sidorna de visas på.
 * `/konto` har inget språk i adressen och ingen språkväljare, så det finns
 * ingen annan sanning att gå på — till skillnad från `/anslut`, där gästen kan
 * ha bytt språk själv och åtgärden därför får språket skickat till sig.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });

/** Kontoytans texter på gästens språk. */
async function accountTexts(): Promise<Dictionary["account"]> {
  return dictionary(await requestLocale()).account;
}

export async function toggleFavorite(restaurantId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail((await accountTexts()).errors.favoritesNeedAccount);

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

  // Hela ordboken här och inte bara `account`: omdömets ord — tacket och
  // "redan lämnat" — delas med bordskvittot och ligger under `receipt`.
  const all = dictionary(await requestLocale());
  const t = all.account;

  if (!user) return fail(t.errors.mustBeLoggedIn);

  const parsed = reviewSchema.safeParse({
    order_id: String(formData.get("order_id") ?? ""),
    rating_food: Number(formData.get("rating_food") ?? 0),
    rating_service: formData.get("rating_service")
      ? Number(formData.get("rating_service"))
      : undefined,
    comment: String(formData.get("comment") ?? "").trim() || undefined,
  });

  if (!parsed.success) return fail(t.errors.reviewUnreadable);

  // Restaurangen hämtas ur ordern i stället för att skickas med formuläret.
  // Skickades den in kunde en gäst lägga sitt omdöme på fel restaurang.
  const { data: order } = await supabase
    .from("orders")
    .select("id, restaurant_id, status")
    .eq("id", parsed.data.order_id)
    .maybeSingle();

  if (!order) return fail(t.errors.orderNotFound);
  if (order.status !== "COMPLETED") return fail(t.errors.reviewNotCompleted);

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
    if (error.code === "23505") return fail(all.receipt.reviewAlready);
    return fail(error.message);
  }

  revalidatePath("/konto");

  // Samma tack som bordskvittot ger. Två formuleringar för samma handling hade
  // bara varit två saker att hålla i takt.
  return { ok: true, message: all.receipt.reviewThanks };
}

export async function saveAddress(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await accountTexts();

  if (!user) return fail(t.errors.mustBeLoggedIn);

  const street = String(formData.get("street_address") ?? "").trim();
  const postalCode = String(formData.get("postal_code") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();

  if (!street || !postalCode || !city) return fail(t.errors.addressFieldsRequired);

  /*
   * Fem eller sex siffror, mellanslag borträknade.
   *
   * Kontrollen krävde tidigare exakt fem — svenskt format, skrivet när Burp
   * bara fanns i Sverige — och avvisade därmed varje serbiskt postnummer som
   * skrivs med sex. Se `COUNTRY_INFO`: BA, HR och SE har `\d{5}`, RS har
   * `\d{5,6}`.
   *
   * Att inte kalla på `normalizePostalCode()` är inte slarv: den tar ett land,
   * och gästens adress bär inget. Den hör till en gäst och inte till en
   * restaurang, och först leveransflödet — öppen fråga 2 — avgör om det finns
   * ett land att fråga efter. Tills dess är unionen av marknadens format det
   * ärligaste vi kan pröva. Regeln står i TODO-listan.
   */
  if (!/^\d{5,6}$/.test(postalCode.replace(/\s/g, ""))) {
    return fail(t.errors.postalCodeDigits);
  }

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
