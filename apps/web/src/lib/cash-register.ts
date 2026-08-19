import "server-only";

import type { CurrencyCode, OrderType, PaymentStatus } from "@burp/core";
import { createClient } from "./supabase/server";

/**
 * Kassavyn: slutförda order och vad som betalats för dem.
 *
 * Kontant är fortfarande det vanligaste sättet en order betalas i Bosnien och
 * Serbien, och personalen i lokalen måste kunna kvittera summan. Utan
 * kvittensen finns ingen kassaavstämning och inget bekräftat underlag för
 * Burps avgift.
 *
 * Vyn läser numera ALLA betalningar och inte bara kontanter. Med bara
 * `provider = 'CASH'` såg en kortbetald order ut som obetald och hamnade bland
 * notorna att kvittera — personalen hade då registrerat kontanter ovanpå en
 * betalning som redan gått igenom, och kassan gått plus med hela notan.
 *
 * Läser med personalens egen session. `orders_select_staff` och de nya
 * policyerna i migration 0024 begränsar redan till den egna restaurangen;
 * service role här hade bara tagit bort skyddsnätet.
 */

export interface SettledPayment {
  id: string;
  amountOre: number;
  /** Klockslag i restaurangens tidszon, färdigformaterat. */
  capturedLabel: string;
  /** `CASH`, `STRIPE`, `MONRI`… Avgör vad raden säger och vad som går att göra. */
  provider: string;
  status: PaymentStatus;
  /** Summan av lyckade motbokningar. Noll när ingenting återbetalats. */
  refundedOre: number;
}

/** Alla betalningar på en order, i den ordning de kom in. */
export interface OrderPayments {
  rows: SettledPayment[];
  /** Summan av allt som inte misslyckats. */
  paidOre: number;
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
  /** Betalningarna på ordern. Tom lista när ingenting kommit in. */
  payments: SettledPayment[];
  /** Summan av allt som inte misslyckats. */
  paidOre: number;
  /** Notan minus det betalda. Noll eller mindre betyder färdigbetald. */
  dueOre: number;
  /** Bordets nota, när ordern lades vid ett bord. */
  tableSessionId: string | null;
}

/**
 * Ett bordssällskaps gemensamma nota.
 *
 * Fyra personer vid samma bord beställer var för sig i sina egna telefoner men
 * delar nota — det är hela poängen med att sessionen hör till bordet. Kassan
 * såg fyra order och krävde fyra kvitteringar; restaurangen vill ha en.
 */
export interface RegisterTable {
  sessionId: string;
  tableNumber: string | null;
  orders: RegisterOrder[];
  totalOre: number;
  paidOre: number;
  dueOre: number;
  currency: CurrencyCode;
}

export interface CashRegisterView {
  /**
   * Bordssällskap med något kvar att betala. Kvitteras i ett svep.
   *
   * Att gå på "har en betalningsrad" räcker inte sedan presentkorten kom: ett
   * kort på 50 mot en nota på 62 lämnar 12 att betala, och ordern hade sett
   * färdig ut medan tolv mark saknades i kassan.
   */
  tables: RegisterTable[];
  /** Avhämtning och leverans — order utan bord, som kvitteras var för sig. */
  unsettled: RegisterOrder[];
  /** Färdigbetalda order i samma period, som facit över passet. */
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

/**
 * Dricks att fördela under samma dygn som kassavyn visar.
 *
 * Egen fråga och inte en summa över raderna ovan. Dricksen har en egen liggare
 * (migration 0040) därför att den inte är restaurangens omsättning utan
 * personalens pengar, och den enda siffra i produkten som är det. Att räkna den
 * ur `orders.tip_ore` i komponenten hade gett en andra sanning — och den hade
 * fortsatt räkna dricks på notor som lämnats tillbaka.
 *
 * Servitören ser den. Att låta ägaren ensam se hur mycket dricks som kommit in
 * vore att göra personalens pengar till en företagsuppgift.
 */
export interface TipsSummary {
  /** Allt som står kvar, alltså utan det som lämnats tillbaka. */
  totalOre: number;
  /** Kom in som sedlar. */
  cashOre: number;
  /** Kom in genom en betalleverantör eller ett presentkort. */
  cardOre: number;
  /** Notan är serverad men inte betald — pengarna finns inte än. */
  pendingOre: number;
}

export async function getTipsSummary(
  restaurantId: string,
  now = new Date(),
): Promise<TipsSummary> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("restaurant_tips_summary", {
    p_restaurant_id: restaurantId,
    p_from: new Date(now.getTime() - WINDOW_HOURS * 3_600_000).toISOString(),
    p_to: now.toISOString(),
  });

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;

