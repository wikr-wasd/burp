import type { Metadata } from "next";
import { formatMoney } from "@burp/core";
import { KitchenBoard } from "@/components/staff/kitchen-board";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { getActiveOrders } from "@/lib/orders";
import { dictionary, LOCALE_DATE_TAGS } from "@/lib/i18n";

/**
 * Order live (avsnitt 11).
 *
 * Samma komponent som köksskärmen, med två skillnader: här går det att avvisa
 * en order, och beloppen visas. En kock som råkar trycka fel ska inte kunna
 * annullera en gästs beställning, och han har ingen nytta av summan.
 *
 * Kocken redirectas till /kok av requireStaff.
 *
 * Låg tidigare på `/dashboard`. Flyttades hit när översikten tog den platsen —
 * personalen som loggar in vill först veta läget, inte se en lista.
 */

export const metadata: Metadata = {
  title: "Beställningar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const staff = await requireStaff(["owner", "manager", "staff"]);
  const { due, upcoming } = await getActiveOrders(staff.restaurantId);
  const t = dictionary(staff.locale).staff;

  return (
    <StaffShell staff={staff} current="order" title={t.section.order}>
      <KitchenBoard
        initialOrders={due}
        restaurantId={staff.restaurantId}
        title={t.kitchen.live}
        canCancel
        showTotals
        currency={staff.currency}
        statusLabels={t.status}
        labels={t.kitchen}
        orderTypeLabels={t.orderType}
      />

      {/* Förbeställningar visas här men inte på köksskärmen. Personalen ska
          kunna se vad som är på gång utan att köket börjar laga för tidigt. */}
      {upcoming.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-2xl">{t.kitchen.upcomingTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t.kitchen.upcomingHint}</p>
          <ul className="card mt-3 divide-y divide-[var(--rule)]">
            {upcoming.map((order) => (
              <li key={order.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-semibold tabular-nums">
                  {order.scheduledFor
                    ? new Date(order.scheduledFor).toLocaleTimeString(LOCALE_DATE_TAGS[staff.locale], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </span>
                <span className="mr-auto">
                  {order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}
                </span>
                <span className="tabular-nums text-[var(--muted)]">
                  {formatMoney(order.totalOre, staff.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </StaffShell>
  );
}
