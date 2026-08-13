import type { Metadata } from "next";
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
  const orders = await getActiveOrders(staff.restaurantId);

  return (
    <>
      <StaffHeader staff={staff} current="dashboard" />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <KitchenBoard
          initialOrders={orders}
          restaurantId={staff.restaurantId}
          title="Order live"
          canCancel
          showTotals
        />
      </main>
    </>
  );
}
