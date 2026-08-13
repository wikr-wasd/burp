import type { Metadata } from "next";
import { KitchenBoard } from "@/components/staff/kitchen-board";
import { StaffHeader } from "@/components/staff/staff-header";
import { requireStaff } from "@/lib/auth";
import { getActiveOrders } from "@/lib/orders";

/**
 * Köksskärmen. Alla roller når den — även kocken, som bara har den här ytan.
 */

export const metadata: Metadata = {
  title: "Köksskärm",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const staff = await requireStaff();
  const orders = await getActiveOrders(staff.restaurantId);

  return (
    <>
      <StaffHeader staff={staff} current="kok" />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <KitchenBoard initialOrders={orders} restaurantId={staff.restaurantId} />
      </main>
    </>
  );
}
