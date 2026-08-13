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
