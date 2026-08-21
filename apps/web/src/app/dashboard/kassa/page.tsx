import type { Metadata } from "next";
import { formatMoney, type CurrencyCode } from "@burp/core";
import { CashRegister } from "@/components/staff/cash-register";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { getCashRegister, getTipsSummary, type TipsSummary } from "@/lib/cash-register";
import { dictionary, fill, type Dictionary } from "@/lib/i18n";

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

  const t = dictionary(staff.locale).staff;

  return (
    <StaffShell
      staff={staff}
      current="kassa"
      title={t.section.kassa}
      intro={t.register.intro}
      width="narrow"
    >
      {tips.totalOre > 0 ? (
        <Tips tips={tips} currency={staff.currency} labels={t.register} />
      ) : null}

      <CashRegister
        tables={tables}
        unsettled={unsettled}
        settled={settled}
        canRefund={staff.role === "owner" || staff.role === "manager"}
        providerLabels={t.provider}
        orderTypeLabels={t.orderType}
        labels={t.register}
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
function Tips({
  tips,
  currency,
  labels,
}: {
  tips: TipsSummary;
  currency: CurrencyCode;
  labels: Dictionary["staff"]["register"];
}) {
  const parts = [
    tips.cashOre > 0 ? fill(labels.tipsCash, { amount: formatMoney(tips.cashOre, currency) }) : null,
    tips.cardOre > 0 ? fill(labels.tipsCard, { amount: formatMoney(tips.cardOre, currency) }) : null,
    tips.pendingOre > 0
      ? fill(labels.tipsPending, { amount: formatMoney(tips.pendingOre, currency) })
      : null,
  ].filter(Boolean);

  return (
    <section className="card mb-6 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl">{labels.tipsTitle}</h2>
        <p className="text-2xl font-semibold tabular-nums">
          {formatMoney(tips.totalOre, currency)}
        </p>
      </div>

      <p className="mt-1 text-sm text-[var(--muted)]">
        {labels.tipsPeriod}
        {parts.length > 0 ? <> — {parts.join(", ")}</> : null}. {labels.tipsHint}
      </p>
    </section>
  );
}
