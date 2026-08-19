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
  /** Null när bordet inte är utplacerat på någon ritning. */
  floorPlanId: string | null;
  x: number | null;
  y: number | null;
  rotation: number;
  shape: "ROUND" | "SQUARE" | "RECT";
  width: number;
  height: number;
}

export interface FloorPlanSnapshot {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface OverviewTables {
  tables: TableSnapshot[];
  /**
   * Restaurangens ritningar. Tom lista betyder att rutnätet visas i stället —
   * planritningen är ett tillägg, inte ett krav.
   */
  floorPlans: FloorPlanSnapshot[];
}

/** Statusar som betyder att köket eller serveringen har något ogjort. */
const BUSY_STATUSES = ["PLACED", "ACCEPTED", "PREPARING", "READY"];

export async function getTableSnapshots(restaurantId: string): Promise<OverviewTables> {
  const supabase = await createClient();

  // Fyra oberoende frågor, alltså parallellt. Ingen behöver den föregåendes svar.
  const [{ data: tables }, { data: sessions }, { data: orders }, { data: plans }] =
    await Promise.all([
      supabase
        .from("tables")
        .select(
          "id, table_number, zone, floor_plan_id, pos_x, pos_y, rotation, shape, width, height",
        )
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

      supabase
        .from("floor_plans")
        .select("id, name, width, height")
        .eq("restaurant_id", restaurantId)
        .order("sort_order", { ascending: true }),
    ]);

  const openTables = new Set((sessions ?? []).map((row) => row.table_id as string));
  const busyTables = new Set((orders ?? []).map((row) => row.table_id as string));

  return {
    tables: (tables ?? []).map((row) => ({
      id: row.id as string,
      tableNumber: row.table_number as string,
      zone: (row.zone as string | null) ?? null,
      state: busyTables.has(row.id as string)
        ? "BESTALLNING"
        : openTables.has(row.id as string)
          ? "OPPEN_NOTA"
          : "LEDIGT",
      floorPlanId: row.floor_plan_id,
      x: row.pos_x,
      y: row.pos_y,
      rotation: row.rotation,
      shape: row.shape as "ROUND" | "SQUARE" | "RECT",
      width: row.width,
      height: row.height,
    })),
    floorPlans: (plans ?? []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      width: plan.width,
      height: plan.height,
    })),
  };
}
