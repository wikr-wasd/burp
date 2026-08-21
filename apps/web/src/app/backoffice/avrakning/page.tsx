import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformHeader } from "@/components/platform/platform-header";
import { SettlementBoard } from "@/components/platform/settlement-board";
import { requirePlatformAdmin } from "@/lib/platform";
import {
  closedMonths,
  formatMonth,
  isMonthKey,
  listPlatformPreview,
  listSettlementsForPeriod,
  monthBounds,
  type MonthKey,
} from "@/lib/settlements";
import { untranslatedSurface } from "@/lib/i18n";

/**
 * Avräkning för hela plattformen.
 *
 * Det här är Burps faktureringsunderlag. Under väg A i öppen fråga 5 går
 * gästens pengar direkt till restaurangen, och det enda som återstår mellan oss
 * och dem är avgiften — den syns här och ingen annanstans.
 *
 * Månaden räknas i Burps egen tid när menyn byggs, men VARJE RAD räknas i sin
 * restaurangs tidszon (migration 0039). En restaurang i Belgrad och en i
 * Stockholm har olika månadsskiften, och en gemensam gräns hade flyttat kvällens
 * order till fel faktura för den ena.
 */

export const metadata: Metadata = {
  title: "Avräkning",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ manad?: string }>;
}

// Burps eget månadsskifte styr vilka månader som erbjuds. Restaurangernas
// perioder räknas ändå i deras respektive tidszon.
const PLATFORM_TIME_ZONE = "Europe/Stockholm";

export default async function PlatformSettlementPage({ searchParams }: PageProps) {
  const admin = await requirePlatformAdmin();
  const params = await searchParams;

  const months = closedMonths(PLATFORM_TIME_ZONE, 12);
  const month: MonthKey = isMonthKey(params.manad) && months.includes(params.manad)
    ? params.manad
    : months[0]!;

  const bounds = monthBounds(month);
  const [previews, settlements] = await Promise.all([
    listPlatformPreview(bounds),
    listSettlementsForPeriod(bounds),
  ]);

  const byRestaurant = new Map(settlements.map((row) => [row.restaurantId, row]));

  const rows = previews.map((preview) => ({
    restaurantId: preview.restaurantId,
    restaurantName: preview.restaurantName,
    currency: preview.currency,
    preview: {
      ordersCount: preview.ordersCount,
      grossOre: preview.grossOre,
      tipsOre: preview.tipsOre,
      cashOre: preview.cashOre,
      feesOre: preview.feesOre,
      refundsOre: preview.refundsOre,
      feeCreditOre: preview.feeCreditOre,
      amountDueOre: preview.amountDueOre,
    },
    settlement: byRestaurant.get(preview.restaurantId) ?? null,
  }));

  // Perioder utan en enda order har ingenting att fakturera. De ska ändå gå att
  // stänga för hand — en avräkning på noll är ett svar på frågan "har vi
  // fakturerat augusti?" — men de ska inte ligga i massknappen.
  const toClose = rows
    .filter((row) => row.settlement === null && row.preview.ordersCount > 0)
    .map((row) => row.restaurantId);

  return (
    <>
      <PlatformHeader admin={admin} current="avrakning" />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl">Avräkning</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              Burps avgift per restaurang och månad. Gästernas pengar går direkt till
              restaurangen — det som står här är det enda vi fakturerar.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2" aria-label="Månad">
            {months.slice(0, 4).map((key) => (
              <Link
                key={key}
                href={`/backoffice/avrakning?manad=${key}`}
                aria-current={key === month ? "page" : undefined}
                className={`min-h-9 px-3.5 py-1.5 text-sm ${
                  key === month
                    ? "bg-burp-600 font-medium text-white"
                    : "border border-[var(--rule)]"
                }`}
              >
                {formatMonth(key)}
              </Link>
            ))}
          </nav>
        </div>

        <p className="mt-4 text-sm text-[var(--muted)]">
          Perioden är {bounds.start} till och med {bounds.end}, räknad i varje restaurangs egen
          tidszon.
        </p>

        {rows.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={ReceiptText}
              title="Inga restauranger att avräkna"
              body="Listan visar restauranger som är godkända. En ansökan som väntar har ingen avgift att betala."
            />
          </div>
        ) : (
          <SettlementBoard
            bounds={bounds}
            rows={rows}
            toClose={toClose}
            canWrite={admin.role === "admin" || admin.role === "owner"}
            figureLabels={untranslatedSurface().staff.reports}
          />
        )}
      </main>
    </>
  );
}
