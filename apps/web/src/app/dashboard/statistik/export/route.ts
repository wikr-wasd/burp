import { csvAmount, csvFilename, csvHeaders, toCsv } from "@/lib/csv";
import { requireStaff } from "@/lib/auth";
import { getStatistics, periodFor, PERIODS, type PeriodKey } from "@/lib/statistics";

/**
 * Statistiken som CSV.
 *
 * Egen rutt och ingen serveråtgärd: en nedladdning är ett svar med
 * `Content-Disposition`, och det kan bara en route handler ge. Åtkomsten är
 * densamma som sidans — `requireStaff(["owner", "manager"])`. Avgifter är inte
 * personalens sak, och `fees` är dessutom stängd för dem i RLS.
 *
 * Siffrorna hämtas med `getStatistics()`, alltså samma funktion som sidan
 * ritar. En egen fråga här hade varit en andra kopia som glider isär, och då
 * visar exporten andra tal än skärmen — utan att någon märker vilken som har
 * rätt.
 */

function isPeriodKey(value: string | null): value is PeriodKey {
  return value === "idag" || value === "vecka" || value === "manad";
}

export async function GET(request: Request) {
  const staff = await requireStaff(["owner", "manager"]);

  const requested = new URL(request.url).searchParams.get("period");
  const periodKey: PeriodKey = isPeriodKey(requested) ? requested : "vecka";
  const period = periodFor(periodKey);

  const { summary, topItems, tableRevenue, vat, prepTimes } = await getStatistics(
    staff.restaurantId,
    period,
  );

  const money = (ore: number) => csvAmount(ore, staff.currency);

  /*
   * Ett avsnitt per fråga, inte en bred tabell.
   *
   * Rätterna, borden och momssatserna har olika antal rader och olika kolumner.
   * Pressade in i en enda tabell blir varje rad mest tomma celler, och den som
   * ska summera en kolumn i Sheets får summera runt hålen.
   */
  const rows: (string | number | null)[][] = [
    ["Burp — statistik"],
    ["Restaurang", staff.restaurantName],
    ["Period", PERIODS[periodKey].label],
    ["Från", period.from.toISOString()],
    ["Till", period.to.toISOString()],
    ["Valuta", staff.currency],
    [],

    ["Sammanfattning"],
    ["Nyckeltal", "Belopp"],
    ["Antal order", summary.ordersCount],
    ["Mat och dryck inkl. moms", money(summary.itemsGrossOre)],
    ["Varav moms", money(summary.itemsVatOre)],
    ["Mat och dryck exkl. moms", money(summary.itemsNetOre)],
    ["Dricks till personalen", money(summary.tipsOre)],
    ["Burps avgift", money(summary.feesOre)],
    ["Snittorder", money(summary.avgOrderOre)],
    [],

    ["Moms per sats"],
    ["Sats", "Moms"],
    ...vat.map((line) => [`${(line.vatRateBps / 100).toFixed(2)} %`, money(line.vatOre)]),
    [],

    ["Mest sålda"],
    ["Rätt", "Antal", "Summa inkl. moms"],
    ...topItems.map((item) => [item.name, item.quantity, money(item.grossOre)]),
    [],

    ["Omsättning per bord"],
    ["Bord", "Zon", "Antal order", "Summa inkl. moms"],
    ...tableRevenue.map((table) => [
      table.tableNumber,
      table.zone,
      table.ordersCount,
      money(table.grossOre),
    ]),
    [],

    ["Tillagningstid"],
    ["Mätta order", prepTimes.measuredOrders],
    ["Median, sekunder", prepTimes.medianSeconds],
  ];

  return new Response(toCsv(rows), {
    headers: csvHeaders(csvFilename(["burp", "statistik", staff.restaurantSlug, periodKey])),
  });
}
