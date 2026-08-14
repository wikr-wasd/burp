import type { Metadata } from "next";
import Link from "next/link";
import { formatOre } from "@burp/core";
import { StaffHeader } from "@/components/staff/staff-header";
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

  // Vad restaurangen får ut: omsättning minus Burps avgift, plus dricksen som
  // passerar orörd. Kortavgiften är inte med — det är öppen fråga 1, och
  // ingenting här ska låtsas veta svaret.
  const payoutOre = summary.itemsGrossOre - summary.feesOre + summary.tipsOre;

  return (
    <>
      <StaffHeader staff={staff} current="dashboard" />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold">Statistik</h1>
          <nav className="flex gap-2" aria-label="Period">
            {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
              <Link
                key={key}
                href={`/dashboard/statistik?period=${key}`}
                aria-current={key === periodKey ? "page" : undefined}
                className={`min-h-9 rounded-full px-3.5 py-1.5 text-sm ${
                  key === periodKey
                    ? "bg-burp-600 font-medium text-white"
                    : "border border-black/15 dark:border-white/20"
                }`}
              >
                {PERIODS[key].label}
              </Link>
            ))}
          </nav>
        </div>

        {summary.ordersCount === 0 ? (
          <p className="mt-8 rounded-xl border border-black/10 p-6 opacity-70 dark:border-white/15">
            Inga genomförda beställningar i perioden. Statistiken räknar bara order som
            slutförts — en order i kön är inte omsättning.
          </p>
        ) : (
          <>
            <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Omsättning" value={formatOre(summary.itemsGrossOre)} hint="inkl. moms" />
              <Stat label="Beställningar" value={String(summary.ordersCount)} />
              <Stat label="Snittnota" value={formatOre(summary.avgOrderOre)} />
              <Stat label="Dricks" value={formatOre(summary.tipsOre)} hint="går till personalen" />
            </section>

            <section className="mt-8">
              <h2 className="text-lg font-semibold">Ekonomi</h2>
              <dl className="mt-3 divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">
                <Row label="Omsättning inkl. moms" value={formatOre(summary.itemsGrossOre)} />
                <Row label="varav moms" value={formatOre(summary.itemsVatOre)} muted />
                {stats.vat.map((line) => (
                  <Row
                    key={line.vatRateBps}
                    label={`varav ${(line.vatRateBps / 100).toFixed(0)} %`}
                    value={formatOre(line.vatOre)}
                    muted
                    indented
                  />
                ))}
                <Row label="Netto exkl. moms" value={formatOre(summary.itemsNetOre)} />
                <Row
                  label="Burps avgift"
                  value={`−${formatOre(summary.feesOre)}`}
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
                <Row label="Dricks" value={`+${formatOre(summary.tipsOre)}`} />
                <Row label="Till utbetalning" value={formatOre(payoutOre)} strong />
              </dl>

              <p className="mt-3 text-sm opacity-60">
                Betalleverantörens kortavgift ingår inte. Det är inte beslutat om den ligger
                ovanpå eller inuti Burps avgift — se docs/OPEN-QUESTIONS.md fråga 1.
              </p>
            </section>

            {stats.prepTimes.measuredOrders > 0 ? (
              <section className="mt-8">
                <h2 className="text-lg font-semibold">Tid till klar mat</h2>
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
                <h2 className="text-lg font-semibold">Populärast</h2>
                <ul className="mt-3 divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">
                  {stats.topItems.map((item) => (
                    <li key={item.name} className="flex items-center gap-4 px-4 py-3">
                      <span className="w-10 shrink-0 tabular-nums opacity-60">{item.quantity}×</span>
                      <span className="mr-auto">{item.name}</span>
                      <span className="tabular-nums">{formatOre(item.grossOre)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {stats.tableRevenue.length > 0 ? (
              <section className="mt-8">
                <h2 className="text-lg font-semibold">Omsättning per bord</h2>
                <p className="mt-1 text-sm opacity-60">
                  Siffran QR-beställningen finns för att kunna ge. Bord utan order visas som noll.
                </p>
                <ul className="mt-3 divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">
                  {stats.tableRevenue.map((table) => (
                    <li key={table.tableNumber} className="flex items-center gap-4 px-4 py-3">
                      <span className="mr-auto">
                        Bord {table.tableNumber}
                        {table.zone ? <span className="opacity-60"> · {table.zone}</span> : null}
                      </span>
                      <span className="tabular-nums opacity-60">
                        {table.ordersCount} {table.ordersCount === 1 ? "order" : "order"}
                      </span>
                      <span className="w-24 text-right tabular-nums">{formatOre(table.grossOre)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
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
