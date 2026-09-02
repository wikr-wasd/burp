"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, staffErrors } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toAdjustColumns, type ImageAdjust } from "@burp/core";

/**
 * Registrerar en uppladdad bild i `media` (avsnitt 8.3).
 *
 * Filen ligger redan i Storage när det här anropas — klienten laddar upp
 * direkt dit. Den här åtgärden skapar bara posten, alltid som PENDING.
 * Restaurangen kan inte sätta status själv: `media_insert_staff` i migration
 * 0017 kräver PENDING i sin WITH CHECK, så en manipulerad klient kommer inte
 * runt granskningen.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function registerMedia(input: {
  restaurantId: string;
  menuItemId: string | null;
  storagePath: string;
  altText: string | null;
  /**
   * Vad restaurangbilden är (migration 0053). Utelämnad = huvudbild, vilket
   * är vad varje uppladdning betydde innan logotyp och banner fanns.
   */
  purpose?: "HERO" | "LOGO" | "BANNER";
}): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  // Sökvägen måste börja med den egna restaurangens id. Storage-policyn säger
  // samma sak, men den kontrollerar filen — den här kontrollen hindrar att en
  // post pekar på någon annans fil.
  if (!input.storagePath.startsWith(`${staff.restaurantId}/`)) {
    return { ok: false, message: staffErrors(staff).imageNotYours };
  }

  if (input.restaurantId !== staff.restaurantId) {
    return { ok: false, message: "Fel restaurang." };
  }

  const supabase = await createClient();

  const purpose = input.menuItemId === null ? (input.purpose ?? "HERO") : "HERO";

  const { error } = await supabase.from("media").insert({
    restaurant_id: staff.restaurantId,
    menu_item_id: input.menuItemId,
    kind: "IMAGE",
    storage_path: input.storagePath,
    alt_text: input.altText?.slice(0, 200) || null,
    // Huvudbild bara när den inte hör till en enskild rätt.
    is_primary: input.menuItemId === null && purpose === "HERO",
    purpose,
    status: "PENDING",
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/meny");
  // Huvudbilden laddas upp från inställningarna, inte från menyn.
  revalidatePath("/dashboard/installningar");
  return { ok: true };
}

/**
 * Tar bort en bild som ännu inte granskats.
 *
 * Godkänd media rörs inte här — den ligger publikt och ska dras tillbaka via
 * backoffice, så att beslutet loggas där det fattades.
 */
export async function deletePendingMedia(mediaId: string): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  const supabase = await createClient();

  const { data: media } = await supabase
    .from("media")
    .select("id, status, storage_path")
    .eq("id", mediaId)
    .maybeSingle();

  if (!media) return { ok: false, message: "Bilden hittades inte." };
  if (media.status === "APPROVED") {
    return { ok: false, message: staffErrors(staff).approvedImageSupport };
  }

  if (media.storage_path) {
    // Filen först, posten sedan. Misslyckas filraderingen ska posten finnas
    // kvar så att bilden går att hitta igen — en fil utan post är skräp som
    // ingen ser.
    const { error: storageError } = await supabase.storage
      .from("menu-media")
      .remove([media.storage_path]);

    if (storageError) return { ok: false, message: storageError.message };
  }

  const { error } = await supabase.from("media").delete().eq("id", mediaId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/meny");
  // Huvudbilden laddas upp från inställningarna, inte från menyn.
  revalidatePath("/dashboard/installningar");
  return { ok: true };
}

/**
 * Sparar restaurangens bildjustering (migration 0063).
 *
 * Går genom personalens egen session och inte service role: `media_write_staff`
 * avgör att raden hör till den egna restaurangen, och `media_status_guard`
 * hindrar att något annat än justeringen ändras på vägen. Filtret på
 * `restaurant_id` är alltså inte det som skyddar — det är där för att en
 * felaktig id-gissning ska ge noll rader i stället för ett fel som låter som
 * ett behörighetsproblem.
 *
 * Ingen ny granskning krävs. Gränserna 85–115 i `toAdjustColumns()` är det som
 * gör att en justerad bild inte kan bli en annan bild.
 */
export async function saveImageAdjust(
  mediaId: string,
  adjust: ImageAdjust,
): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("media")
    .update(toAdjustColumns(adjust), { count: "exact" })
    .eq("id", mediaId)
    .eq("restaurant_id", staff.restaurantId);

  if (error) return { ok: false, message: error.message };
  if (count === 0) return { ok: false, message: staffErrors(staff).imageNotYours };

  revalidatePath("/dashboard/meny");
  revalidatePath("/dashboard/installningar");
  return { ok: true };
}
