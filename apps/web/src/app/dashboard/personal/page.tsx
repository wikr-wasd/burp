import type { Metadata } from "next";
import { StaffShell } from "@/components/staff/staff-shell";
import { StaffAdmin } from "@/components/staff/staff-admin";
import { requireStaff } from "@/lib/auth";
import { getOpenInvitations, getStaff } from "@/lib/staff-admin";
import { untranslatedSurface } from "@/lib/i18n";

/**
 * Personalen — vem som arbetar här och vem som är på väg in.
 *
 * `admin_create_restaurant` har sedan migration 0022 en kommentar om att
 * "ägaren knyts senare via personalfliken". Det här är den fliken, och fram
 * till nu fanns den inte: en restaurang hade exakt de konton Burp skapade åt
 * den, och en uppsagd servitör behöll åtkomst till kassan tills någon körde
 * SQL.
 *
 * Ägare och chef. Hierarkin — vem som får bjuda in vem — ligger i databasen
 * och kontrolleras där (migration 0046).
 */

export const metadata: Metadata = {
  title: "Personal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const staff = await requireStaff(["owner", "manager"]);

  const [members, invitations] = await Promise.all([
    getStaff(staff.restaurantId),
    getOpenInvitations(staff.restaurantId),
  ]);

  return (
    <StaffShell
      staff={staff}
      current="personal"
      title="Personal"
      intro="Vem som arbetar här, med vilken roll, och vem som är inbjuden men inte kommit in än."
      width="narrow"
    >
      <StaffAdmin
        members={members}
        invitations={invitations}
        myRole={staff.role}
        roleLabels={untranslatedSurface().staff.role}
      />
    </StaffShell>
  );
}
