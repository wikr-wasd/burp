import type { Metadata } from "next";
import { CashRegister } from "@/components/staff/cash-register";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { getCashRegister } from "@/lib/cash-register";

/**
 * Kassan — slutförda order och vad som faktiskt betalats för dem.
 *
 * Egen vy och inte ett steg på "Serverad"-knappen. Kassan och köket är olika
 * platser och olika personer: att lägga beloppsfrågan på knappen hade gjort
 * köksskärmen till en kassaapparat, och en order som kocken slutför hade ändå
 * aldrig blivit kvitterad.
 *
 * Kocken har ingen anledning att vara här och släpps inte in — `requireStaff`
 * redirectar hen till /kok, och RLS i migration 0024 säger samma sak en gång
 * till.
 */

export const metadata: Metadata = {
  title: "Kassa",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CashRegisterPage() {
  const staff = await requireStaff(["owner", "manager", "staff"]);
  const { unsettled, settled } = await getCashRegister(staff.restaurantId, staff.timeZone);

  return (
    <StaffShell
      staff={staff}
      current="kassa"
      title="Kassa"
      intro="Slutförda order från det senaste dygnet. Kortbetalda order är redan kvitterade av leverantören; kontanter kvitteras här — utan det finns ingen kassaavstämning, och avgiften räknas på en siffra ingen sett."
      width="narrow"
    >
      <CashRegister
        unsettled={unsettled}
        settled={settled}
        canRefund={staff.role === "owner" || staff.role === "manager"}
      />
    </StaffShell>
  );
}
