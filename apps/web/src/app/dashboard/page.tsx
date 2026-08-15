import type { Metadata } from "next";
import { formatMoney } from "@burp/core";
import { KitchenBoard } from "@/components/staff/kitchen-board";
import { StaffHeader } from "@/components/staff/staff-header";
import { requireStaff } from "@/lib/auth";
import { getActiveOrders } from "@/lib/orders";

/**
 * Order live (avsnitt 11).
 *
 * Samma komponent som köksskärmen, med två skillnader: här går det att avvisa
 * en order, och beloppen visas. En kock som råkar trycka fel ska inte kunna
 * annullera en gästs beställning, och han har ingen nytta av summan.
 *
 * Kocken redirectas till /kok av requireStaff.
 */

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const staff = await requireStaff(["owner", "manager", "staff"]);
  const { due, upcoming } = await getActiveOrders(staff.restaurantId);

  return (
    <>
      <StaffHeader staff={staff} current="dashboard" />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <KitchenBoard
          initialOrders={due}
          restaurantId={staff.restaurantId}
          title="Order live"
          canCancel
          showTotals
          currency={staff.currency}
        />

        {/* Förbeställningar visas här men inte på köksskärmen. Personalen ska
            kunna se vad som är på gång utan att köket börjar laga för tidigt. */}
        {upcoming.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-display text-2xl">Kommande</h2>
            <p className="mt-1 text-sm opacity-60">
              Släpps till köket när tillagningstiden återstår.
            </p>
            <ul className="mt-3 divide-y divide-[var(--rule)] border border-[var(--rule)]">
              {upcoming.map((order) => (
                <li key={order.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
                  <span className="font-semibold tabular-nums">
                    {order.scheduledFor
                      ? new Date(order.scheduledFor).toLocaleTimeString("sv-SE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                  <span className="mr-auto">
                    {order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}
                  </span>
                  <span className="tabular-nums opacity-60">{formatMoney(order.totalOre, staff.currency)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
