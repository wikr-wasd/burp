import "server-only";

import type { CurrencyCode } from "@burp/core";
import { createClient } from "./supabase/server";

/**
 * Vem gjorde vad med pengarna (migration 0045).
 *
 * Uträkningen och behörighetskontrollen ligger i databasen. Funktionen är
 * SECURITY DEFINER — den måste vara det för att kunna läsa namnet ur `profiles`
 * — och kontrollerar rollen själv. Den här filen översätter bara svaret.
 */

export type MoneyEventKind = "REFUND" | "CANCELLED";

export interface MoneyEvent {
  kind: MoneyEventKind;
  at: string;
  orderId: string;
  amountOre: number;
  currency: CurrencyCode;
  /** Skälet till en återbetalning. Null för en avbruten order. */
  reason: string | null;
  /** `STAFF`, `GUEST`, `SYSTEM` eller `WEBHOOK`. */
  actorKind: string;
  /** Null när ingen människa låg bakom — en webhook eller en chargeback. */
  actorName: string | null;
}

export async function getMoneyEvents(
  restaurantId: string,
  from: Date,
  to: Date,
): Promise<MoneyEvent[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("restaurant_money_events", {
    p_restaurant_id: restaurantId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

  return rows.map((row) => ({
    kind: row["kind"] as MoneyEventKind,
    at: String(row["at"]),
    orderId: String(row["order_id"]),
    amountOre: Number(row["amount_ore"] ?? 0),
    currency: row["currency"] as CurrencyCode,
    reason: (row["reason"] as string | null) ?? null,
    actorKind: String(row["actor_kind"] ?? "SYSTEM"),
    actorName: (row["actor_name"] as string | null) ?? null,
  }));
}
