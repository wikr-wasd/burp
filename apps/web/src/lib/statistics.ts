import "server-only";

import { createClient } from "./supabase/server";

/**
 * Statistik och ekonomiunderlag (avsnitt 11).
 *
 * Alla aggregat räknas i databasen (migration 0014). Den här filen översätter
 * bara svaren till appens språk. Frestelsen att hämta hem orderraderna och
 * summera i JavaScript är stor tills en restaurang har tusen order i veckan —
 * och då syns felet först när det gör som mest ont.
 *
 * Funktionerna körs med anroparens rättigheter, så RLS avgör vad som räknas.
 * En chef ser sin restaurang och ingen annans utan att den här filen behöver
 * veta om det.
 */

export interface Period {
  from: Date;
  to: Date;
}

export interface RevenueSummary {
  ordersCount: number;
  itemsGrossOre: number;
  itemsVatOre: number;
  itemsNetOre: number;
  tipsOre: number;
  feesOre: number;
  avgOrderOre: number;
}

export interface TopItem {
  name: string;
  quantity: number;
  grossOre: number;
}

export interface TableRevenue {
  tableNumber: string;
  zone: string | null;
  ordersCount: number;
  grossOre: number;
}

export interface PrepTimes {
  measuredOrders: number;
  medianSeconds: number;
  p90Seconds: number;
}

export interface VatLine {
  vatRateBps: number;
  vatOre: number;
}

export interface Statistics {
  summary: RevenueSummary;
  topItems: TopItem[];
  tableRevenue: TableRevenue[];
  prepTimes: PrepTimes;
  vat: VatLine[];
}

const EMPTY_SUMMARY: RevenueSummary = {
  ordersCount: 0,
  itemsGrossOre: 0,
  itemsVatOre: 0,
  itemsNetOre: 0,
  tipsOre: 0,
  feesOre: 0,
  avgOrderOre: 0,
};

export async function getStatistics(restaurantId: string, period: Period): Promise<Statistics> {
  const supabase = await createClient();

  const args = {
    p_restaurant_id: restaurantId,
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
  };

  // Fem oberoende frågor, alltså parallellt. I följd blir sidladdningen fem
  // rundturer lång utan att någon av dem behöver den föregåendes svar.
  const [summary, topItems, tableRevenue, prepTimes, vat] = await Promise.all([
    supabase.rpc("restaurant_revenue_summary", args),
    supabase.rpc("restaurant_top_items", { ...args, p_limit: 10 }),
    supabase.rpc("restaurant_table_revenue", args),
    supabase.rpc("restaurant_prep_times", args),
    supabase.rpc("restaurant_vat_breakdown", args),
  ]);

  // Postgres returnerar `bigint` som sträng i JSON — ett tal över 2^53 kan
  // inte representeras exakt i JavaScript. Beloppen här ryms med marginal,
  // men Number() måste ändå tillämpas explicit i stället för att anta att
  // klienten fick ett tal.
  const summaryRow = firstRow(summary.data);

  return {
    summary: summaryRow
      ? {
          ordersCount: Number(summaryRow["orders_count"] ?? 0),
          itemsGrossOre: Number(summaryRow["items_gross_ore"] ?? 0),
          itemsVatOre: Number(summaryRow["items_vat_ore"] ?? 0),
          itemsNetOre: Number(summaryRow["items_net_ore"] ?? 0),
          tipsOre: Number(summaryRow["tips_ore"] ?? 0),
          feesOre: Number(summaryRow["fees_ore"] ?? 0),
          avgOrderOre: Number(summaryRow["avg_order_ore"] ?? 0),
        }
      : EMPTY_SUMMARY,

    topItems: rows(topItems.data).map((row) => ({
      name: String(row["name"]),
      quantity: Number(row["quantity"] ?? 0),
      grossOre: Number(row["gross_ore"] ?? 0),
    })),

    tableRevenue: rows(tableRevenue.data).map((row) => ({
      tableNumber: String(row["table_number"]),
      zone: (row["zone"] as string | null) ?? null,
      ordersCount: Number(row["orders_count"] ?? 0),
      grossOre: Number(row["gross_ore"] ?? 0),
    })),

    prepTimes: (() => {
      const row = firstRow(prepTimes.data);
      return {
        measuredOrders: Number(row?.["measured_orders"] ?? 0),
        medianSeconds: Number(row?.["median_seconds"] ?? 0),
        p90Seconds: Number(row?.["p90_seconds"] ?? 0),
      };
    })(),

    vat: rows(vat.data).map((row) => ({
      vatRateBps: Number(row["vat_rate_bps"] ?? 0),
      vatOre: Number(row["vat_ore"] ?? 0),
    })),
  };
}

