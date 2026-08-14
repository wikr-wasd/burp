import type { Metadata } from "next";
import Link from "next/link";
import { formatOre } from "@burp/core";
import { PlatformHeader } from "@/components/platform/platform-header";
import { requirePlatformAdmin } from "@/lib/platform";
import { periodFor, PERIODS, type PeriodKey } from "@/lib/statistics";
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

function isPeriodKey(value: string | undefined): value is PeriodKey {
  return value === "idag" || value === "vecka" || value === "manad";
}

export default async function BackofficePage({ searchParams }: PageProps) {
  const admin = await requirePlatformAdmin();
  const params = await searchParams;

  const periodKey: PeriodKey = isPeriodKey(params.period) ? params.period : "manad";
  const period = periodFor(periodKey);

  const supabase = await createClient();

  const [summaryResult, pendingResult, mediaResult] = await Promise.all([
    supabase.rpc("platform_summary", {
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
    gmvOre: Number(row?.gmv_ore ?? 0),
    burpRevenueOre: Number(row?.burp_revenue_ore ?? 0),
    tipsOre: Number(row?.tips_ore ?? 0),
  };

  const pending = pendingResult.data ?? [];
  const pendingMedia = mediaResult.count ?? 0;

  return (
    <>
      <PlatformHeader admin={admin} current="oversikt" />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold">Översikt</h1>
          <nav className="flex gap-2" aria-label="Period">
            {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
              <Link
                key={key}
                href={`/backoffice?period=${key}`}
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

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Omsättning på plattformen"
            value={formatOre(summary.gmvOre)}
            hint="det gästerna betalade"
          />
          <Stat
            label="Burps intäkt"
            value={formatOre(summary.burpRevenueOre)}
            hint="avgifter, exkl. kortavgift"
          />
          <Stat label="Beställningar" value={String(summary.ordersCount)} />
          <Stat
            label="Aktiva restauranger"
            value={String(summary.restaurantsActive)}
            hint={`av ${summary.restaurantsTotal} totalt`}
          />
        </section>

        {/* Dricksen syns här enbart för att den passerar plattformen. Den är
            personalens pengar och ingår varken i GMV eller i Burps intäkt. */}
        {summary.tipsOre > 0 ? (
          <p className="mt-3 text-sm opacity-60">
            Dricks som passerat plattformen: {formatOre(summary.tipsOre)}. Går oavkortat till
            restaurangernas personal och ingår inte i siffrorna ovan.
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Väntar på dig</h2>
          <ul className="mt-3 divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">
            <li className="flex items-center gap-4 px-4 py-3">
              <span className="mr-auto">Restauranger som väntar på godkännande</span>
              <span className="tabular-nums font-semibold">{pending.length}</span>
              {pending.length > 0 ? (
                <Link
                  href="/backoffice/restauranger?status=PENDING"
                  className="rounded-md bg-burp-600 px-3 py-1.5 text-sm font-medium text-white"
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
                  className="rounded-lg border border-black/10 px-4 py-3 dark:border-white/15"
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
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <p className="text-sm opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs opacity-50">{hint}</p> : null}
    </div>
  );
}
