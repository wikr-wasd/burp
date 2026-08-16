import "server-only";

import type { CurrencyCode, OrderType } from "@burp/core";
import { createClient } from "./supabase/server";

/**
 * Kassavyn: slutförda order och vad som betalats för dem.
 *
 * Betalning i plattformen är beslutad men blockerad av leverantörsvalet (öppen
 * fråga 5). Kontant är inte blockerat av något, och tills korten fungerar är
 * det ENDA sättet en order faktiskt betalas — därför måste summan kunna
 * kvitteras av någon i lokalen. Utan kvittensen finns ingen kassaavstämning och
 * inget bekräftat underlag för Burps avgift.
 *
 * Läser med personalens egen session. `orders_select_staff` och de nya
 * policyerna i migration 0024 begränsar redan till den egna restaurangen;
 * service role här hade bara tagit bort skyddsnätet.
 */

export interface SettledPayment {
  amountOre: number;
  /** Klockslag i restaurangens tidszon, färdigformaterat. */
  capturedLabel: string;
}

export interface RegisterOrder {
  id: string;
  type: OrderType;
  tableNumber: string | null;
  /**
   * Klockslag i RESTAURANGENS tidszon, formaterat här och inte i komponenten.
   *
   * Två skäl. Klientkoden renderas även på servern, och `toLocaleTimeString`
   * där hade läst serverns tidszon medan webbläsaren läser sin egen — samma
   * rad hade fått två värden och hydreringen brustit. Och en restaurang i
   * Sarajevo ska se sin egen klocka oavsett var appen råkar köra.
   */
  completedLabel: string;
  totalOre: number;
  currency: CurrencyCode;
  itemSummary: string;
  /** Null när ordern ännu inte kvitterats. */
  payment: SettledPayment | null;
}

export interface CashRegisterView {
  /** Slutförda order utan betalningsrad. Det är de som ska betas av. */
  unsettled: RegisterOrder[];
  /** Kvitterade order i samma period, som facit över passet. */
  settled: RegisterOrder[];
}

/**
 * Hur långt bakåt kassavyn tittar.
 *
 * Ett dygn räcker för ett pass och håller listan hanterlig. En obetald order
 * från förra veckan är inte längre en nota någon ska jaga i kassan — den är ett
 * bokföringsärende, och det hör hemma i statistiken.
 */
const WINDOW_HOURS = 24;

export async function getCashRegister(
  restaurantId: string,
  timeZone: string,
  now = new Date(),
): Promise<CashRegisterView> {
  const supabase = await createClient();

  const clock = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const at = (value: string | null) => (value ? clock.format(new Date(value)) : "");

  const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000).toISOString();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, type, total_ore, currency, table_id, completed_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "COMPLETED")
    .gte("completed_at", since)
    // Senast slutförda först: notan som just lämnades i kassan ligger överst.
    .order("completed_at", { ascending: false });

  if (!orders || orders.length === 0) return { unsettled: [], settled: [] };

  const orderIds = orders.map((order) => order.id);
  const tableIds = [
    ...new Set(orders.map((order) => order.table_id).filter((id): id is string => id !== null)),
  ];

  const [paymentsResult, itemsResult, tablesResult] = await Promise.all([
    supabase
      .from("payments")
      .select("order_id, amount_ore, captured_at")
      .in("order_id", orderIds)
      .eq("provider", "CASH"),
    supabase.from("order_items").select("order_id, name_snapshot, quantity").in("order_id", orderIds),
    tableIds.length
      ? supabase.from("tables").select("id, table_number").in("id", tableIds)
      : Promise.resolve({ data: [] as { id: string; table_number: string }[] }),
  ]);

  const paymentByOrder = new Map(
    (paymentsResult.data ?? []).map((row) => [
      row.order_id,
      { amountOre: row.amount_ore, capturedLabel: at(row.captured_at) },
    ]),
  );

  const summaryByOrder = new Map<string, string[]>();
  for (const item of itemsResult.data ?? []) {
    const line = `${item.quantity}× ${item.name_snapshot}`;
    const existing = summaryByOrder.get(item.order_id);
    if (existing) existing.push(line);
    else summaryByOrder.set(item.order_id, [line]);
  }

  const tableNumberById = new Map(
    (tablesResult.data ?? []).map((table) => [table.id, table.table_number]),
  );

  const unsettled: RegisterOrder[] = [];
  const settled: RegisterOrder[] = [];

  for (const order of orders) {
    const payment = paymentByOrder.get(order.id) ?? null;

    const mapped: RegisterOrder = {
      id: order.id,
      type: order.type as OrderType,
      tableNumber: order.table_id ? (tableNumberById.get(order.table_id) ?? null) : null,
      completedLabel: at(order.completed_at),
      totalOre: order.total_ore,
      // Valutan är fryst på ordern (migration 0020). Kvittot ändrar sig aldrig
      // i efterhand, och kassan ska visa samma valuta som gästen betalade i.
      currency: order.currency as CurrencyCode,
      itemSummary: (summaryByOrder.get(order.id) ?? []).join(", "),
      payment,
    };

    if (payment) settled.push(mapped);
    else unsettled.push(mapped);
  }

  return { unsettled, settled };
}
