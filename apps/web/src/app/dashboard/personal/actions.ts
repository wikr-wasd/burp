"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { type StaffRole } from "@burp/core";
import { requireStaff } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { sendEmail } from "@/lib/notify/email";
import { invitationEmail } from "@/lib/notify/messages";
import { newInvitationToken } from "@/lib/staff-admin";
import { createClient } from "@/lib/supabase/server";
import { untranslatedSurface } from "@/lib/i18n";

/**
 * Personalens åtgärder.
 *
 * Hierarkin — vem som får bjuda in vem — ligger i databasen (migration 0046)
 * och kontrolleras av funktionerna där. Den här filen upprepar den inte.
 * `requireStaff` finns för att ge ett begripligt svar i stället för ett tomt
 * databasfel, inte som skydd.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Länken att skicka vidare. Bara vid en lyckad inbjudan. */
  link?: string;
}

const MANAGEMENT = ["owner", "manager"] as const;

const fail = (message: string): ActionResult => ({ ok: false, message });

export async function inviteStaff(email: string, role: StaffRole): Promise<ActionResult> {
  const staff = await requireStaff(MANAGEMENT);

  const address = email.trim().toLowerCase();
  if (!address.includes("@")) {
    return fail("Skriv en e-postadress.");
  }

  const token = newInvitationToken();
  const supabase = await createClient();

  const { error } = await supabase.rpc("invite_staff", {
    p_restaurant_id: staff.restaurantId,
    p_email: address,
    p_role: role,
    p_token: token,
  });

  if (error) {
    // 23505 = det unika indexet på en öppen inbjudan per adress.
    if (error.code === "23505") {
      return fail("Det finns redan en öppen inbjudan till den adressen.");
    }
    return fail(error.message);
  }

  const link = new URL(
    `/personal/inbjudan/${token}`,
    publicEnv.NEXT_PUBLIC_SITE_URL,
  ).toString();

  /*
   * Brevet skickas EFTER svaret, som ordernotiserna.
   *
   * Den som bjöd in ska inte vänta på ett API-anrop, och inbjudan får aldrig
   * falla för att brevet inte kunde skickas. Utan `RESEND_API_KEY` skrivs det i
   * loggen — och länken visas ändå i gränssnittet, så att en restaurang kan
   * anställa någon innan avsändardomänen är verifierad.
   */
  after(async () => {
    await sendEmail(
      [address],
      invitationEmail({
        restaurantName: staff.restaurantName,
        roleLabel: untranslatedSurface().staff.role[role],
        link,
      }),
    );
  });

  revalidatePath("/dashboard/personal");
  return { ok: true, link };
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  await requireStaff(MANAGEMENT);

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_staff_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) return fail(error.message);

  revalidatePath("/dashboard/personal");
  return { ok: true };
}

export async function changeStaffRole(userId: string, role: StaffRole): Promise<ActionResult> {
  const staff = await requireStaff(MANAGEMENT);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_role", {
    p_restaurant_id: staff.restaurantId,
    p_user_id: userId,
    p_role: role,
  });

  if (error) return fail(error.message);

  revalidatePath("/dashboard/personal");
  return { ok: true };
}

/**
 * Avslutar eller återupptar en anställning.
 *
 * Raden raderas aldrig. Den är det som kopplar en kvitterad nota till en
 * människa — försvinner den tappar händelseloggen sitt svar på "vem".
 */
export async function setStaffActive(userId: string, active: boolean): Promise<ActionResult> {
  const staff = await requireStaff(MANAGEMENT);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_active", {
    p_restaurant_id: staff.restaurantId,
    p_user_id: userId,
    p_active: active,
  });

  if (error) return fail(error.message);

  revalidatePath("/dashboard/personal");
  return { ok: true };
}
