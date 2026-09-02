import type { Metadata } from "next";
import { ReceiptText } from "lucide-react";
import { formatMoney, type CurrencyCode } from "@burp/core";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffShell } from "@/components/staff/staff-shell";
import { SettlementFigures, SettlementStatusBadge } from "@/components/staff/settlement-figures";
import { requireStaff } from "@/lib/auth";
import { dictionary } from "@/lib/i18n";
import {
  currentMonthKey,
  formatMonth,
  getSettlementPreview,
  listSettlements,
  monthBounds,
} from "@/lib/settlements";

/**
 * Avräkning — vad restaurangen är skyldig Burp.
 *
 * Ägare och chef. Servitören ser den inte: vad restaurangen betalar Burp är
 * samma sorts uppgift som statistiksidan, och RLS i migration 0039 drar samma
 * gräns en gång till.
 *
 * Sidan är läsning och ingenting annat. Perioden stängs av Burp i backoffice —
 * det är Burps faktura, och en restaurang som kunde stänga sin egen period hade
 * kunnat stänga den på noll.
 */

export const metadata: Metadata = {
  title: "Avräkning",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettlementPage() {
  const staff = await requireStaff(["owner", "manager"]);

  const thisMonth = currentMonthKey(staff.timeZone);
  const [running, settlements] = await Promise.all([
    getSettlementPreview(staff.restaurantId, monthBounds(thisMonth)),
    listSettlements(staff.restaurantId),
  ]);

  const currency = (running.currency ?? staff.currency) as CurrencyCode;

  const t = dictionary(staff.locale).staff;

  return (
    <StaffShell
      staff={staff}
      current="avrakning"
      title={t.reports.settlementTitle}
      intro={t.reports.settlementIntro}
      width="narrow"
      actions={
        <a
          href="/dashboard/avrakning/export"
          download
          title={t.reports.exportCsvHint}
          className="btn btn-secondary"
        >
          {t.reports.exportCsv}
        </a>
      }
    >
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-2xl">Hittills i {formatMonth(thisMonth)}</h2>
          <p className="text-sm text-[var(--muted)]">{t.reports.settlementOngoing}</p>
        </div>

        <div className="card mt-3">
          <SettlementFigures numbers={running} currency={currency} labels={t.reports} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl">{t.reports.settlementClosed}</h2>

        {settlements.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={ReceiptText}
              title={t.reports.settlementEmptyTitle}
              body={t.reports.settlementEmptyBody}
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {settlements.map((settlement) => (
              <li key={settlement.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--rule)] px-4 py-3">
                  <div>
                    <p className="font-medium">
                      {formatPeriod(settlement.periodStart, settlement.periodEnd)}
                    </p>
                    {settlement.invoiceNumber ? (
                      <p className="label-caps mt-0.5 normal-case">
                        Faktura {settlement.invoiceNumber}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <SettlementStatusBadge status={settlement.status} />
                    <span className="text-lg font-semibold tabular-nums">
                      {formatMoney(settlement.amountDueOre, settlement.currency)}
                    </span>
                  </div>
                </div>

                <SettlementFigures numbers={settlement} currency={settlement.currency} labels={t.reports} />

                {settlement.note ? (
                  <p className="border-t border-[var(--rule)] px-4 py-3 text-sm text-[var(--muted)]">
                    {settlement.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-sm text-[var(--muted)]">
        {t.reports.settlementFrozenHint}
      </p>
    </StaffShell>
  );
}

/** "1–30 juni 2026" när månaden är hel, annars båda datumen. */
function formatPeriod(start: string, end: string): string {
  const bounds = monthBounds(start.slice(0, 7));

  if (bounds.start === start && bounds.end === end) {
    return formatMonth(start.slice(0, 7));
  }

  return `${start} – ${end}`;
}
