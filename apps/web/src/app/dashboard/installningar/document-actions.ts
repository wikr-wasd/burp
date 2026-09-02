"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Restaurangens egna dokument (migration 0064).
 *
 * Samma ordning som för bilder: filen ligger redan i Storage när det här
 * anropas, och posten skapas efteråt. En post utan fil vore en rad i
 * granskningskön som pekar på ingenting.
 *
 * Statusen sätts aldrig här. `restaurant_documents_status_guard` avvisar en
 * restaurang som försöker godkänna sitt eget dokument — samma grind som
 * bilderna fick i 0063, av samma skäl: dokumentet hamnar på en indexerad sida
 * under Burps domän.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function registerDocument(input: {
  title: string;
  storagePath: string;
  sizeBytes: number;
}): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  const title = input.title.trim();
  if (title.length === 0 || title.length > 120) {
    return { ok: false, message: "Dokumentet behöver en titel på 1–120 tecken." };
  }

  // Sökvägen måste börja med den egna restaurangens id. Storage-policyn säger
  // samma sak om filen; den här kontrollen hindrar att posten pekar på någon
  // annans.
  if (!input.storagePath.startsWith(`${staff.restaurantId}/`)) {
    return { ok: false, message: "Dokumentet hör inte till din restaurang." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("restaurant_documents").insert({
    restaurant_id: staff.restaurantId,
    title,
    storage_path: input.storagePath,
    size_bytes: input.sizeBytes,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/installningar");
  return { ok: true };
}

/**
 * Tar bort ett dokument — både posten och filen.
 *
 * Ordningen är posten först. Blir filen kvar är den onåbar skräp i en bucket;
 * blir posten kvar utan fil är den en trasig länk på en publik sida.
 */
export async function deleteDocument(documentId: string): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("restaurant_documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("restaurant_id", staff.restaurantId)
    .maybeSingle();

  if (!row) return { ok: false, message: "Dokumentet finns inte." };

  const { error } = await supabase
    .from("restaurant_documents")
    .delete()
    .eq("id", documentId)
    .eq("restaurant_id", staff.restaurantId);

  if (error) return { ok: false, message: error.message };

  await supabase.storage.from("restaurant-docs").remove([row.storage_path]);

  revalidatePath("/dashboard/installningar");
  return { ok: true };
}
