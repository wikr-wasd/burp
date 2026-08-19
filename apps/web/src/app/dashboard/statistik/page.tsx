import type { Metadata } from "next";
import Link from "next/link";
import { ChartNoAxesColumn } from "lucide-react";
import { formatMoney } from "@burp/core";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { getStatistics, periodFor, PERIODS, type PeriodKey } from "@/lib/statistics";

/**
 * Statistik och ekonomi (avsnitt 11).
 *
 * Bara ägare och chef. Avgifter och marginal är inte personalens sak, och
 * `fees` är dessutom stängd för dem i RLS — sidan skulle visa nollor.
 */

export const metadata: Metadata = {
  title: "Statistik",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

function isPeriodKey(value: string | undefined): value is PeriodKey {
  return value === "idag" || value === "vecka" || value === "manad";
}

export default async function StatisticsPage({ searchParams }: PageProps) {
  const staff = await requireStaff(["owner", "manager"]);
  const params = await searchParams;

  const periodKey: PeriodKey = isPeriodKey(params.period) ? params.period : "vecka";
  const period = periodFor(periodKey);
  const stats = await getStatistics(staff.restaurantId, period);

  const { summary } = stats;

  /*
   * Vad som blir kvar när Burps avgift är betald.
   *
   * Raden hette "Till utbetalning" och byggde på marknadsplatsmodellen: gästen
   * betalar plattformen, plattformen betalar ut resten. Öppen fråga 5 besvarades
   * med motsatsen — restaurangen äger sitt eget inlösenavtal och pengarna går
   * direkt till den. Ingen betalar ut något; avgiften faktureras i efterhand.
   * Se /dashboard/avrakning och migration 0039.
   *
   * Kortavgiften är fortfarande inte med. Den ligger mellan restaurangen och
   * dess inlösare, inte mellan restaurangen och Burp.
   */
  const afterFeeOre = summary.itemsGrossOre - summary.feesOre + summary.tipsOre;

  return (
    <StaffShell
      staff={staff}
      current="statistik"
      title="Statistik"
      width="narrow"
      actions={
        <nav className="flex gap-2" aria-label="Period">
          {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
            <Link
              key={key}
              href={`/dashboard/statistik?period=${key}`}
              aria-current={key === periodKey ? "page" : undefined}
              className={`chip ${key === periodKey ? "chip-active" : ""}`}
            >
              {PERIODS[key].label}
            </Link>
          ))}
        </nav>
      }
    >
        {summary.ordersCount === 0 ? (
          <EmptyState
            icon={ChartNoAxesColumn}
            title="Inga genomförda beställningar i perioden"
            body="Statistiken räknar bara order som slutförts — en order i kön är inte omsättning."
          />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Omsättning" value={formatMoney(summary.itemsGrossOre, staff.currency)} hint="inkl. moms" />
              <Stat label="Beställningar" value={String(summary.ordersCount)} />
              <Stat label="Snittnota" value={formatMoney(summary.avgOrderOre, staff.currency)} />
              <Stat label="Dricks" value={formatMoney(summary.tipsOre, staff.currency)} hint="går till personalen" />
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl">Ekonomi</h2>
              <dl className="card mt-3 divide-y divide-[var(--rule)]">
                <Row label="Omsättning inkl. moms" value={formatMoney(summary.itemsGrossOre, staff.currency)} />
                <Row label="varav moms" value={formatMoney(summary.itemsVatOre, staff.currency)} muted />
                {stats.vat.map((line) => (
                  <Row
                    key={line.vatRateBps}
                    label={`varav ${(line.vatRateBps / 100).toFixed(0)} %`}
                    value={formatMoney(line.vatOre, staff.currency)}
                    muted
                    indented
                  />
                ))}
                <Row label="Netto exkl. moms" value={formatMoney(summary.itemsNetOre, staff.currency)} />
                <Row
                  label="Burps avgift"
                  value={`−${formatMoney(summary.feesOre, staff.currency)}`}
                  hint={
                    summary.itemsGrossOre > 0
                      ? // Svenskt decimalkomma. toFixed ger punkt, och en punkt
                        // mitt bland kronbelopp med komma ser ut som en bugg.
                        `${((summary.feesOre / summary.itemsGrossOre) * 100)
                          .toFixed(2)
                          .replace(".", ",")} % av omsättningen`
                      : undefined
                  }
                />
                <Row label="Dricks" value={`+${formatMoney(summary.tipsOre, staff.currency)}`} />
                <Row
                  label="Kvar efter Burps avgift"
                  value={formatMoney(afterFeeOre, staff.currency)}
                  strong
                />
              </dl>

              <p className="mt-3 text-sm opacity-60">
                Gästernas pengar går direkt till er — Burp håller dem aldrig. Avgiften samlas per
                månad och faktureras i efterhand; den står på{" "}
                <Link href="/dashboard/avrakning" className="underline">
                  Avräkning
                </Link>
                . Betalleverantörens kortavgift ingår inte, den ligger mellan er och er inlösare.
              </p>
            </section>

            {stats.prepTimes.measuredOrders > 0 ? (
              <section className="mt-8">
                <h2 className="font-display text-2xl">Tid till klar mat</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Stat
                    label="Median"
                    value={formatDuration(stats.prepTimes.medianSeconds)}
                    hint={`${stats.prepTimes.measuredOrders} mätta order`}
                  />
                  <Stat
                    label="9 av 10 inom"
                    value={formatDuration(stats.prepTimes.p90Seconds)}
                    hint="den siffran gästen minns"
                  />
                </div>
              </section>
            ) : null}

            {stats.topItems.length > 0 ? (
              <section className="mt-8">
                <h2 className="font-display text-2xl">Populärast</h2>
                <ul className="card mt-3 divide-y divide-[var(--rule)]">
                  {stats.topItems.map((item) => (
                    <li key={item.name} className="flex items-center gap-4 px-4 py-3">
                      <span className="w-10 shrink-0 tabular-nums opacity-60">{item.quantity}×</span>
                      <span className="mr-auto">{item.name}</span>
                      <span className="tabular-nums">{formatMoney(item.grossOre, staff.currency)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {stats.tableRevenue.length > 0 ? (
              <section className="mt-8">
                <h2 className="font-display text-2xl">Omsättning per bord</h2>
                <p className="mt-1 text-sm opacity-60">
                  Siffran QR-beställningen finns för att kunna ge. Bord utan order visas som noll.
                </p>
                <ul className="card mt-3 divide-y divide-[var(--rule)]">
                  {stats.tableRevenue.map((table) => (
                    <li key={table.tableNumber} className="flex items-center gap-4 px-4 py-3">
                      <span className="mr-auto">
                        Bord {table.tableNumber}
                        {table.zone ? <span className="opacity-60"> · {table.zone}</span> : null}
                      </span>
                      <span className="tabular-nums opacity-60">
                        {table.ordersCount} {table.ordersCount === 1 ? "order" : "order"}
                      </span>
                      <span className="w-24 text-right tabular-nums">{formatMoney(table.grossOre, staff.currency)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
    </StaffShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs opacity-50">{hint}</p> : null}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  muted,
  indented,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  indented?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-4 py-3 ${muted ? "opacity-60" : ""} ${
        strong ? "font-semibold" : ""
      }`}
    >
      <dt className={indented ? "pl-4" : ""}>
        {label}
        {hint ? <span className="ml-2 text-xs font-normal opacity-70">{hint}</span> : null}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** "12 min" hellre än "743 s". Köket tänker i minuter. */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