/**
 * Perioder dashboarden erbjuder.
 *
 * Dygnsgränserna räknas i svensk tid, inte UTC. En restaurang som stänger
 * 23:00 vill se "i dag" fram till midnatt lokalt — inte fram till 01:00 eller
 * 02:00 beroende på sommartid.
 */
export const PERIODS = {
  idag: { label: "I dag", days: 1 },
  vecka: { label: "7 dagar", days: 7 },
  manad: { label: "30 dagar", days: 30 },
  /*
   * Kvartalet.
   *
   * Nittio dagar är vad som behövs för att se ett mönster som inte är en vecka
   * — säsong, en kampanj som tog, en månad som avvek. Demodatan sträcker sig
   * lika långt av samma skäl: en yta som bara kan visa trettio dagar går inte
   * att bedöma på trettio dagars data.
   */
  kvartal: { label: "90 dagar", days: 90 },
} as const;

export type PeriodKey = keyof typeof PERIODS;

/**
 * Är strängen ur adressfältet en period vi känner igen?
 *
 * Låg som FYRA kopior — statistiken, händelserna, exporten och
 * plattformsöversikten — var och en med de tre nycklarna inskrivna för hand.
 * En ny period hade alltså lagts till i PERIODS och tyst inte fungerat på
 * någon av ytorna, eftersom varje kontroll avvisade den som okänd.
 *
 * Härledd ur PERIODS, så att listan bara finns på ett ställe.
 */
export function isPeriodKey(value: string | null | undefined): value is PeriodKey {
  return value !== null && value !== undefined && Object.hasOwn(PERIODS, value);
}

export function periodFor(key: PeriodKey, now = new Date()): Period {
  const days = PERIODS[key].days;

  // Slutet av innevarande dygn i Europe/Stockholm, uttryckt i UTC.
  const stockholmDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // sv-SE ger redan ÅÅÅÅ-MM-DD, vilket gör datumsträngen direkt användbar.
  const startOfToday = zonedMidnight(stockholmDate);
  const to = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  return { from, to };
}

/**
 * Midnatt i Europe/Stockholm för ett givet datum, som ett UTC-ögonblick.
 *
 * Sverige växlar mellan +01:00 och +02:00. Att hårdkoda något av dem gör
 * statistiken en timme fel halva året, vilket är precis tillräckligt lite för
 * att ingen ska upptäcka det förrän bokföringen inte stämmer.
 */
function zonedMidnight(isoDate: string): Date {
  // Utgå från UTC-midnatt och korrigera med zonens faktiska förskjutning.
  const utcMidnight = new Date(`${isoDate}T00:00:00Z`);

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    timeZoneName: "longOffset",
  }).formatToParts(utcMidnight);

  const offset = formatted.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset);

  if (!match) return utcMidnight;

  const sign = match[1] === "-" ? -1 : 1;
  const minutes = sign * (Number(match[2]) * 60 + Number(match[3]));

  return new Date(utcMidnight.getTime() - minutes * 60_000);
}

function rows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const list = rows(data);
  return list.length > 0 ? list[0]! : null;
}
