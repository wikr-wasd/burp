"use server";

import { COUNTRY_INFO } from "@burp/core";
import {
  readableDatabaseError,
  validateApplication,
  type ApplicationInput,
} from "@/lib/restaurant-application";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";

/**
 * Backoffice-åtgärder.
 *
 * Support får läsa men inte ändra — därför kräver varje åtgärd här `admin`
 * eller `owner`. Skrivningarna går via den inloggades egen session, så
 * RLS-policyn i migration 0015 är det som faktiskt avgör, inte den här filen.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const WRITE_ROLES = ["admin", "owner"] as const;

function done(): ActionResult {
  revalidatePath("/backoffice");
  revalidatePath("/backoffice/restauranger");
  return { ok: true };
}

const fail = (message: string): ActionResult => ({ ok: false, message });

/**
 * Godkänner eller stänger av en restaurang.
 *
 * PENDING → ACTIVE är onboardingens sista steg. SUSPENDED är Burps åtgärd vid
 * missbruk och är avsiktligt skild från PAUSED, som restaurangen sätter själv
 * när den stänger för semestern — den som läser statusen ska kunna se vem som
 * fattade beslutet.
 */
export async function setRestaurantStatus(
  restaurantId: string,
  status: "PENDING" | "ACTIVE" | "PAUSED" | "SUSPENDED",
): Promise<ActionResult> {
  await requirePlatformAdmin(WRITE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurants")
    .update({ status })
    .eq("id", restaurantId);

  return error ? fail(error.message) : done();
}

/**
 * Sätter avtalad avgift för en restaurang.
 *
 * Tomt fält betyder "Burps standard gäller" och lagras som null, inte som 340.
 * Skillnaden spelar roll: en restaurang med null följer med när standarden
 * ändras, en med 340 gör det inte.
 */
export async function setRestaurantFee(
  restaurantId: string,
  bpsInput: string,
): Promise<ActionResult> {
  await requirePlatformAdmin(WRITE_ROLES);

  const trimmed = bpsInput.trim();
  let feeOverride: number | null = null;

  if (trimmed !== "") {
    // Inmatningen är i procent, lagringen i baspunkter. "3,4" → 340.
    const percent = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return fail(`"${bpsInput}" är inte en giltig procentsats.`);
    }
    feeOverride = Math.round(percent * 100);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurants")
    .update({ fee_override_bps: feeOverride })
    .eq("id", restaurantId);

  return error ? fail(error.message) : done();
}

/** Godkänner eller avvisar uppladdad media (avsnitt 8.3). */
export async function moderateMedia(
  mediaId: string,
  approve: boolean,
  reason?: string,
): Promise<ActionResult> {
  const admin = await requirePlatformAdmin(WRITE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("media")
    .update({
      status: approve ? "APPROVED" : "REJECTED",
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.userId,
      rejection_reason: approve ? null : (reason?.trim() || "Uppfyller inte riktlinjerna"),
    })
    .eq("id", mediaId);

  return error ? fail(error.message) : done();
}

/**
 * Döljer en recension.
 *
 * Raderas inte. Betyget är kopplat till en genomförd order, och den kopplingen
 * är hela grunden för att recensionerna går att lita på — försvinner raden går
 * det inte längre att visa att bedömningen byggde på riktiga köp.
 */
export async function setReviewPublished(
  reviewId: string,
  published: boolean,
): Promise<ActionResult> {
  await requirePlatformAdmin(WRITE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ is_published: published })
    .eq("id", reviewId);

  return error ? fail(error.message) : done();
}

/* ── Lägga upp en restaurang ─────────────────────────────────────────────── */

/**
 * Burp lägger upp en restaurang direkt.
 *
 * Skild från `applyForRestaurant`, som är restaurangens egen väg in och alltid
 * skapar PENDING med sökanden som ägare. Den här behövs vid uppsökande
 * försäljning och på mässor: Burp fyller i åt någon som ännu inte har konto,
 * och kan sätta ACTIVE direkt när avtalet redan är påskrivet.
 *
 * Behörigheten kontrolleras två gånger med flit — här och i
 * `admin_create_restaurant`. Funktionen i databasen är SECURITY DEFINER och
 * kör med ägarens rättigheter; en kontroll som bara finns i appen är ingen
 * kontroll alls för den som når API:t direkt.
 */
export async function createRestaurantAsAdmin(
  input: ApplicationInput & { status: "PENDING" | "ACTIVE" },
): Promise<ActionResult> {
  await requirePlatformAdmin(["admin", "owner"]);

  const validation = validateApplication(input);
  if (!validation.ok) return { ok: false, message: validation.message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_restaurant", {
    p_input: { ...validation.value, status: input.status },
  });

  if (error) {
    return {
      ok: false,
      message: readableDatabaseError(
        error.message,
        COUNTRY_INFO[validation.value.country].orgNumberLabel,
      ),
    };
  }

  revalidatePath("/backoffice");
  revalidatePath("/backoffice/restauranger");
  return { ok: true };
}
