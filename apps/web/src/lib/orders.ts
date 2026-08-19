import "server-only";

import {
  ACTIVE_STATUSES,
  isDueForKitchen,
  parseOrderPolicy,
  type OrderStatus,
  type OrderType,
} from "@burp/core";
import { createClient } from "./supabase/server";

/**
 * Aktiva order för köksskärmen och orderlistan.
 *
 * Läser via den vanliga RLS-klienten, inte service role. Personalen är
 * inloggad och `orders_select_staff` begränsar redan till den egna
 * restaurangen — service role här skulle bara ta bort skyddsnätet.
 */

export interface KitchenOrderItem {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  options: string[];
}

export interface KitchenOrder {
  id: string;
  status: OrderStatus;
  type: OrderType;
  tableNumber: string | null;
  placedAt: string | null;
  acceptedAt: string | null;
  note: string | null;
  totalOre: number;
  /** Hämttid för en förbeställning. Null för en order som ska lagas nu. */
  scheduledFor: string | null;
  items: KitchenOrderItem[];
}

export interface ActiveOrders {
  /** Order köket ska laga nu. */
  due: KitchenOrder[];
  /**
   * Förbeställningar som ännu inte ska påbörjas.
   *
   * Hålls undan från köksskärmen tills tillagningstiden återstår — annars
   * börjar köket laga en lunch som ska hämtas klockan 18. Personalen ser dem
   * ändå, i en egen lista, så att ingen tror att beställningen försvunnit.
   */
  upcoming: KitchenOrder[];
}

/**
 * Statusarna som betyder "köket har något att göra med den här".
 *
 * Bor i `@burp/core` sedan köksskärmens larm behövde samma lista — larmet körs
 * i webbläsaren och den här filen är `server-only`. Re-exporten står kvar så
 * att befintliga anrop inte behöver veta att den flyttat.
 */
export { ACTIVE_STATUSES };

export async function getActiveOrders(restaurantId: string): Promise<ActiveOrders> {
  const supabase = await createClient();

  // Tillagningstiden avgör när en förbeställning ska släppas till köket.
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("order_policy")
    .eq("id", restaurantId)
    .maybeSingle();

  const prepTimeMinutes = parseOrderPolicy(restaurant?.order_policy).prepTimeMinutes;

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, type, placed_at, accepted_at, note, total_ore, table_id, scheduled_for")
    .eq("restaurant_id", restaurantId)
    .in("status", ACTIVE_STATUSES)
    // Äldst först. Köket arbetar i den ordning orderna kom in, inte tvärtom.
    .order("placed_at", { ascending: true });

  if (!orders || orders.length === 0) return { due: [], upcoming: [] };

  const orderIds = orders.map((order) => order.id);

  const { data: items } = await supabase
    .from("order_items")
    .select("id, order_id, name_snapshot, quantity, note")
    .in("order_id", orderIds);

  const itemIds = (items ?? []).map((item) => item.id);
  const tableIds = [
    ...new Set(orders.map((order) => order.table_id).filter((id): id is string => id !== null)),
  ];

  const [optionsResult, tablesResult] = await Promise.all([
    itemIds.length
      ? supabase
          .from("order_item_options")
          .select("order_item_id, name_snapshot")
          .in("order_item_id", itemIds)
      : Promise.resolve({ data: [] as { order_item_id: string; name_snapshot: string }[] }),
    tableIds.length
      ? supabase.from("tables").select("id, table_number").in("id", tableIds)
      : Promise.resolve({ data: [] as { id: string; table_number: string }[] }),
  ]);

  const optionsByItem = new Map<string, string[]>();
  for (const option of optionsResult.data ?? []) {
    const existing = optionsByItem.get(option.order_item_id);
    if (existing) existing.push(option.name_snapshot);
    else optionsByItem.set(option.order_item_id, [option.name_snapshot]);
  }

  const itemsByOrder = new Map<string, KitchenOrderItem[]>();
  for (const item of items ?? []) {
    const mapped: KitchenOrderItem = {
      id: item.id,
      name: item.name_snapshot,
      quantity: item.quantity,
      note: item.note,
      options: optionsByItem.get(item.id) ?? [],
    };
    const existing = itemsByOrder.get(item.order_id);
    if (existing) existing.push(mapped);
    else itemsByOrder.set(item.order_id, [mapped]);
  }

  const tableNumberById = new Map(
    (tablesResult.data ?? []).map((table) => [table.id, table.table_number]),
  );

  const mapped: KitchenOrder[] = orders.map((order) => ({
    id: order.id,
    status: order.status as OrderStatus,
    type: order.type as OrderType,
    tableNumber: order.table_id ? (tableNumberById.get(order.table_id) ?? null) : null,
    placedAt: order.placed_at,
    acceptedAt: order.accepted_at,
    note: order.note,
    totalOre: order.total_ore,
    scheduledFor: order.scheduled_for,
    items: itemsByOrder.get(order.id) ?? [],
  }));

  // Filtreringen sker på tiden, inte på ett bakgrundsjobb. Ett jobb som inte
  // kört är ett jobb som tappat en order — och det felet upptäcks av en hungrig
  // gäst, inte av ett larm.
  const now = new Date();
  const due: KitchenOrder[] = [];
  const upcoming: KitchenOrder[] = [];

  for (const order of mapped) {
    const scheduled = order.scheduledFor ? new Date(order.scheduledFor) : null;
    if (isDueForKitchen(scheduled, prepTimeMinutes, now)) due.push(order);
    else upcoming.push(order);
  }

  // Kommande sorteras på hämttid: den som ska hämtas först är den som snart
  // dyker upp i köket.
  upcoming.sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));

  return { due, upcoming };
}
