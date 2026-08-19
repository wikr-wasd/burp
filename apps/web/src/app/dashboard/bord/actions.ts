"use server";

import { revalidatePath } from "next/cache";
import { generatePublicId } from "@burp/core";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Bordshantering. Bara ägare och chef — att skapa ett bord är att skapa en
 * beställningspunkt, och det ska inte kunna göras av vem som helst i lokalen.
 *
 * Skrivningarna går via personalens egen session, inte service role, så
 * `tables_all_staff` i RLS är det som faktiskt begränsar till rätt restaurang.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function createTable(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  const tableNumber = String(formData.get("table_number") ?? "").trim();
  const zone = String(formData.get("zone") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();

  if (!tableNumber) return { ok: false, message: "Bordsnummer krävs." };
  if (tableNumber.length > 20) return { ok: false, message: "Bordsnumret är för långt." };

  const capacity = capacityRaw ? Number(capacityRaw) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)) {
    return { ok: false, message: "Kapacitet ska vara mellan 1 och 100." };
  }

  const supabase = await createClient();

  // qr_public_id är globalt unikt. Kollisionsrisken är försumbar (32^6 ≈ 1,07
  // miljarder) men inte noll, så vi provar om databasen avvisar just den.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("tables").insert({
      restaurant_id: staff.restaurantId,
      table_number: tableNumber,
      zone: zone || null,
      capacity,
      qr_public_id: generatePublicId(),
    });

    if (!error) {
      revalidatePath("/dashboard/bord");
      return { ok: true };
    }

    // 23505 = unique_violation. Krockar bordsnumret hjälper inget nytt försök;
    // bara en kollision på qr_public_id är värd att prova om.
    if (error.code !== "23505") return { ok: false, message: error.message };
    if (error.message.includes("table_number") || error.message.includes("tables_number_key")) {
      return { ok: false, message: `Bord ${tableNumber} finns redan.` };
    }
  }

  return { ok: false, message: "Kunde inte generera en unik QR-kod. Försök igen." };
}

export async function setTableLocked(tableId: string, locked: boolean): Promise<ActionResult> {
  await requireStaff(["owner", "manager"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tables")
    .update({ status: locked ? "LOCKED" : "ACTIVE" })
    .eq("id", tableId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/bord");
  return { ok: true };
}

/* ── Planritningen ───────────────────────────────────────────────────────── */

/**
 * Skapar en ritning — en våning, en uteservering.
 *
 * Ritytan är i rutnätsenheter och inte i pixlar. Hade positionerna lagrats i
 * pixlar hade rummet ritats om varje gång någon bytte från telefon till
 * surfplatta.
 */
export async function createFloorPlan(name: string): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) {
    return { ok: false, message: "Namnet ska vara 1–60 tecken." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("floor_plans").insert({
    restaurant_id: staff.restaurantId,
    name: trimmed,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, message: `${trimmed} finns redan.` };
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/bord");
  return { ok: true };
}

export async function renameFloorPlan(planId: string, name: string): Promise<ActionResult> {
  await requireStaff(["owner", "manager"]);

  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) {
    return { ok: false, message: "Namnet ska vara 1–60 tecken." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("floor_plans").update({ name: trimmed }).eq("id", planId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/bord");
  return { ok: true };
}

/**
 * Tar bort en ritning.
 *
 * Borden blir kvar. `floor_plan_id` är `on delete set null`, alltså hamnar de
 * i listan över outplacerade bord i stället för att försvinna — ett bord är en
 * beställningspunkt med historik och får inte raderas för att någon ångrade en
 * ritning.
 */
export async function deleteFloorPlan(planId: string): Promise<ActionResult> {
  await requireStaff(["owner", "manager"]);

  const supabase = await createClient();
  const { error } = await supabase.from("floor_plans").delete().eq("id", planId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/bord");
  return { ok: true };
}

export interface TablePosition {
  id: string;
  placed: boolean;
  x: number;
  y: number;
  rotation: number;
  shape: "ROUND" | "SQUARE" | "RECT";
  width: number;
  height: number;
}

/**
 * Sparar hela rummet på en gång.
 *
 * Redigeraren flyttar flera bord innan någon trycker Spara. Att skriva dem en
 * och en hade betytt att ett avbrott mitt i lämnar halva rummet flyttat — och
 * den som ritar ser inte skillnaden förrän nästa gång sidan laddas.
 */
export async function saveFloorPlanPositions(
  planId: string,
  positions: TablePosition[],
): Promise<ActionResult> {
  await requireStaff(["owner", "manager"]);

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_floor_plan_positions", {
    p_floor_plan_id: planId,
    p_positions: positions,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/bord");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function archiveTable(tableId: string): Promise<ActionResult> {
  await requireStaff(["owner", "manager"]);

  const supabase = await createClient();

  // Arkiveras, raderas inte. Bordet sitter i `orders.table_id` och historiken
  // över omsättning per bord får inte försvinna för att ett bord flyttas ut.
  const { error } = await supabase.from("tables").update({ status: "ARCHIVED" }).eq("id", tableId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/bord");
  return { ok: true };
}
