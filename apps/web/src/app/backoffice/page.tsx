import type { Metadata } from "next";
import Link from "next/link";
import { ChartNoAxesColumn } from "lucide-react";
import { formatMoney, type CurrencyCode } from "@burp/core";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformHeader } from "@/components/platform/platform-header";
import { MfaReset } from "@/components/platform/mfa-reset";
import { MfaSettings } from "@/components/staff/mfa-settings";
import { SystemStatus } from "@/components/platform/system-status";
import { mfaLabels } from "@/components/staff/mfa-labels";
import { untranslatedSurface } from "@/lib/i18n";
import { requirePlatformAdmin } from "@/lib/platform";
import { capabilities, summarise } from "@/lib/readiness";
import { serverEnv, publicEnv } from "@/lib/env";
import { isPeriodKey, periodFor, PERIODS, type PeriodKey } from "@/lib/statistics";
import { createClient } from "@/lib/supabase/server";

/**
 * Burps backoffice — översikten.
 *
 * Skild från restaurangernas dashboard i både data och åtkomst. Det som visas
 * här är plattformens siffror: hur mycket som omsätts totalt, vad Burp tjänar
 * på det, och vilka restauranger som väntar på godkännande.
 */

export const metadata: Metadata = {
  title: "Backoffice",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}


