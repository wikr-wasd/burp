import Link from "next/link";
import { STAFF_ROLE_LABELS } from "@burp/core";
import type { StaffContext } from "@/lib/auth";

/** Gemensam topprad för personalytorna. */
export function StaffHeader({ staff, current }: { staff: StaffContext; current: "dashboard" | "kok" }) {
  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <div className="mr-auto">
          <p className="font-semibold">{staff.restaurantName}</p>
          <p className="text-sm opacity-60">
            {staff.email} · {STAFF_ROLE_LABELS[staff.role]}
          </p>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          {/* Kocken har bara köksskärmen — dashboarden döljs för att inte
              erbjuda en väg som RLS ändå stänger. */}
          {staff.role !== "kitchen" ? (
            <Link
              href="/dashboard"
              className={current === "dashboard" ? "font-medium" : "opacity-60 hover:opacity-100"}
            >
              Order
            </Link>
          ) : null}

          <Link
            href="/kok"
            className={current === "kok" ? "font-medium" : "opacity-60 hover:opacity-100"}
          >
            Köksskärm
          </Link>

          {staff.role === "owner" || staff.role === "manager" ? (
            <>
              <Link href="/dashboard/meny" className="opacity-60 hover:opacity-100">
                Meny
              </Link>
              <Link href="/dashboard/bord" className="opacity-60 hover:opacity-100">
                Bord
              </Link>
              <Link href="/dashboard/omdomen" className="opacity-60 hover:opacity-100">
                Omdömen
              </Link>
              <Link href="/dashboard/statistik" className="opacity-60 hover:opacity-100">
                Statistik
              </Link>
              <Link href="/dashboard/installningar" className="opacity-60 hover:opacity-100">
                Inställningar
              </Link>
            </>
          ) : null}

          <form action="/logga-ut" method="post">
            <button type="submit" className="opacity-60 hover:opacity-100">
              Logga ut
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
