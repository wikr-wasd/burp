"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, staffErrors } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Restaurangens svar på ett omdöme (avsnitt 7).
 *
 * Restaurangen kan svara — inte ändra betyget eller gästens text. Den regeln
 * ligger i triggern `restrict_review_response` (migration 0010), inte här:
 * skulle någon anropa PostgREST direkt möter de samma spärr.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function respondToReview(
  reviewId: string,
  response: string,
): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  const trimmed = response.trim();

  if (trimmed.length === 0) {
    return { ok: false, message: staffErrors(staff).replyEmpty };
  }
  if (trimmed.length > 2000) {
    return { ok: false, message: staffErrors(staff).replyTooLong };
  }

  const supabase = await createClient();

  // responded_at och responded_by sätts av triggern, inte här. Ett svar ska
  // bära rätt tidpunkt och rätt person även när det skrivs på något annat sätt.
  const { error } = await supabase
    .from("reviews")
    .update({ response: trimmed })
    .eq("id", reviewId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/omdomen");
  // Svaret syns på den publika sidan, som är cachad.
  revalidatePath("/r", "layout");
  return { ok: true };
}

/**
 * Tar bort ett publicerat svar.
 *
 * Omdömet självt rörs aldrig av restaurangen. Ett svar som blev fel i tonen ska
 * gå att ta tillbaka; gästens ord ska inte.
 */
export async function removeResponse(reviewId: string): Promise<ActionResult> {
  await requireStaff(["owner", "manager"]);

  const supabase = await createClient();
  const { error } = await supabase.from("reviews").update({ response: null }).eq("id", reviewId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/omdomen");
  revalidatePath("/r", "layout");
  return { ok: true };
}