export default async function BackofficePage({ searchParams }: PageProps) {
  const admin = await requirePlatformAdmin();
  const params = await searchParams;

  const periodKey: PeriodKey = isPeriodKey(params.period) ? params.period : "manad";
  const period = periodFor(periodKey);

  /*
   * Vad som faktiskt är påslaget.
   *
   * Läses här och inte i komponenten: `serverEnv()` är serversidan, och
   * `SystemStatus` ska kunna prövas med en handskriven lista. Se
   * `lib/readiness.ts` för varför ytan finns alls.
   */
  const env = serverEnv();
  const status = capabilities({
    vapidPublicKey: publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY,
    resendApiKey: env.RESEND_API_KEY,
    opsEmail: env.BURP_OPS_EMAIL,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripePublishableKey: publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    cronSecret: env.CRON_SECRET,
    qrTokenSecret: env.QR_TOKEN_SECRET,
    mapTileUrl: publicEnv.NEXT_PUBLIC_MAP_TILE_URL,
    sentryDsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
  });

  const supabase = await createClient();

  const [summaryResult, revenueResult, pendingResult, mediaResult] = await Promise.all([
    supabase.rpc("platform_summary", {
      p_from: period.from.toISOString(),
      p_to: period.to.toISOString(),
    }),
    // Pengarna hämtas separat och per valuta. Se migration 0020: en summa över
    // BAM, EUR och RSD är inte ett belopp, den bara ser ut som ett.
    supabase.rpc("platform_revenue_by_currency", {
      p_from: period.from.toISOString(),
      p_to: period.to.toISOString(),
    }),
    supabase
      .from("restaurants")
      .select("id, name, city, org_number, created_at")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true }),
    supabase
      .from("media")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING"),
  ]);

  const row = Array.isArray(summaryResult.data) ? summaryResult.data[0] : null;
  const summary = {
    restaurantsTotal: Number(row?.restaurants_total ?? 0),
    restaurantsActive: Number(row?.restaurants_active ?? 0),
    restaurantsPending: Number(row?.restaurants_pending ?? 0),
    ordersCount: Number(row?.orders_count ?? 0),
  };

  interface RevenueRow {
    currency: CurrencyCode;
    ordersCount: number;
    gmvOre: number;
    burpRevenueOre: number;
    tipsOre: number;
  }

  const revenue: RevenueRow[] = (
    (revenueResult.data as Record<string, unknown>[] | null) ?? []
  ).map((line) => ({
    currency: line.currency as CurrencyCode,
    ordersCount: Number(line.orders_count ?? 0),
    gmvOre: Number(line.gmv_ore ?? 0),
    burpRevenueOre: Number(line.burp_revenue_ore ?? 0),
    tipsOre: Number(line.tips_ore ?? 0),
  }));

  const tipsTotal = revenue.filter((line) => line.tipsOre > 0);

  const pending = pendingResult.data ?? [];
  const pendingMedia = mediaResult.count ?? 0;

  return (
    <>
      <PlatformHeader admin={admin} current="oversikt" />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-4xl">Översikt</h1>
          <nav className="flex gap-2" aria-label="Period">
            {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
              <Link
                key={key}
                href={`/backoffice?period=${key}`}
                aria-current={key === periodKey ? "page" : undefined}
                className={`min-h-9 px-3.5 py-1.5 text-sm ${
                  key === periodKey
                    ? "bg-burp-600 font-medium text-white"
                    : "border border-[var(--rule)]"
                }`}
              >
                {PERIODS[key].label}
              </Link>
            ))}
          </nav>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <Stat label="Beställningar" value={String(summary.ordersCount)} />
          <Stat
            label="Aktiva restauranger"
            value={String(summary.restaurantsActive)}
            hint={`av ${summary.restaurantsTotal} totalt`}
          />
        </section>

        {/*
          En rad per valuta, aldrig en totalsumma.

          Burp finns i Bosnien, Kroatien och Serbien. Bosniska fening, euro-cent
          och dinarer går inte att lägga ihop utan en växelkurs, och en kurs som
          plockas ur luften gör siffran sämre än ingen siffra alls. Behövs ett
          samlat tal krävs ett beslut om vilken kurs som gäller och när den
          låstes — se docs/OPEN-QUESTIONS.md.
        */}
        <section className="mt-8">
          <h2 className="font-display text-2xl">Omsättning per valuta</h2>

          {revenue.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={ChartNoAxesColumn}
                title="Inga genomförda beställningar under perioden"
                body="Omsättningen redovisas per valuta och räknas först när en order slutförts."
              />
            </div>
          ) : (
            <ul className="card mt-3 divide-y divide-[var(--rule)]">
              {revenue.map((line) => (
                <li key={line.currency} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-semibold">{line.currency}</span>
                    <span className="text-sm opacity-60">
                      {line.ordersCount}{" "}
                      {line.ordersCount === 1 ? "beställning" : "beställningar"}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="flex justify-between">
                      <dt className="opacity-60">Omsättning</dt>
                      <dd className="tabular-nums">{formatMoney(line.gmvOre, line.currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="opacity-60">Burps intäkt</dt>
                      <dd className="tabular-nums">
                        {formatMoney(line.burpRevenueOre, line.currency)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Dricksen syns här enbart för att den passerar plattformen. Den är
            personalens pengar och ingår varken i GMV eller i Burps intäkt. */}
        {tipsTotal.length > 0 ? (
          <p className="mt-3 text-sm opacity-60">
            Dricks som passerat plattformen:{" "}
            {tipsTotal.map((line) => formatMoney(line.tipsOre, line.currency)).join(" · ")}. Går
            oavkortat till restaurangernas personal och ingår inte i siffrorna ovan.
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="font-display text-2xl">Väntar på dig</h2>
          <ul className="card mt-3 divide-y divide-[var(--rule)]">
            <li className="flex items-center gap-4 px-4 py-3">
              <span className="mr-auto">Restauranger som väntar på godkännande</span>
              <span className="tabular-nums font-semibold">{pending.length}</span>
              {pending.length > 0 ? (
                <Link
                  href="/backoffice/restauranger?status=PENDING"
                  className="btn btn-primary"
                >
                  Granska
                </Link>
              ) : null}
            </li>
            <li className="flex items-center gap-4 px-4 py-3">
              <span className="mr-auto">Media som väntar på granskning</span>
              <span className="tabular-nums font-semibold">{pendingMedia}</span>
            </li>
          </ul>

          {pending.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {pending.map((restaurant) => (
                <li
                  key={restaurant.id}
                  className="border border-[var(--rule)] px-4 py-3"
                >
                  <p className="font-medium">{restaurant.name}</p>
                  <p className="text-sm opacity-60">
                    {restaurant.city} · org.nr {restaurant.org_number} · ansökte{" "}
                    {new Date(restaurant.created_at).toLocaleDateString("sv-SE")}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/*
          Andra faktorn för Burps egen personal.

          Ligger på översikten och inte på en egen sida därför att backoffice
          inte har några inställningar i övrigt — en sida med ett enda kort
          hade varit ett skal. Texterna skickas in som svenska med
          `untranslatedSurface()`: en plattformsadmin är inte personal någonstans
          och har ingen `staff.locale` att läsa.
        */}
        {/*
          Systemstatus.

          Ligger före "Din inloggning" med flit: det första en plattformsadmin
          behöver veta är om produkten fungerar, inte om hens eget konto gör
          det. Tvåstegsverifieringen låg död i tio dagar utan att någonting i
          produkten sa det — den här ytan finns för att det inte ska kunna
          hända igen på en nyckel som saknas.
        */}
        <section className="mt-8">
          <h2 className="font-display text-2xl">Systemstatus</h2>
          <p className="mt-1 text-sm opacity-60">
            Vad som faktiskt är påslaget i den här miljön. En funktion kan vara
            fullt byggd och ändå avstängd på en rad i miljön — och det syns
            annars ingenstans.
          </p>
          <SystemStatus capabilities={status} summary={summarise(status)} />
        </section>

        <section className="mt-8">
          <h2 className="font-display text-2xl">Din inloggning</h2>
          <p className="mt-1 text-sm opacity-60">
            Ett konto här ser varje restaurangs order, avgifter och avräkning. Andra
            faktorn gäller i databasen och inte bara i gränssnittet — se migration 0051.
          </p>
          <MfaSettings labels={mfaLabels(untranslatedSurface().staff.settings)} />
        </section>

        {/*
          Support-åtgärden, och bara för admin och ägare.

          Den som kan ta bort någon annans andra faktor kan också ta bort en
          restaurangägares. `resetMfaFactors()` kräver därför samma roller som
          övriga skrivningar här, och prövningen sker i serveråtgärden — den
          här flaggan avgör bara om formuläret ritas.
        */}
        {admin.role === "support" ? null : (
          <section className="mt-8">
            <h2 className="font-display text-2xl">Återställ tvåstegsverifiering</h2>
            <p className="mt-1 text-sm opacity-60">
              För den som bytt telefon och inte längre kommer åt sin kod.
            </p>
            <MfaReset />
          </section>
        )}

        <p className="mt-8 text-sm opacity-60">
          Burps intäkt räknas på avgiftsraderna som faktiskt skrevs, inte på dagens procentsats.
          Betalleverantörens kortavgift ingår inte — se docs/OPEN-QUESTIONS.md fråga 1.
        </p>
      </main>
    </>
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
