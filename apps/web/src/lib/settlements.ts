import "server-only";

import type { CurrencyCode } from "@burp/core";
import type {
  MonthBounds,
  Settlement,
  SettlementNumbers,
  SettlementPreview,
  SettlementStatus,
} from "./settlement-period";
import { createClient } from "./supabase/server";

/**
 * Avräkning — vad restaurangen är skyldig Burp för en period (migration 0039).
 *
 * Under väg A i öppen fråga 5 betalar gästen restaurangen direkt och Burp rör
 * aldrig pengarna. Det finns alltså ingen utbetalning från Burp; det som finns
 * är en fordran på avgiften, och den faktureras i efterhand ur `fees`.
 *
 * Uträkningen ligger i databasen (`settlement_preview`), inte här. Samma skäl
 * som statistiken: en kopia i JavaScript hade visat en annan summa än den som
 * hamnar på fakturan så fort någon rörde den ena.
 *
 * Modellen och periodräkningen ligger i `settlement-period.ts` och är fri från
 * `server-only` — sifferuppställningen renderas inuti en klientkomponent.
 */

export * from "./settlement-period";

const SETTLEMENT_COLUMNS =
  "id, restaurant_id, period_start, period_end, currency, orders_count, gross_ore, " +
  "tips_ore, cash_ore, fees_ore, refunds_ore, fee_credit_ore, amount_due_ore, status, " +
  "invoice_number, note, invoiced_at, paid_at, voided_at";

const EMPTY_PREVIEW: SettlementPreview = {
  currency: null,
  ordersCount: 0,
  grossOre: 0,
  tipsOre: 0,
  cashOre: 0,
  feesOre: 0,
  refundsOre: 0,
  feeCreditOre: 0,
  amountDueOre: 0,
};

export async function getSettlementPreview(
  restaurantId: string,
  bounds: MonthBounds,
): Promise<SettlementPreview> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("settlement_preview", {
    p_restaurant_id: restaurantId,
    p_period_start: bounds.start,
    p_period_end: bounds.end,
  });

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!row) return EMPTY_PREVIEW;

  return {
    currency: (row["currency"] as CurrencyCode | null) ?? null,
    ...numbersFrom(row),
  };
}

export async function listSettlements(restaurantId: string): Promise<Settlement[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("settlements")
    .select(SETTLEMENT_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .order("period_start", { ascending: false });

  return rows(data).map(toSettlement);
}

export interface PlatformSettlementRow extends SettlementNumbers {
  restaurantId: string;
  restaurantName: string;
  currency: CurrencyCode | null;
  /** Satt när perioden redan är stängd för den här restaurangen. */
  settlementId: string | null;
  settlementStatus: SettlementStatus | null;
}

export async function listPlatformPreview(bounds: MonthBounds): Promise<PlatformSettlementRow[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("platform_settlement_preview", {
    p_period_start: bounds.start,
    p_period_end: bounds.end,
  });

  return rows(data).map((row) => ({
    restaurantId: String(row["restaurant_id"]),
    restaurantName: String(row["restaurant_name"]),
    currency: (row["currency"] as CurrencyCode | null) ?? null,
    settlementId: (row["settlement_id"] as string | null) ?? null,
    settlementStatus: (row["settlement_status"] as SettlementStatus | null) ?? null,
    ...numbersFrom(row),
  }));
}

/**
 * Alla avräkningar som täcker exakt den här perioden.
 *
 * Backoffice visar de LAGRADE siffrorna för en stängd period, inte
 * förhandsvisningens. En avräkning som skickats är ett underlag någon fått i
 * handen; att visa en omräkning bredvid statusen "Fakturerad" hade lämnat
 * frågan om vilken av dem som gäller obesvarad.
 */
export async function listSettlementsForPeriod(bounds: MonthBounds): Promise<Settlement[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("settlements")
    .select(SETTLEMENT_COLUMNS)
    .eq("period_start", bounds.start)
    .eq("period_end", bounds.end);

  return rows(data).map(toSettlement);
}

/** Alla avräkningar över hela plattformen, nyast först. */
export async function listAllSettlements(limit = 100): Promise<Settlement[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("settlements")
    .select(`${SETTLEMENT_COLUMNS}, restaurants!inner (name)`)
    .order("period_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return rows(data).map((row) => ({
    ...toSettlement(row),
    restaurantName: (row["restaurants"] as { name: string } | null)?.name,
  }));
}

/* ── Översättning ─────────────────────────────────────────────────────────── */

/**
 * Postgres skickar `bigint` som sträng i JSON — ett tal över 2^53 kan inte
 * representeras exakt i JavaScript. Beloppen här ryms med marginal, men
 * Number() måste ändå tillämpas explicit i stället för att anta att klienten
 * fick ett tal.
 */
function numbersFrom(row: Record<string, unknown>): SettlementNumbers {
  return {
    ordersCount: Number(row["orders_count"] ?? 0),
    grossOre: Number(row["gross_ore"] ?? 0),
    tipsOre: Number(row["tips_ore"] ?? 0),
    cashOre: Number(row["cash_ore"] ?? 0),
    feesOre: Number(row["fees_ore"] ?? 0),
    refundsOre: Number(row["refunds_ore"] ?? 0),
    feeCreditOre: Number(row["fee_credit_ore"] ?? 0),
    amountDueOre: Number(row["amount_due_ore"] ?? 0),
  };
}

function toSettlement(row: Record<string, unknown>): Settlement {
  return {
    id: String(row["id"]),
    restaurantId: String(row["restaurant_id"]),
    periodStart: String(row["period_start"]),
    periodEnd: String(row["period_end"]),
    currency: row["currency"] as CurrencyCode,
    status: row["status"] as SettlementStatus,
    invoiceNumber: (row["invoice_number"] as string | null) ?? null,
    note: (row["note"] as string | null) ?? null,
    invoicedAt: (row["invoiced_at"] as string | null) ?? null,
    paidAt: (row["paid_at"] as string | null) ?? null,
    voidedAt: (row["voided_at"] as string | null) ?? null,
    ...numbersFrom(row),
  };
}

function rows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}
