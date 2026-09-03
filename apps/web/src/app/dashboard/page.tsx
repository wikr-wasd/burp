import type { Metadata } from "next";
import Link from "next/link";
import { ChefHat, LayoutGrid, Receipt, Utensils } from "lucide-react";
import { formatMoney } from "@burp/core";
import { FloorPlanView } from "@/components/staff/floor-plan-view";
import { StaffShell } from "@/components/staff/staff-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth";
import { dictionary, fill, LOCALE_DATE_TAGS, type Dictionary } from "@/lib/i18n";
import { getActiveOrders, type KitchenOrder } from "@/lib/orders";
import { getTableSnapshots, type TableSnapshot, type TableState } from "@/lib/overview";
import { getStatistics, periodFor } from "@/lib/statistics";

/**
 * Översikten — det första personalen ser efter inloggning.
 *
 * Sidan svarar på en enda fråga: hur ser det ut just nu? Dagens siffror, vad
 * köket har framför sig och vilka bord som är upptagna. Allt annat är en klick
 * bort i menyn.
 *
 * Ingenting räknas här. Nyckeltalen kommer ur `restaurant_revenue_summary`
 * (migration 0014) och bordens läge härleds ur notor och orderstatus. En
 * översikt som summerar själv blir en andra sanning bredvid statistiksidan,
 * och två sanningar om samma dag är värre än en.
 */

