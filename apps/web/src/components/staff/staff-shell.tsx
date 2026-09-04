import type { ReactNode } from "react";
import { IdleLogout } from "@/components/staff/idle-logout";
import { StaffSidebar, StaffTopBar, type StaffSection } from "@/components/staff/staff-nav";
import type { StaffContext } from "@/lib/auth";
import { dictionary } from "@/lib/i18n";

/**
 * Ramen runt varje personalyta.
 *
 * Sidomeny till vänster, sidans innehåll till höger. Varje sida skrev
 * tidigare sin egen `<main>` med sin egen bredd och sin egen luft, vilket
 * betydde att rubriken låg på olika höjd beroende på var man stod.
 *
 * Bredden går att välja därför att ytorna faktiskt är olika: kassan och
 * omdömena läses som en kolumn, menyredigeraren och statistiken behöver hela
 * bordet.
 */

const WIDTHS = {
  narrow: "max-w-3xl",
  wide: "max-w-6xl",
  full: "max-w-none",
} as const;

export function StaffShell({
  staff,
  current,
  title,
  intro,
  /** Knappar som hör till sidan, till höger om rubriken. */
  actions,
  width = "wide",
  children,
}: {
  staff: StaffContext;
  current: StaffSection;
  title: string;
  intro?: string;
  actions?: ReactNode;
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Kassan står på en disk och delas av flera. En glömd surfplatta ska
          inte stå inloggad över natten. Köksskärmen berörs inte — den bygger
          sin egen ram och ska stå på hela passet. */}
      <IdleLogout labels={dictionary(staff.locale).staff.session} />

      <StaffTopBar staff={staff} current={current} />
      <StaffSidebar staff={staff} current={current} />

      {/* `min-w-0` är inte kosmetik: utan den vägrar en flexcell krympa under
          sitt innehåll, och en bred tabell trycker ut sidomenyn ur bild. */}
      <div className="min-w-0 flex-1">
        <main className={`mx-auto ${WIDTHS[width]} px-4 py-8 sm:px-6`}>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
              {intro ? (
                <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">{intro}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>

          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
