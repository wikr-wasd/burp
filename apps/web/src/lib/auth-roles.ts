import type { StaffRole } from "@burp/core";

/**
 * Vart varje roll skickas efter inloggning.
 *
 * Egen fil och inte i `auth.ts` därför att `auth.ts` bär `server-only` — den
 * läser cookies och databasen. Tabellen här är ren data, och regeln som
 * använder den (`landing.ts`) ska gå att prova utan att starta en databas.
 */
export const ROLE_HOME: Record<StaffRole, string> = {
  owner: "/dashboard",
  manager: "/dashboard",
  staff: "/dashboard",
  // Kocken har bara köksskärmen. Att skicka honom till dashboarden vore att
  // visa en yta han ändå inte får något ur.
  kitchen: "/kok",
};
