import { type CurrencyCode } from "@burp/core";
import { csvAmount, csvFilename, csvHeaders, toCsv } from "@/lib/csv";
import { requireStaff } from "@/lib/auth";
import {
  currentMonthKey,
  formatMonth,
  getSettlementPreview,
  listSettlements,
  monthBounds,
} from "@/lib/settlements";

/**
 * Avräkningen som CSV — det underlag en bokföring faktiskt vill ha.
 *
 * Samma två anrop som sidan gör, av samma skäl som statistikexporten: en egen
 * fråga här hade blivit en andra kopia, och två uträkningar av vad
 * restaurangen är skyldig Burp får aldrig kunna svara olika.
 *
 * Beloppen skrivs i varje avräknings EGEN valuta. En stängd period bär den
 * valuta den stängdes i (migration 0039), och belopp i olika valutor summeras
 * aldrig — samma regel som plattformsöversikten följer.
 */

export async function GET() {
  const staff = await requireStaff(["owner", "manager"]);

  const thisMonth = currentMonthKey(staff.timeZone);
  const [running, settlements] = await Promise.all([
    getSettlementPreview(staff.restaurantId, monthBounds(thisMonth)),
    listSettlements(staff.restaurantId),
  ]);

  const runningCurrency = (running.currency ?? staff.currency) as CurrencyCode;

  const rows: (string | number | null)[][] = [
    ["Burp — avräkning"],
    ["Restaurang", staff.restaurantName],
    ["Uttagen", new Date().toISOString()],
    [],

    [`Hittills i ${formatMonth(thisMonth)} — inte stängd`],
    ["Post", "Belopp", "Valuta"],
    ["Antal order", running.ordersCount, ""],
    ["Mat och dryck inkl. moms", csvAmount(running.grossOre, runningCurrency), runningCurrency],
    ["Dricks", csvAmount(running.tipsOre, runningCurrency), runningCurrency],
    ["Betalt kontant", csvAmount(running.cashOre, runningCurrency), runningCurrency],
    ["Återbetalt", csvAmount(running.refundsOre, runningCurrency), runningCurrency],
    ["Burps avgift", csvAmount(running.feesOre, runningCurrency), runningCurrency],
    ["Krediterad avgift", csvAmount(running.feeCreditOre, runningCurrency), runningCurrency],
    ["Att betala", csvAmount(running.amountDueOre, runningCurrency), runningCurrency],
    [],

    ["Stängda perioder"],
    [
      "Period",
      "Status",
      "Fakturanummer",
      "Antal order",
      "Mat och dryck inkl. moms",
      "Dricks",
      "Kontant",
      "Återbetalt",
      "Avgift",
      "Krediterad avgift",
      "Att betala",
      "Valuta",
      "Fakturerad",
      "Betald",
      "Makulerad",
    ],
    ...settlements.map((s) => [
      `${s.periodStart} – ${s.periodEnd}`,
      s.status,
      s.invoiceNumber,
      s.ordersCount,
      csvAmount(s.grossOre, s.currency),
      csvAmount(s.tipsOre, s.currency),
      csvAmount(s.cashOre, s.currency),
      csvAmount(s.refundsOre, s.currency),
      csvAmount(s.feesOre, s.currency),
      csvAmount(s.feeCreditOre, s.currency),
      csvAmount(s.amountDueOre, s.currency),
      s.currency,
      s.invoicedAt,
      s.paidAt,
      s.voidedAt,
    ]),
  ];

  return new Response(toCsv(rows), {
    headers: csvHeaders(csvFilename(["burp", "avrakning", staff.restaurantSlug, thisMonth])),
  });
}
