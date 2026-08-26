"use server";

import { revalidatePath } from "next/cache";
import { cancelReservation } from "@/lib/reservations";

/**
 * Avbokning.
 *
 * Nyckeln skickas med och är det enda som bevisar att bokningen är gästens.
 * Id:t ensamt hade räckt för den som gissar — och en bokning bär namn och
 * telefonnummer.
 *
 * Kontrollen görs i `cancel_reservation()` i databasen, som kräver både id och
 * nyckel i samma WHERE-sats. Åtgärden här kan alltså inte råka glömma den.
 */
export async function cancelBooking(
  id: string,
  token: string,
): Promise<{ ok: boolean }> {
  const ok = await cancelReservation(id, token);

  if (ok) revalidatePath(`/bokning/${id}`);

  return { ok };
}
