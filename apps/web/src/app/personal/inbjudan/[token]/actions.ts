"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Löser in en inbjudan.
 *
 * Allt som avgör — att länken finns, inte gått ut, inte redan använts, och att
 * adressen stämmer — ligger i `accept_staff_invitation` (migration 0046). Den
 * här filen skickar bara vidare tokenet och tolkar felet.
 *
 * Tokenet kommer ur URL:en och är därför per definition något anroparen valt.
 * Det är hela poängen: det ÄR hemligheten, och funktionen jämför en hash av det
 * mot databasen. Ett gissat token ger samma svar som ett förbrukat.
 */

export interface AcceptResult {
  ok: boolean;
  message?: string;
}

export async function acceptInvitation(token: string): Promise<AcceptResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("accept_staff_invitation", { p_token: token });

  if (error) {
    return { ok: false, message: error.message };
  }

  // Rollen avgör vart hen hör hemma: kocken har bara köksskärmen.
  redirect("/dashboard");
}