export const metadata: Metadata = {
  title: "Översikt",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Statusarna som får en egen kolumn, i den ordning en order rör sig. */
/**
 * Köets fyra kolumner.
 *
 * Bär bara status och färg. Rubriken slås upp i `staff.status`, samma tabell
 * som köksskärmen läser. Kolumnerna hade tidigare egna ord — "Ny" och
 * "Accepterad" — medan köksskärmen samtidigt kallade samma tillstånd "Lagd"
 * och "Mottagen". Två namn på ett tillstånd är inte en nyans utan en fråga
 * personalen får ställa varandra, och de läser båda skärmarna samma pass.
 */
const COLUMNS: { status: KitchenOrder["status"]; dot: string }[] = [
  { status: "PLACED", dot: "bg-burp-600" },
  { status: "ACCEPTED", dot: "bg-gold-600" },
  { status: "PREPARING", dot: "bg-gold-400" },
  { status: "READY", dot: "bg-green-600" },
];

/**
 * Bordens fyra tillstånd, med färg men utan ord.
 *
 * Orden låg här OCH i `floor-plan-view.tsx` — två tabeller över samma fyra
 * färgade rutor, som kunde säga olika saker beroende på om man tittade på
 * ritningen eller på rutnätet bredvid den. Båda läser nu ordboken.
 */
const TABLE_STATES: { state: TableState; cell: string; swatch: string }[] = [
  {
    state: "LEDIGT",
    cell: "bg-[var(--background)] text-[var(--muted)]",
    swatch: "bg-[var(--rule)]",
  },
  {
    state: "OPPEN_NOTA",
    cell: "bg-gold-400/20 text-[var(--foreground)]",
    swatch: "bg-gold-400",
  },
  {
    state: "BESTALLNING",
    cell: "bg-burp-600 text-white",
    swatch: "bg-burp-600",
  },
  // Sist i listan för att det är den som kräver ett steg. Ordningen i
  // teckenförklaringen läses som en ordning i angelägenhet.
  {
    state: "SERVERAS",
    cell: "bg-green-600 text-white",
    swatch: "bg-green-600",
  },
];

export default async function OverviewPage() {
  const staff = await requireStaff(["owner", "manager", "staff"]);

  const [{ due }, { tables, floorPlans }, statistics] = await Promise.all([
    getActiveOrders(staff.restaurantId),
    getTableSnapshots(staff.restaurantId),
    getStatistics(staff.restaurantId, periodFor("idag")),
  ]);

  // Borden som ligger utanför varje ritning. De visas som rutor bredvid —
  // ett bord med en öppen nota måste synas någonstans.
  const placedIds = new Set(
    tables.filter((table) => table.floorPlanId !== null && table.x !== null).map((t) => t.id),
  );
  const unplacedTables = tables.filter((table) => !placedIds.has(table.id));

  const today = new Intl.DateTimeFormat(LOCALE_DATE_TAGS[staff.locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: staff.timeZone,
  }).format(new Date());

  const busyTables = tables.filter((table) => table.state !== "LEDIGT").length;
  const t = dictionary(staff.locale).staff;

  return (
    <StaffShell
      staff={staff}
      current="oversikt"
      title={t.section.oversikt}
      intro={capitalize(today)}
      actions={
        <>
          <Link href="/dashboard/order" className="btn btn-secondary">
            <Receipt size={16} aria-hidden="true" />
            {t.section.order}
          </Link>
          <Link href="/kok" className="btn btn-primary">
            <ChefHat size={16} aria-hidden="true" />
            {t.section.kok}
          </Link>
        </>
      }
    >
      {/*
        Fyra tal, inte tolv.

        Statistiksidan finns för den som vill gräva. Det här är raden man
        tittar på i förbifarten, och den bär bara sådant som går att agera på
        under dagen. Dricksen står med därför att den inte är restaurangens
        pengar — den ska synas skild från omsättningen, inte gömd i den.
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.overview.statOrders} value={String(statistics.summary.ordersCount)} />
        <Stat
          label={t.overview.statRevenue}
          value={formatMoney(statistics.summary.itemsGrossOre, staff.currency)}
        />
        <Stat
          label={t.overview.statAverage}
          value={formatMoney(statistics.summary.avgOrderOre, staff.currency)}
        />
        <Stat
          label={t.overview.statTips}
          value={formatMoney(statistics.summary.tipsOre, staff.currency)}
          hint={t.overview.statTipsHint}
        />
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl">{t.overview.inKitchen}</h2>
            <Link href="/dashboard/order" className="link text-sm whitespace-nowrap">
              {t.overview.allOrders}
            </Link>
          </div>

          {due.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={Utensils}
                title={t.overview.noOrdersTitle}
                body={t.overview.noOrdersBody}
              />
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((column) => {
                const orders = due.filter((order) => order.status === column.status);

                return (
                  <div key={column.status}>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${column.dot}`}
                      />
                      {t.status[column.status]}
                      <span className="text-[var(--muted)] tabular-nums">{orders.length}</span>
                    </p>

                    <ul className="mt-2 space-y-2">
                      {orders.map((order) => (
                        <li key={order.id} className="card p-3">
                          <p className="text-sm font-medium">
                            {order.tableNumber
                              ? fill(t.orderType.table, { number: order.tableNumber })
                              : t.orderType.PICKUP}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                            {order.items
                              .map((item) => `${item.quantity}× ${item.name}`)
                              .join(", ")}
                          </p>
                          <p className="mt-1.5 text-xs tabular-nums text-[var(--muted)]">
                            {formatMoney(order.totalOre, staff.currency)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl">{t.overview.tables}</h2>
            <p className="text-sm text-[var(--muted)] tabular-nums">
              {fill(t.overview.tablesBusy, { busy: busyTables, total: tables.length })}
            </p>
          </div>

          {tables.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={LayoutGrid}
                title={t.overview.noTablesTitle}
                body={t.overview.noTablesBody}
                action={
                  <Link href="/dashboard/bord" className="btn btn-primary">
                    {t.overview.noTablesAction}
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              {/*
                Planritningen först när den finns.

                Ett rutnät säger vilket bord som ropar men inte var det står.
                Ritningen gör "bord 7 väntar" till en punkt att gå till — och
                det är hela skälet att den byggdes.
              */}
              {floorPlans.map((plan) => (
                <FloorPlanView
                  key={plan.id}
                  plan={plan}
                  tables={tables}
                  labels={t.overview}
                  tableLabel={t.orderType.table}
                />
              ))}

              {/*
                Rutnätet står kvar för borden som inte är utplacerade. Att gissa
                en plats åt dem hade betytt att ritningen ljuger; att dölja dem
                hade betytt att ett bord med en öppen nota inte syns någonstans.
              */}
              {unplacedTables.length > 0 ? (
                <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-4">
                  {unplacedTables.map((table) => (
                    <TableCell
                      key={table.id}
                      table={table}
                      labels={t.overview}
                      tableLabel={t.orderType.table}
                    />
                  ))}
                </ul>
              ) : null}

              {/* Färgerna betyder ingenting utan den här listan. En rutnätsvy
                  utan teckenförklaring är en gåta, inte en översikt. */}
              <ul className="mt-3 space-y-1">
                {TABLE_STATES.map((entry) => (
                  <li
                    key={entry.state}
                    className="flex items-center gap-2 text-xs text-[var(--muted)]"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-[2px] ${entry.swatch}`}
                    />
                    {t.overview[`state${entry.state}`]}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </StaffShell>
  );
}

function TableCell({
  table,
  labels,
  tableLabel,
}: {
  table: TableSnapshot;
  labels: Dictionary["staff"]["overview"];
  tableLabel: string;
}) {
  const state = TABLE_STATES.find((entry) => entry.state === table.state)!;
  const stateLabel = labels[`state${table.state}`];

  return (
    <li>
      {/*
        Rutan är en länk till bordets nota, precis som bordet i ritningen.
        Borden utanför en ritning ska svara på samma klick — annars beror det
        på var någon råkat placera bordet om det går att öppna.
      */}
      <Link
        href={`/dashboard/bord/${table.id}`}
        className={`grid aspect-square place-items-center rounded-[0.5rem] text-sm font-semibold transition-opacity duration-[var(--speed)] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600 ${state.cell}`}
        // Färgen ensam räcker inte — den som inte skiljer färgerna åt behöver
        // texten, och den som hovrar slipper gissa.
        title={`${fill(tableLabel, { number: table.tableNumber })}${
          table.zone ? ` · ${table.zone}` : ""
        } — ${stateLabel}`}
      >
        {table.tableNumber}
        <span className="sr-only">{stateLabel}</span>
      </Link>
    </li>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

/** "torsdag 16 augusti 2026" → "Torsdag 16 augusti 2026". */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
