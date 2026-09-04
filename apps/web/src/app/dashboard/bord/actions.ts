"use server";

import { revalidatePath } from "next/cache";
import { TABLE_ATTRIBUTES, type TableAttribute } from "@/lib/table-attributes";
import {
  clampToPlan,
  generatePublicId,
  isFloorItemKind,
  parseAmount,
  type FloorItemKind,
} from "@burp/core";
import { requireStaff, staffErrors } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asJson } from "@/lib/supabase/types";

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

  if (!tableNumber) return { ok: false, message: staffErrors(staff).tableNumberRequired };
  if (tableNumber.length > 20) return { ok: false, message: staffErrors(staff).tableNumberTooLong };

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

  return { ok: false, message: staffErrors(staff).qrCodeFailed };
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
  /** Platsantalet ritar stolarna. Samma siffra som bokningen läser. */
  capacity: number | null;
}

export interface PlanItemInput {
  id: string;
  kind: FloorItemKind;
  /** Restaurangens egen text — "Bašta". Översätts aldrig. */
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface FloorPlanLayout {
  tables: TablePosition[];
  items: PlanItemInput[];
  /** Rummets storlek i rutnätsenheter. */
  width: number;
  height: number;
}

/**
 * Sparar hela rummet på en gång.
 *
 * Redigeraren flyttar bord, möblerar och ändrar rummets storlek innan någon
 * trycker Spara. Att skriva delarna en och en hade betytt att ett avbrott mitt
 * i lämnar borden flyttade men baren kvar där den stod — och den som ritar ser
 * inte skillnaden förrän nästa gång sidan laddas. Servern skriver allt i EN
 * transaktion (`save_floor_plan_layout`, migration 0072).
 *
 * Värdena tvättas här och inte bara i webbläsaren. Den som skickar sitt eget
 * anrop är inte redigeraren, och ett bord utanför rummet ritas ingenstans.
 */
export async function saveFloorPlanLayout(
  planId: string,
  layout: FloorPlanLayout,
): Promise<ActionResult> {
  await requireStaff(["owner", "manager"]);

  const width = clampInt(layout.width, 10, 200);
  const height = clampInt(layout.height, 10, 200);
  const plan = { width, height };

  const tables = layout.tables.map((table) => {
    const size = {
      width: clampInt(table.width, 1, 40),
      height: clampInt(table.height, 1, 40),
    };

    return {
      ...table,
      ...size,
      ...clampToPlan({ x: table.x, y: table.y, ...size }, plan),
      rotation: clampInt(table.rotation, 0, 359),
      // 0 platser finns inte i schemat (`capacity > 0`). Ett bord utan siffra
      // är ett bord vars platsantal ingen fyllt i, inte ett bord för noll.
      capacity: table.capacity === null ? null : clampInt(table.capacity, 1, 100),
    };
  });

  // Okända sorter faller bort i stället för att nekas — databasen hade ändå
  // avvisat dem, och ett constraint-brott är inte ett besked någon kan agera
  // på. En TEXT utan text hoppas över av samma skäl: den ritar en tom ruta.
  const items = layout.items
    .filter((item) => isFloorItemKind(item.kind))
    .map((item) => {
      const size = {
        width: clampInt(item.width, 1, width),
        height: clampInt(item.height, 1, height),
      };
      const label = (item.label ?? "").trim().slice(0, 40);

      return {
        ...item,
        ...size,
        ...clampToPlan({ x: item.x, y: item.y, ...size }, plan),
        rotation: clampInt(item.rotation, 0, 359),
        label: label || null,
      };
    })
    .filter((item) => item.kind !== "TEXT" || item.label !== null);

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_floor_plan_layout", {
    p_floor_plan_id: planId,
    p_tables: asJson(tables),
    p_items: asJson(items),
    p_width: width,
    p_height: height,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/bord");
  revalidatePath("/dashboard");
  // Borden syns i bokningsformuläret på den publika sidan — platsantalet med.
  revalidatePath("/r", "layout");
  return { ok: true };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
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

/**
 * Bordets egenskaper och vad det kostar extra att boka.
 *
 * Egenskaperna kommer ur en FAST lista och inte som fritext. Skälet är att de
 * översätts: en gäst som bokar på tyska ska se "Am Fenster", och tre
 * restauranger som skriver "fönster", "prozor" och "Fenster" hade blivit tre
 * olika bord. Listan speglar check-villkoret i migration 0054.
 *
 * Tillägget är ett belopp i valutans minsta enhet och hamnar på NOTAN i
 * restaurangen. Burp tar aldrig emot det, och det ingår inte i
 * avgiftsunderlaget — se regel 8 om vad som är restaurangens pengar.
 */
/* Listan ligger i `lib/table-attributes.ts` — se kommentaren där. */

export async function saveTableBooking(
  tableId: string,
  input: { attributes: string[]; surcharge: string },
): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  // Okända värden faller bort i stället för att nekas. Databasen skulle ändå
  // avvisa dem, och ett constraint-brott är inte ett besked någon kan agera på.
  const attributes = [...new Set(input.attributes)].filter((value): value is TableAttribute =>
    (TABLE_ATTRIBUTES as readonly string[]).includes(value),
  );

  const trimmed = input.surcharge.trim();
  const surchargeOre = trimmed === "" ? 0 : parseAmount(trimmed, staff.currency);

  if (surchargeOre === null || surchargeOre < 0) {
    return { ok: false, message: staffErrors(staff).surchargeInvalid };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tables")
    .update({ attributes, surcharge_ore: surchargeOre })
    .eq("id", tableId)
    .eq("restaurant_id", staff.restaurantId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/bord");
  // Borden syns i bokningsformuläret på den publika sidan.
  revalidatePath("/r", "layout");
  return { ok: true };
}
