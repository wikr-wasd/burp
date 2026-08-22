"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform";
import { SETTLEMENT_NEXT, type SettlementStatus } from "@/lib/settlement-period";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TableUpdate } from "@/lib/supabase/types";

/**
 * Avräkningens åtgärder (migration 0039).
 *
 * `settlements` har varken INSERT-, UPDATE- eller DELETE-policy. Det är inte en
 * lucka: raden är Burps faktura, och en RLS-policy hade behövt släppa in en
 * inloggad användare — och den enda inloggade som har med raden att göra är den
 * som sitter här. Skrivningen går därför med service role, efter att
 * `requirePlatformAdmin` kontrollerat rollen.
 *
 * Support får läsa men inte ändra, som överallt annars i backoffice.
 *
 * Spärrarna ligger ändå i databasen och inte här: statusmaskinen, frysningen av
 * beloppen och överlappsspärren är triggers och constraints. Den här filen ger
 * dem begripliga svar, den ersätter dem inte.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const WRITE_ROLES = ["admin", "owner"] as const;

function done(): ActionResult {
  revalidatePath("/backoffice/avrakning");
  return { ok: true };
}

const fail = (message: string): ActionResult => ({ ok: false, message });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Stänger en period för en restaurang och skriver ett utkast till avräkning. */
export async function closeSettlementPeriod(
  restaurantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ActionResult> {
  await requirePlatformAdmin(WRITE_ROLES);

  if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) {
    return fail("Perioden måste anges som två datum.");
  }

  const { error } = await createAdminClient().rpc("close_settlement_period", {
    p_restaurant_id: restaurantId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });

  if (error) return fail(error.message);
  return done();
}

/**
 * Stänger flera restaurangers period i samma tryck.
 *
 * En månad stängs för alla på en gång; att klicka sig igenom hundra rader är
 * inte ett arbetssätt. Varje restaurang körs för sig och ett fel på en stoppar
 * inte de andra — annars hade en enda restaurang med två valutor i perioden
 * blockerat hela månadens fakturering.
 */
export async function closeSettlementPeriods(
  restaurantIds: readonly string[],
  periodStart: string,
  periodEnd: string,
): Promise<ActionResult> {
  await requirePlatformAdmin(WRITE_ROLES);

  if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) {
    return fail("Perioden måste anges som två datum.");
  }

  const admin = createAdminClient();
  const failures: string[] = [];

  for (const restaurantId of restaurantIds) {
    const { error } = await admin.rpc("close_settlement_period", {
      p_restaurant_id: restaurantId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });

    if (error) failures.push(error.message);
  }

  if (failures.length > 0) {
    // Perioden är stängd för resten. Meddelandet säger hur många som inte gick
    // igenom, så att den som stänger vet att listan måste gås igenom igen.
    revalidatePath("/backoffice/avrakning");
    return fail(
      `${failures.length} av ${restaurantIds.length} kunde inte stängas: ${failures[0]}`,
    );
  }

  return done();
}

/**
 * Flyttar en avräkning framåt i sin livscykel.
 *
 * Fakturanumret kommer ur Burps bokföring och skrivs in här; det genereras inte
 * av produkten. Ett nummer som Burp inte känner igen är värdelöst för den som
 * ska stämma av mot verifikatet.
 */
export async function setSettlementStatus(
  settlementId: string,
  from: SettlementStatus,
  to: SettlementStatus,
  invoiceNumber?: string,
): Promise<ActionResult> {
  await requirePlatformAdmin(WRITE_ROLES);

  if (!SETTLEMENT_NEXT[from].includes(to)) {
    return fail(`En avräkning kan inte gå från ${from} till ${to}.`);
  }

  const patch: TableUpdate<"settlements"> = { status: to };
  if (to === "INVOICED") {
    const trimmed = invoiceNumber?.trim() ?? "";
    if (trimmed === "") return fail("Skriv fakturanumret ur bokföringen.");
    patch.invoice_number = trimmed;
  }

  const admin = createAdminClient();

  // Villkoret på status är inte kosmetik. Två flikar öppna samtidigt, och den
  // andra hade annars kunnat flytta en avräkning som redan flyttats — utan att
  // någon märkte att övergången utgick från ett annat läge än det på skärmen.
  const { data, error } = await admin
    .from("settlements")
    .update(patch)
    .eq("id", settlementId)
    .eq("status", from)
    .select("id");

  if (error) return fail(error.message);
  if (!data || data.length === 0) {
    return fail("Avräkningen har ändrats av någon annan. Ladda om sidan.");
  }

  return done();
}

/**
 * Kastar ett utkast.
 *
 * Bara utkast. En skickad avräkning makuleras (VOID) och står kvar — den ligger
 * i någons inkorg, och en faktura som försvinner ur systemet men inte ur
 * verkligheten är värre än en makulerad.
 */
export async function discardSettlementDraft(settlementId: string): Promise<ActionResult> {
  await requirePlatformAdmin(WRITE_ROLES);

  const { error } = await createAdminClient()
    .from("settlements")
    .delete()
    .eq("id", settlementId)
    .eq("status", "DRAFT");

  if (error) return fail(error.message);
  return done();
}
