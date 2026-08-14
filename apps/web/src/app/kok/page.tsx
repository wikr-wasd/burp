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
  const { due, upcoming } = await getActiveOrders(staff.restaurantId);

  return (
    <>
      <StaffHeader staff={staff} current="kok" />
      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Köket ser bara det som ska lagas nu. Förbeställningar dyker upp
            när tillagningstiden återstår — de listas i dashboarden så länge. */}
        <KitchenBoard initialOrders={due} restaurantId={staff.restaurantId} />

        {upcoming.length > 0 ? (
          <p className="mt-8 text-center opacity-50">
            {upcoming.length === 1
              ? "1 förbeställning senare i dag."
              : `${upcoming.length} förbeställningar senare i dag.`}
          </p>
        ) : null}
      </main>
    </>
  );
}
