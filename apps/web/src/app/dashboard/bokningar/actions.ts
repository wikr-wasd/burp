"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, staffErrors } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Personalens åtgärder på en bokning.
 *
 * Skrivningen går genom den inloggades EGEN session, inte service role.
 * `reservations_update_staff` (migration 0054) är det som faktiskt avgör vad
 * som går igenom, och kocken kommer inte förbi den — den här filen är bara
 * första lagret.
 *
 * Tiden och bordet går inte att ändra. Det stoppas av triggern
 * `restrict_reservation_update`, inte av den här koden: en bokning som ändrar
 * sig efter att gästen fått sin bekräftelse är en bokning gästen inte längre
 * har. Ombokning görs som en avbokning och en ny bokning.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/** Rollerna som får röra en bokning. Köket ser dem men ändrar dem inte. */
const BOOKING_ROLES = ["owner", "manager", "staff"] as const;

/**
 * Sätter bokningens status.
 *
 * `SEATED` är den viktigaste av dem, och skälet är karensen: ett bord vars
 * bokning passerat sin tid utan att någon satt sig släpps för andra gäster
 * (migration 0054). Utan den här knappen släpps alltså bordet klockan 19:15
 * trots att sällskapet sitter vid det.
 *
 * Tidpunkterna sätts av triggern och inte här. Raden ska bära rätt tid även
 * när den skrivs på något annat sätt — samma princip som svaret på ett omdöme.
 */
export async function setReservationStatus(
  reservationId: string,
  status: "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW",
): Promise<ActionResult> {
  const staff = await requireStaff(BOOKING_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status })
    .eq("id", reservationId)
    // Restaurangen står i policyn också. Filtret här gör felet begripligt i
    // stället för att svaret tyst blir noll rader.
    .eq("restaurant_id", staff.restaurantId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/bokningar");
  return { ok: true };
}

/**
 * Restaurangen bokar in någon som ringde.
 *
 * Går genom samma väg som gästens egen bokning — `create_reservation()` — och
 * möter därför samma kontroller: öppettid, framförhållning, sällskapets
 * storlek och exclude-villkoret. En egen insert härifrån hade varit en andra
 * uppsättning regler, och den som ringer får inte gå före den som klickar.
 */
export async function bookForGuest(input: {
  tableId: string;
  at: string;
  partySize: number;
  guestName: string;
  guestPhone?: string;
  note?: string;
}): Promise<ActionResult & { reservationId?: string }> {
  const staff = await requireStaff(BOOKING_ROLES);

  const { createReservation } = await import("@/lib/reservations");

  const result = await createReservation({
    restaurantId: staff.restaurantId,
    tableId: input.tableId,
    at: input.at,
    partySize: input.partySize,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    note: input.note,
  });

  if (!result.ok) {
    return { ok: false, message: staffErrors(staff).bookingFailed };
  }

  revalidatePath("/dashboard/bokningar");
  return { ok: true, reservationId: result.reservationId };
}