  return {
    totalOre: Number(row?.["tips_ore"] ?? 0),
    cashOre: Number(row?.["cash_ore"] ?? 0),
    cardOre: Number(row?.["card_ore"] ?? 0),
    pendingOre: Number(row?.["pending_ore"] ?? 0),
  };
}

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
    .select("id, type, total_ore, currency, table_id, table_session_id, completed_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "COMPLETED")
    .gte("completed_at", since)
    // Senast slutförda först: notan som just lämnades i kassan ligger överst.
    .order("completed_at", { ascending: false });

  if (!orders || orders.length === 0) return { tables: [], unsettled: [], settled: [] };

  const orderIds = orders.map((order) => order.id);
  const tableIds = [
    ...new Set(orders.map((order) => order.table_id).filter((id): id is string => id !== null)),
  ];

  const [paymentsResult, itemsResult, tablesResult] = await Promise.all([
    supabase
      .from("payments")
      .select("id, order_id, amount_ore, captured_at, provider, status")
      .in("order_id", orderIds)
      // En misslyckad betalning är inte en betalning. Ordern ska ligga kvar
      // bland dem som ska kvitteras.
      .neq("status", "FAILED"),
    supabase.from("order_items").select("order_id, name_snapshot, quantity").in("order_id", orderIds),
    tableIds.length
      ? supabase.from("tables").select("id, table_number").in("id", tableIds)
      : Promise.resolve({ data: [] as { id: string; table_number: string }[] }),
  ]);

  const paymentRows = paymentsResult.data ?? [];

  // Motbokningarna hämtas separat och inte som en join: `refunds` är läsbar
  // bara för ägare och chef, och servitören ska kunna använda kassavyn ändå.
  const { data: refundRows } = paymentRows.length
    ? await supabase
        .from("refunds")
        .select("payment_id, amount_ore")
        .in(
          "payment_id",
          paymentRows.map((row) => row.id),
        )
        .eq("status", "SUCCEEDED")
    : { data: [] as { payment_id: string; amount_ore: number }[] };

  const refundedByPayment = new Map<string, number>();
  for (const row of refundRows ?? []) {
    refundedByPayment.set(row.payment_id, (refundedByPayment.get(row.payment_id) ?? 0) + row.amount_ore);
  }

  // Flera betalningar per order sedan presentkorten kom: ett kort betalar en
  // del, resten kommer med kort eller kontant.
  const paymentsByOrder = new Map<string, SettledPayment[]>();
  for (const row of paymentRows) {
    const mapped: SettledPayment = {
      id: row.id,
      amountOre: row.amount_ore,
      capturedLabel: at(row.captured_at),
      provider: row.provider,
      status: row.status as PaymentStatus,
      refundedOre: refundedByPayment.get(row.id) ?? 0,
    };

    const existing = paymentsByOrder.get(row.order_id);
    if (existing) existing.push(mapped);
    else paymentsByOrder.set(row.order_id, [mapped]);
  }

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
    const payments = paymentsByOrder.get(order.id) ?? [];
    const paidOre = payments.reduce((sum, payment) => sum + payment.amountOre, 0);

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
      payments,
      paidOre,
      dueOre: order.total_ore - paidOre,
      tableSessionId: order.table_session_id,
    };

    // Notan är täckt eller den är det inte. Att gå på om det FINNS en
    // betalningsrad hade lämnat ett halvbetalt presentkortsköp som färdigt.
    if (mapped.dueOre <= 0) settled.push(mapped);
    else unsettled.push(mapped);
  }

  /*
   * Bordssällskapen slås ihop till en nota var.
   *
   * Grupperingen sker på bordssessionen och inte på bordet: samma bord kan ha
   * haft två sällskap under dygnet kassavyn tittar på, och de ska inte betala
   * varandras mat.
   */
  const bySession = new Map<string, RegisterOrder[]>();
  const singles: RegisterOrder[] = [];

  for (const order of unsettled) {
    if (order.tableSessionId === null) {
      singles.push(order);
      continue;
    }

    const existing = bySession.get(order.tableSessionId);
    if (existing) existing.push(order);
    else bySession.set(order.tableSessionId, [order]);
  }

  const tables: RegisterTable[] = [...bySession.entries()].map(([sessionId, group]) => {
    const totalOre = group.reduce((sum, order) => sum + order.totalOre, 0);
    const paidOre = group.reduce((sum, order) => sum + order.paidOre, 0);

    return {
      sessionId,
      tableNumber: group[0]?.tableNumber ?? null,
      orders: group,
      totalOre,
      paidOre,
      dueOre: totalOre - paidOre,
      currency: group[0]!.currency,
    };
  });

  return { tables, unsettled: singles, settled };
}
