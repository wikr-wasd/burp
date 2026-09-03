import type { Metadata } from "next";
import Link from "next/link";
import { ChartNoAxesColumn } from "lucide-react";
import { formatMoney } from "@burp/core";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { dictionary } from "@/lib/i18n";
import { getStatistics, isPeriodKey, periodFor, PERIODS, type PeriodKey } from "@/lib/statistics";

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

  const t = dictionary(staff.locale).staff;

  return (
    <StaffShell
      staff={staff}
      current="statistik"
      title={t.section.statistik}
      width="narrow"
      actions={
        <div className="flex flex-wrap items-center gap-2">
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

          {/*
            Vanlig länk och ingen knapp med fetch: svaret är en fil, och
            webbläsaren laddar ner den själv. `download` gör att den inte öppnas
            i en flik som visar rå CSV. Perioden följer med den som visas — den
            som exporterar vill ha det hen tittar på.
          */}
          {summary.ordersCount > 0 ? (
            <a
              href={`/dashboard/statistik/export?period=${periodKey}`}
              download
              title={t.reports.exportCsvHint}
              className="btn btn-secondary"
            >
              {t.reports.exportCsv}
            </a>
          ) : null}
        </div>
      }
    >
        {summary.ordersCount === 0 ? (
          <EmptyState
            icon={ChartNoAxesColumn}
            title={t.reports.statsEmptyTitle}
            body={t.reports.statsEmptyBody}
          />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
          label={t.reports.revenue}
          value={formatMoney(summary.itemsGrossOre, staff.currency)}
          hint={t.reports.inclVat}
        />
              <Stat label={t.reports.orders} value={String(summary.ordersCount)} />
              <Stat label="Snittnota" value={formatMoney(summary.avgOrderOre, staff.currency)} />
              <Stat
          label={t.reports.tips}
          value={formatMoney(summary.tipsOre, staff.currency)}
          hint={t.reports.tipsToStaff}
        />
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl">Ekonomi</h2>
              <dl className="card mt-3 divide-y divide-[var(--rule)]">
                <Row
            label={t.reports.revenueInclVat}
            value={formatMoney(summary.itemsGrossOre, staff.currency)}
          />
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
                {t.reports.feeHint}{" "}
                <Link href="/dashboard/avrakning" className="underline">
                  {t.reports.settlementLink}
                </Link>
                {t.reports.feeHintAfter}
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
                    hint={t.reports.avgHint}
                  />
                </div>
              </section>
            ) : null}

            {stats.topItems.length > 0 ? (
              <section className="mt-8">
                <h2 className="font-display text-2xl">{t.reports.mostPopular}</h2>
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
                <h2 className="font-display text-2xl">{t.reports.revenuePerTable}</h2>
                <p className="mt-1 text-sm opacity-60">
                  {t.reports.revenuePerTableHint}
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
