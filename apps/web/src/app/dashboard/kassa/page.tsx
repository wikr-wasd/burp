import type { Metadata } from "next";
import { formatMoney, type CurrencyCode } from "@burp/core";
import { CashRegister } from "@/components/staff/cash-register";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { getCashRegister, getTipsSummary, type TipsSummary } from "@/lib/cash-register";

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

  const [{ tables, unsettled, settled }, tips] = await Promise.all([
    getCashRegister(staff.restaurantId, staff.timeZone),
    getTipsSummary(staff.restaurantId),
  ]);

  return (
    <StaffShell
      staff={staff}
      current="kassa"
      title="Kassa"
      intro="Slutförda order från det senaste dygnet. Ett bordssällskap står som en nota och kvitteras i ett svep; beloppet fördelas på beställningarna åt er. Kortbetalda order är redan kvitterade av leverantören."
      width="narrow"
    >
      {tips.totalOre > 0 ? <Tips tips={tips} currency={staff.currency} /> : null}

      <CashRegister
        tables={tables}
        unsettled={unsettled}
        settled={settled}
        canRefund={staff.role === "owner" || staff.role === "manager"}
      />
    </StaffShell>
  );
}

/**
 * Dricks att fördela.
 *
 * Står överst och inte längst ned. Det är den siffra personalen själv har ett
 * ärende till när passet är slut, och den enda på sidan som handlar om deras
 * egna pengar — dricksen är aldrig restaurangens omsättning och aldrig med i
 * Burps avgiftsunderlag.
 */
function Tips({ tips, currency }: { tips: TipsSummary; currency: CurrencyCode }) {
  const parts = [
    tips.cashOre > 0 ? `${formatMoney(tips.cashOre, currency)} kontant` : null,
    tips.cardOre > 0 ? `${formatMoney(tips.cardOre, currency)} via kort` : null,
    tips.pendingOre > 0
      ? `${formatMoney(tips.pendingOre, currency)} på notor som inte betalats än`
      : null,
  ].filter(Boolean);

  return (
    <section className="card mb-6 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl">Dricks att fördela</h2>
        <p className="text-2xl font-semibold tabular-nums">
          {formatMoney(tips.totalOre, currency)}
        </p>
      </div>

      <p className="mt-1 text-sm text-[var(--muted)]">
        Senaste dygnet{parts.length > 0 ? <> — {parts.join(", ")}</> : null}. Dricksen är
        personalens pengar och ingår varken i omsättningen eller i Burps avgift. En nota som
        lämnats tillbaka räknas inte.
      </p>
    </section>
  );
}
