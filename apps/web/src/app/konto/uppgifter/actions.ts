"use server";

import { redirect } from "next/navigation";
import { eraseGuest } from "@/lib/gdpr";
import { getGuest } from "@/lib/guest";
import { createClient } from "@/lib/supabase/server";

/**
 * Radering av det egna kontot (artikel 17).
 *
 * Gästen kan bara radera SIG SJÄLV. Id:t kommer ur den verifierade sessionen
 * och tas aldrig emot som argument — en parameter hade varit en inbjudan att
 * prova någon annans.
 *
 * Bekräftelseordet kontrolleras här och inte bara i webbläsaren. En
 * knapp som skickar samma anrop utan att någon skrivit något är en klickning
 * bort i devtools, och det här är den enda åtgärden i produkten som inte går
 * att ångra.
 */

export interface EraseActionResult {
  ok: boolean;
  message?: string;
}

const CONFIRMATION = "RADERA";

export async function eraseMyAccount(confirmation: string): Promise<EraseActionResult> {
  const guest = await getGuest();

  if (!guest) {
    return { ok: false, message: "Du måste vara inloggad." };
  }

  if (confirmation.trim().toUpperCase() !== CONFIRMATION) {
    return { ok: false, message: `Skriv ${CONFIRMATION} för att bekräfta.` };
  }

  const result = await eraseGuest(guest.userId);

  if (!result.ok) {
    return { ok: false, message: result.message ?? "Kontot kunde inte raderas." };
  }

  /*
   * Sessionen städas bort efteråt.
   *
   * Kontot finns inte längre, så cookien pekar på ingenting — men den ligger
   * kvar i webbläsaren tills något tar bort den, och en gäst som ser sig själv
   * "inloggad" efter en radering har ingen anledning att tro att den gick
   * igenom. `signOut` kan misslyckas mot ett borttaget konto; det får inte
   * stoppa något, raderingen är redan gjord.
   */
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Avsiktligt tyst. Se ovan.
  }

  redirect("/konto/raderat");
}
