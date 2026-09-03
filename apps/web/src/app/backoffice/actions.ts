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
 * Sätter avtalad avgift för en restaurang, och skriver varför.
 *
 * Tomt fält betyder "Burps standard gäller" och lagras som null, inte som 340.
 * Skillnaden spelar roll: en restaurang med null följer med när standarden
 * ändras, en med 340 gör det inte.
 *
 * ── Varför ett skäl krävs ───────────────────────────────────────────────────
 *
 * Avgiften ska bara ändras vid UNDANTAGSFALL. Fram till 2026-09-01 skrevs
 * fältet så fort det tappade fokus — ingen bekräftelse, ingen anteckning,
 * ingen historik. Det som ändrades var villkoren i ett avtal om pengar, och
 * efteråt gick det inte att svara på vem som ändrade, när, från vad eller
 * varför.
 *
 * En regel som bara finns i någons huvud är ingen regel. Kravet på ett skäl
 * gör den till något systemet håller: `fee_changes` (migration 0062) tar inte
 * emot en rad utan minst tre tecken, och tabellen är oföränderlig som
 * `order_events`.
 *
 * ── Ordningen: logga FÖRE uppdateringen ─────────────────────────────────────
 *
 * Loggraden skrivs först. Faller den — för kort skäl, saknad behörighet,
 * ingen faktisk ändring — rörs avgiften inte. Tvärtom hade gett en ändrad
 * avgift utan spår, vilket är precis det tillstånd som ska bort.
 *
 * De två skrivningarna är inte en transaktion, och det är en medveten
 * avvägning: PostgREST har ingen. Faller den andra ligger en loggrad kvar som
 * påstår en ändring som inte skedde — synligt och rättningsbart. Motsatt
 * ordning hade gett det osynliga felet.
 */
export async function setRestaurantFee(
  restaurantId: string,
  bpsInput: string,
  reason: string,
): Promise<ActionResult> {
  const admin = await requirePlatformAdmin(WRITE_ROLES);

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

  const note = reason.trim();
  if (note.length < 3) {
    return fail("Skriv varför avgiften ändras. Anteckningen sparas med ändringen.");
  }

  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("restaurants")
    .select("fee_override_bps")
    .eq("id", restaurantId)
    .maybeSingle();

  if (readError) return fail(readError.message);
  if (!current) return fail("Restaurangen finns inte.");

  const previous = current.fee_override_bps;

  if (previous === feeOverride) {
    return fail("Avgiften är redan den du skrev in.");
  }

  const { error: logError } = await supabase.from("fee_changes").insert({
    restaurant_id: restaurantId,
    changed_by: admin.userId,
    // Adressen skrivs av på raden: `auth.users` är inte läsbar genom RLS, och
    // loggen ska bära vem det VAR även om personen byter adress eller slutar.
    changed_by_email: admin.email ?? "okänd",
    previous_bps: previous,
    new_bps: feeOverride,
    reason: note,
  });

  if (logError) return fail(logError.message);

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

/**
 * Godkänner eller avvisar ett dokument (migration 0064).
 *
 * Egen åtgärd och inte en gren i `moderateMedia`: dokumenten ligger i en egen
 * tabell, av samma skäl som de inte fick plats i `media` — `kind`, `purpose`
 * och `is_primary` betyder ingenting för en PDF.
 *
 * Går genom plattformsadminens egen session, precis som bildmodereringen.
 * `restaurant_documents_status_guard` släpper bara igenom den som verkligen är
 * plattformsadmin.
 */
export async function moderateDocument(
  documentId: string,
  approve: boolean,
  reason?: string,
): Promise<ActionResult> {
  const admin = await requirePlatformAdmin(WRITE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurant_documents")
    .update({
      status: approve ? "APPROVED" : "REJECTED",
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.userId,
      rejection_reason: approve ? null : (reason?.trim() || "Uppfyller inte riktlinjerna"),
    })
    .eq("id", documentId);

  return error ? fail(error.message) : done();
}

/**
 * Godkänner eller avvisar en gästbild (migration 0068).
 *
 * Går genom `moderate_avatar()` och inte genom en tabelluppdatering: backoffice
 * kan inte läsa eller skriva andra gästers profiler, och det är avsiktligt —
 * `profiles_select_own` släpper bara igenom den egna raden. En policy för
 * plattformsadmin hade gett Burps personal e-post, telefon och födelsedatum för
 * varenda gäst, för att kunna titta på en bild.
 *
 * Funktionen prövar rollen själv, eftersom den är security definer.
 */
export async function moderateAvatar(userId: string, approve: boolean): Promise<ActionResult> {
  await requirePlatformAdmin(WRITE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_avatar", {
    p_user_id: userId,
    p_approve: approve,
  });

  return error ? fail(error.message) : done();
}

/* ── Burps utvalda per stad ──────────────────────────────────────────────── */

/**
 * Lägger en restaurang i stadens urval (migration 0070).
 *
 * ⚠️ Det här är Burps REDAKTIONELLA val och ingen popularitetslista. Listan
 * visas under sin egen rubrik, skild från "andra sparade också" — den senare
 * räknas ur riktiga favoriter, och att blanda dem hade gjort ett påstående om
 * vad gäster gillar till en annons.
 *
 * Ska en restaurang kunna KÖPA sin plats är det ett affärsbeslut och inte en
 * funktion: det hör till docs/BUSINESS.md, kräver ett pris, och kräver att
 * listan märks som betald.
 */
export async function addFeatured(
  citySlug: string,
  restaurantId: string,
  note?: string,
): Promise<ActionResult> {
  const admin = await requirePlatformAdmin(WRITE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.from("featured_restaurants").insert({
    city_slug: citySlug,
    restaurant_id: restaurantId,
    note: note?.trim() || null,
    created_by: admin.userId,
    // Sist i listan. Ordningen ändras genom att ta bort och lägga till igen —
    // en dra-och-släpp för en lista på två rader är mer kod än nytta.
    sort_order: 99,
  });

  if (error) {
    return fail(
      error.code === "23505" ? "Restaurangen är redan utvald i den staden." : error.message,
    );
  }

  return done();
}

export async function removeFeatured(id: string): Promise<ActionResult> {
  await requirePlatformAdmin(WRITE_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.from("featured_restaurants").delete().eq("id", id);

  return error ? fail(error.message) : done();
}
