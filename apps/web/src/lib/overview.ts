import "server-only";

import type { FloorItemKind, OrderStatus, TableShape } from "@burp/core";

import { createClient } from "./supabase/server";

/**
 * Bordens läge just nu, för dashboardens översikt.
 *
 * Fyra tillstånd, härledda och inte lagrade:
 *
 *   `LEDIGT`     — ingen öppen nota
 *   `OPPEN_NOTA` — notan är öppen, köket har inget att göra
 *   `BESTALLNING`— minst en order i köket, ingen färdig ännu
 *   `SERVERAS`   — minst en order är KLAR och väntar på att köras ut
 *
 * `SERVERAS` var länge samma röda som `BESTALLNING`, och det var fel.
 *
 * Lagd, mottagen och tillagas betyder alla att servitören inte behöver göra
 * någonting — köket äger ordern. `READY` betyder att maten står under lampan
 * och blir kall. Det är motsatta ärenden, och att måla dem lika gjorde kartan
 * till en lägesbild i stället för ett arbetsredskap: det enda bord som faktiskt
 * krävde ett steg gick inte att skilja från de tre som inte gjorde det.
 *
 * Grönt, i linje med köksskärmens gröna ram runt en klar biljett. Samma
 * betydelse ska ha samma färg på båda ytorna — personalen rör sig mellan dem.
 *
 * Ett bord med både en klar och en pågående order räknas som `SERVERAS`. Det
 * som väntar på handling vinner; den pågående ordern ropar ändå senare.
 *
 * Att lagra bordets tillstånd i en kolumn hade betytt en fjärde plats där
 * sanningen kan hamna i otakt med orderloggen. Samma skäl som lojalitetssaldot
 * inte lagras: en summa över loggen kan inte komma i otakt med loggen.
 */

export type TableState = "LEDIGT" | "OPPEN_NOTA" | "BESTALLNING" | "SERVERAS";

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
  shape: TableShape;
  width: number;
  height: number;
  /** Platsantalet ritar stolarna runt bordet. Se `seatPositions()`. */
  capacity: number | null;
}

/**
 * Inredningen på ritningen: baren, väggen, dörren, trappan, växten.
 *
 * Läses av översikten och inte bara av redigeraren. Ett rum utan sina väggar
 * går inte att känna igen, och det är igenkänningen som gör att "bord 7
 * väntar" blir en punkt att gå till.
 */
export interface FloorItemSnapshot {
  id: string;
  floorPlanId: string;
  kind: FloorItemKind;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
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
  /** Inredningen, över alla ritningar. Filtreras per ritning där den ritas. */
  floorItems: FloorItemSnapshot[];
}

/** Statusar där köket äger ordern. Servitören behöver inte göra något. */
const KITCHEN_STATUSES = ["PLACED", "ACCEPTED", "PREPARING"] as const satisfies readonly OrderStatus[];

/** Klar att köras ut. Det enda som kräver ett steg av serveringen. */
const READY_STATUS = "READY" satisfies OrderStatus;

export async function getTableSnapshots(restaurantId: string): Promise<OverviewTables> {
  const supabase = await createClient();

  // Fem oberoende frågor, alltså parallellt. Ingen behöver den föregåendes svar.
  const [{ data: tables }, { data: sessions }, { data: orders }, { data: plans }, { data: items }] =
    await Promise.all([
      supabase
        .from("tables")
        .select(
          "id, table_number, zone, capacity, floor_plan_id, pos_x, pos_y, rotation, shape, width, height",
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
        .select("table_id, status")
        .eq("restaurant_id", restaurantId)
        .in("status", [...KITCHEN_STATUSES, READY_STATUS])
        .not("table_id", "is", null),

      supabase
        .from("floor_plans")
        .select("id, name, width, height")
        .eq("restaurant_id", restaurantId)
        .order("sort_order", { ascending: true }),

      supabase
        .from("floor_plan_items")
        .select("id, floor_plan_id, kind, label, pos_x, pos_y, width, height, rotation")
        .eq("restaurant_id", restaurantId),
    ]);

  const openTables = new Set((sessions ?? []).map((row) => row.table_id as string));

  const readyTables = new Set(
    (orders ?? [])
      .filter((row) => row.status === READY_STATUS)
      .map((row) => row.table_id as string),
  );

  const kitchenTables = new Set(
    (orders ?? [])
      .filter((row) => KITCHEN_STATUSES.includes(row.status as (typeof KITCHEN_STATUSES)[number]))
      .map((row) => row.table_id as string),
  );

  return {
    tables: (tables ?? []).map((row) => ({
      id: row.id as string,
      tableNumber: row.table_number as string,
      zone: (row.zone as string | null) ?? null,
      // Ordningen är prioritetsordningen. Det som kräver ett steg vinner över
      // det som inte gör det, och en order av något slag vinner över notan.
      state: readyTables.has(row.id as string)
        ? "SERVERAS"
        : kitchenTables.has(row.id as string)
          ? "BESTALLNING"
          : openTables.has(row.id as string)
            ? "OPPEN_NOTA"
            : "LEDIGT",
      floorPlanId: row.floor_plan_id,
      x: row.pos_x,
      y: row.pos_y,
      rotation: row.rotation,
      shape: row.shape as TableShape,
      width: row.width,
      height: row.height,
      capacity: row.capacity,
    })),
    floorPlans: (plans ?? []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      width: plan.width,
      height: plan.height,
    })),
    floorItems: (items ?? []).map((item) => ({
      id: item.id,
      floorPlanId: item.floor_plan_id,
      kind: item.kind as FloorItemKind,
      label: item.label,
      x: item.pos_x,
      y: item.pos_y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
    })),
  };
}
