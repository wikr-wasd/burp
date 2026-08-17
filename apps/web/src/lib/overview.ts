import "server-only";

import { createClient } from "./supabase/server";

/**
 * Bordens läge just nu, för dashboardens översikt.
 *
 * Tre tillstånd, härledda och inte lagrade:
 *
 *   `LEDIGT`     — ingen öppen nota
 *   `OPPEN_NOTA` — notan är öppen, köket har inget att göra
 *   `BESTALLNING`— minst en order som ännu inte serverats
 *
 * Att lagra bordets tillstånd i en kolumn hade betytt en fjärde plats där
 * sanningen kan hamna i otakt med orderloggen. Samma skäl som lojalitetssaldot
 * inte lagras: en summa över loggen kan inte komma i otakt med loggen.
 */

export type TableState = "LEDIGT" | "OPPEN_NOTA" | "BESTALLNING";

export interface TableSnapshot {
  id: string;
  tableNumber: string;
  zone: string | null;
  state: TableState;
}

/** Statusar som betyder att köket eller serveringen har något ogjort. */
const BUSY_STATUSES = ["PLACED", "ACCEPTED", "PREPARING", "READY"];

export async function getTableSnapshots(restaurantId: string): Promise<TableSnapshot[]> {
  const supabase = await createClient();

  // Tre oberoende frågor, alltså parallellt. Ingen behöver den föregåendes svar.
  const [{ data: tables }, { data: sessions }, { data: orders }] = await Promise.all([
    supabase
      .from("tables")
      .select("id, table_number, zone")
      .eq("restaurant_id", restaurantId)
      .neq("status", "ARCHIVED")
      .order("table_number", { ascending: true }),

    supabase
      .from("table_sessions")
      .select("table_id")
      .eq("restaurant_id", restaurantId)
      .eq("status", "OPEN"),

    supabase
      .from("orders")
      .select("table_id")
      .eq("restaurant_id", restaurantId)
      .in("status", BUSY_STATUSES)
      .not("table_id", "is", null),
  ]);

  const openTables = new Set((sessions ?? []).map((row) => row.table_id as string));
  const busyTables = new Set((orders ?? []).map((row) => row.table_id as string));

  return (tables ?? []).map((row) => ({
    id: row.id as string,
    tableNumber: row.table_number as string,
    zone: (row.zone as string | null) ?? null,
    state: busyTables.has(row.id as string)
      ? "BESTALLNING"
      : openTables.has(row.id as string)
        ? "OPPEN_NOTA"
        : "LEDIGT",
  }));
}
