import { ROLE_HOME } from "@/lib/auth-roles";
import type { StaffRole } from "@burp/core";

/**
 * Var hör den inloggade hemma?
 *
 * Burp har tre sorters inloggade och EN inloggning. Fram till 2026-08-23
 * skickade formuläret alla till `/dashboard`, vilket bara stämde för en av
 * dem:
 *
 * - **Personal** hör hemma där, utom kocken som har köksskärmen.
 * - **Burps egen personal** hör hemma i backoffice och har ingen `staff`-rad
 *   alls. Hen kastades ut ur dashboarden — tillbaka till inloggningen.
 * - **Gästen** har varken det ena eller det andra. Samma sak.
 *
 * För de två sista såg det ut som att lösenordet var fel: man skrev in det,
 * fick inget felmeddelande, och stod kvar på inloggningssidan. Det var inte
 * ett inloggningsfel utan en studs — och den syntes inte i något test.
 * Röktestet provade inloggningen mot GoTrue, där den alltid fungerade, och
 * sedan personalytorna, där den också gjorde det. Ingen av de två kontona
 * fanns ens i seeden.
 *
 * Ren funktion med flit. Regeln är det som var fel, och en regel som kräver en
 * databas för att provas blir aldrig provad.
 */
export function landingFor(
  /** Rollen ur `staff`, eller null för den som inte är anställd någonstans. */
  staffRole: StaffRole | null,
  /** Har personen en rad i `platform_admins`? */
  isPlatformAdmin: boolean,
): string {
  /*
   * Personal före plattform.
   *
   * En som är både anställd hos en restaurang och hos Burp loggar in för att
   * arbeta i restaurangen. Backoffice är två klick bort därifrån, medan vägen
   * tillbaka kräver att man vet att dashboarden finns.
   */
  if (staffRole) return ROLE_HOME[staffRole];

  if (isPlatformAdmin) return "/backoffice";

  // Gästen — eller någon som just registrerat sig och ännu inte är något alls.
  return "/konto";
}
