"use server";

import { getStaff } from "@/lib/auth";
import { landingFor } from "@/lib/landing";
import { getPlatformAdmin } from "@/lib/platform";

/**
 * Vart formuläret ska skicka den som just loggat in.
 *
 * Egen serveråtgärd därför att svaret kräver databasen: rollen ligger i
 * `staff` eller `platform_admins`, och en klientkomponent kan inte läsa någon
 * av dem utan att göra två egna frågor med sin egen session.
 *
 * Själva regeln ligger i `landingFor()` och provas där. Det som är kvar här är
 * de två uppslagen — och de kan inte gå fel på ett sätt som inte syns.
 *
 * Anropas först efter att sessionen är satt. Anropas den innan svarar den
 * `/konto`, eftersom det då inte finns någon inloggad att fråga om.
 */
export async function loginDestination(): Promise<string> {
  const [staff, admin] = await Promise.all([getStaff(), getPlatformAdmin()]);
  return landingFor(staff?.role ?? null, admin !== null);
}
