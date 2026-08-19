import type { CurrencyCode } from "@burp/core";

/**
 * Avräkningens modell och periodräkning (migration 0039).
 *
 * Skild från `lib/settlements.ts`, som läser databasen och därför är
 * `server-only`. Det som ligger här är rena värden och ren aritmetik, och det
 * måste vara det: `settlement-figures.tsx` renderas inuti en klientkomponent i
 * backoffice, och en `import "server-only"` i kedjan hade fällt bygget.
 *
 * Uppdelningen betalar sig en gång till — periodräkningen går att enhetstesta
 * utan databas, och månadsskiftet är exakt den sortens aritmetik som blir
 * subtilt fel och märks först när fakturan är skickad.
 */

export const SETTLEMENT_STATUSES = ["DRAFT", "INVOICED", "PAID", "VOID"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  DRAFT: "Utkast",
  INVOICED: "Fakturerad",
  PAID: "Betald",
  VOID: "Makulerad",
};

/** Vilka lägen som går att nå härifrån. Speglar triggern i migration 0039. */
export const SETTLEMENT_NEXT: Record<SettlementStatus, readonly SettlementStatus[]> = {
  DRAFT: ["INVOICED", "VOID"],
  INVOICED: ["PAID", "VOID"],
  PAID: [],
  VOID: [],
};

/** Beloppen i en period. Samma fält oavsett om perioden är stängd eller inte. */
export interface SettlementNumbers {
  ordersCount: number;
  grossOre: number;
  tipsOre: number;
  cashOre: number;
  feesOre: number;
  refundsOre: number;
  feeCreditOre: number;
  /** Det Burp fakturerar. Negativt belopp är en kreditnota. */
  amountDueOre: number;
}

export interface SettlementPreview extends SettlementNumbers {
  /**
   * `null` när perioden innehåller order i fler än en valuta, vilket bara kan
   * hända om restaurangen bytt land mitt i den. Då finns ingen giltig summa och
   * perioden går inte att stänga.
   */
  currency: CurrencyCode | null;
}

export interface Settlement extends SettlementNumbers {
  id: string;
  restaurantId: string;
  restaurantName?: string;
  periodStart: string;
  periodEnd: string;
  currency: CurrencyCode;
  status: SettlementStatus;
  invoiceNumber: string | null;
  note: string | null;
  invoicedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
}

/* ── Månader ──────────────────────────────────────────────────────────────
 *
 * Perioden är en kalendermånad. Det är inte en teknisk begränsning — schemat
 * tar vilka två datum som helst — utan ett val: en faktura per månad är vad en
 * restaurang och en bokföring förväntar sig, och godtyckliga perioder gör
 * överlappsspärren till en gåta för den som ska stänga nästa.
 *
 * Nyckeln är "ÅÅÅÅ-MM". Månaden räknas i RESTAURANGENS tidszon — den 1:a
 * klockan 00:30 i Sarajevo är fortfarande föregående månad i UTC, och
 * backoffice hade då erbjudit fel månad att stänga.
 */

export type MonthKey = string;

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string | undefined): value is MonthKey {
  return typeof value === "string" && MONTH_KEY.test(value);
}

export function currentMonthKey(timeZone: string, now = new Date()): MonthKey {
  // sv-SE ger ÅÅÅÅ-MM-DD, alltså är de sju första tecknen redan en månadsnyckel.
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return local.slice(0, 7);
}

export function shiftMonth(key: MonthKey, months: number): MonthKey {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  // Månad 0 är december året innan; Date räknar om det åt oss.
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface MonthBounds {
  /** Första dagen, ISO. */
  start: string;
  /** Sista dagen, ISO. Ingår i perioden. */
  end: string;
}

export function monthBounds(key: MonthKey): MonthBounds {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  // Dag 0 i nästa månad är sista dagen i den här. Skottår sköter sig självt.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    start: `${key}-01`,
    end: `${key}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** "juni 2026". Personalytorna är svenska, med flit. */
export function formatMonth(key: MonthKey): string {
  return new Intl.DateTimeFormat("sv-SE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}-01T00:00:00Z`));
}

/**
 * De senaste avslutade månaderna, nyast först.
 *
 * Innevarande månad är inte med. `close_settlement_period()` vägrar stänga en
 * period som inte är slut, och att erbjuda den i menyn hade betytt en knapp som
 * alltid ger ett fel.
 */
export function closedMonths(timeZone: string, count = 12, now = new Date()): MonthKey[] {
  const current = currentMonthKey(timeZone, now);
  return Array.from({ length: count }, (_, index) => shiftMonth(current, -(index + 1)));
}
