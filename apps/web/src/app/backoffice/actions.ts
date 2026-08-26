"use server";

import { burpInternalSurface } from "@/lib/i18n";
import {
  applicationErrorText,
  databaseErrorText,
  validateApplication,
  type ApplicationInput,
} from "@/lib/restaurant-application";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform";
import { createAdminClient } from "@/lib/supabase/admin";
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

/*
 * Svenska rakt i filen, som i resten av backoffice.
 *
 * `/backoffice` är Burps egen yta och läses av Burps eget team. En
 * plattformsadmin är inte personal någonstans och har ingen `staff.locale` —
 * se språkavsnittet i CLAUDE.md.
 */
const MFA_RESET_FAILED = "Faktorn kunde inte tas bort. Åtgärden är loggad ändå.";

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

  // Backoffice är svensk och förblir det — Burps eget team, inte
  // restaurangerna. Svenskan skickas uttryckligen in, så att valet syns i
  // koden i stället för att vara ett standardvärde ingen tagit ställning till.
  const texts = burpInternalSurface();

  const validation = validateApplication(input);
  if (!validation.ok) {
    return { ok: false, message: applicationErrorText(validation.problem, texts) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_restaurant", {
    p_input: { ...validation.value, status: input.status },
  });

  if (error) {
    return {
      ok: false,
      message: databaseErrorText(error.message, validation.value.country, texts),
    };
  }

  revalidatePath("/backoffice");
  revalidatePath("/backoffice/restauranger");
  return { ok: true };
}

/**
 * Tar bort en persons andra faktor.
 *
 * Behövs därför att Supabase inte har reservkoder. Den som byter telefon utan
 * att först registrera den nya kommer inte in, och utan den här åtgärden är
 * enda vägen tillbaka att någon redigerar `auth.mfa_factors` för hand.
 *
 * ── Varför service role ─────────────────────────────────────────────────────
 *
 * `auth.mfa_factors` ligger i Supabase eget schema och är inte läsbar för
 * `authenticated` — ingen policy i världen ger en plattformsadmin rätt att
 * röra en annan användares faktorer. Admin-API:t är den enda vägen.
 *
 * Behörigheten prövas därför FÖRE anropet, med den inloggades egen session:
 * `requirePlatformAdmin(WRITE_ROLES)` går genom `has_platform_role()`, som
 * sedan migration 0051 själv kräver aal2. En admin utan uppfylld andra faktor
 * kan alltså inte ta bort någon annans — vilket vore en ganska användbar väg
 * in för den som stulit ett adminlösenord.
 *
 * ── Varför en logg ──────────────────────────────────────────────────────────
 *
 * Åtgärden ger tillbaka full åtkomst till en restaurang. Raden i
 * `security_events` är oföränderlig (migration 0051) och skrivs FÖRE
 * borttagningen: en logg som skrivs efteråt saknar just den rad man letar
 * efter den dag anropet gick igenom men svaret aldrig kom fram.
 */
export async function resetMfaFactors(email: string, note?: string): Promise<ActionResult> {
  const admin = await requirePlatformAdmin(WRITE_ROLES);

  const audit = createAdminClient();

  /*
   * Adressen slås upp, inte ett id.
   *
   * Den som ringer supporten säger sin e-postadress, inte sin UUID. Uppslaget
   * går mot `profiles` och inte mot admin-API:ts `listUsers()`, som saknar
   * filter på adress och alltså hade betytt att bläddra genom varenda konto
   * för att hitta ett.
   *
   * service-role: en enskild adress — frågan är bunden till just den raden,
   * och `profiles` är stängd för alla utom personen själv (regel 5).
   */
  const { data: person, error: lookupError } = await audit
    .from("profiles")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (lookupError) return fail(MFA_RESET_FAILED);
  if (!person) return fail("Ingen användare med den adressen.");

  const userId = person.id;

  const { error: logError } = await audit.from("security_events").insert({
    user_id: userId,
    actor_id: admin.userId,
    kind: "MFA_FACTOR_RESET",
    note: note?.trim() || null,
  });

  if (logError) return fail(MFA_RESET_FAILED);

  // service-role: en enskild användares faktorer — auth-schemat har ingen RLS
  // att smalna av mot, och raden är redan bunden till user_id här.
  const { data: factors, error: listError } = await audit.auth.admin.mfa.listFactors({ userId });

  if (listError) return fail(MFA_RESET_FAILED);

  for (const factor of factors?.factors ?? []) {
    const { error: deleteError } = await audit.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });

    if (deleteError) return fail(MFA_RESET_FAILED);
  }

  revalidatePath("/backoffice");
  return { ok: true };
}
