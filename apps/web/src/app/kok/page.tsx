import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, LogOut } from "lucide-react";
import { KitchenBoard } from "@/components/staff/kitchen-board";
import { BurpMark } from "@/components/ui/burp-mark";
import { requireStaff } from "@/lib/auth";
import { getActiveOrders } from "@/lib/orders";
import { dictionary } from "@/lib/i18n";

/**
 * Köksskärmen. Alla roller når den — även kocken, som bara har den här ytan.
 *
 * Ingen sidomeny här, med flit. Skärmen körs på en surfplatta på några meters
 * håll i ett kök: varje pixel som går till navigering är en pixel som inte
 * går till en biljett. Toppraden bär det lilla som behövs — en väg tillbaka
 * för den som har en dashboard att gå till, och en utloggning.
 */

export const metadata: Metadata = {
  title: "Köksskärm",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const staff = await requireStaff();
  const t = dictionary(staff.locale).staff;
  const { due, upcoming } = await getActiveOrders(staff.restaurantId);

  return (
    <>
      <header className="flex items-center gap-4 border-b border-[var(--rule)] px-4 py-3">
        <BurpMark size="sm" wordmark={false} />
        <p className="mr-auto min-w-0 truncate font-medium">{staff.restaurantName}</p>

        {/* Kocken har ingen dashboard att gå till — `requireStaff` skickar
            hen tillbaka hit. Länken visas därför bara för de andra. */}
        {staff.role !== "kitchen" ? (
          <Link href="/dashboard" className="btn btn-secondary">
            <LayoutGrid size={16} aria-hidden="true" />
            {t.section.oversikt}
          </Link>
        ) : null}

        <form action="/logga-ut" method="post">
          <button type="submit" className="btn btn-secondary">
            <LogOut size={16} aria-hidden="true" />
            {t.logOut}
          </button>
        </form>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Köket ser bara det som ska lagas nu. Förbeställningar dyker upp
            när tillagningstiden återstår — de listas i dashboarden så länge. */}
        <KitchenBoard
          initialOrders={due}
          restaurantId={staff.restaurantId}
          currency={staff.currency}
          title={t.section.kok}
          statusLabels={t.status}
          labels={t.kitchen}
        />

        {upcoming.length > 0 ? (
          <p className="mt-8 text-center opacity-50">{t.upcomingLater(upcoming.length)}</p>
        ) : null}
      </main>
    </>
  );
}
