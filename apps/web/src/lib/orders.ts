import "server-only";

import type { OrderStatus, OrderType } from "@burp/core";
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
  items: KitchenOrderItem[];
}

/** Statusarna som betyder "köket har något att göra med den här". */
export const ACTIVE_STATUSES: OrderStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY"];

export async function getActiveOrders(restaurantId: string): Promise<KitchenOrder[]> {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, type, placed_at, accepted_at, note, total_ore, table_id")
    .eq("restaurant_id", restaurantId)
    .in("status", ACTIVE_STATUSES)
    // Äldst först. Köket arbetar i den ordning orderna kom in, inte tvärtom.
    .order("placed_at", { ascending: true });

  if (!orders || orders.length === 0) return [];

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

  return orders.map((order) => ({
    id: order.id,
    status: order.status as OrderStatus,
    type: order.type as OrderType,
    tableNumber: order.table_id ? (tableNumberById.get(order.table_id) ?? null) : null,
    placedAt: order.placed_at,
    acceptedAt: order.accepted_at,
    note: order.note,
    totalOre: order.total_ore,
    items: itemsByOrder.get(order.id) ?? [],
  }));
}
