"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * Personalens språkval.
 *
 * Ligger som en egen fil och inte i `installningar/actions.ts`, därför att den
 * filen kräver ägare eller chef. Språket är personens eget och måste kunna
 * sättas av alla fyra rollerna — också kocken, som bara har köksskärmen.
 *
 * Skrivningen går genom `set_staff_locale()` (migration 0047) och inte genom
 * en vanlig update. Bara ägaren får skriva i `staff`, och det ska det förbli:
 * en policy som släppte igenom den egna raden hade släppt igenom alla dess
 * kolumner, och då kunde kocken sätta `role = 'owner'` på sig själv.
 * Funktionen kan bara skriva en enda kolumn, och bara på `auth.uid()`.
 */
export async function setStaffLocale(locale: string): Promise<{ ok: boolean }> {
  // Ingen rollista: alla som är personal någonstans får välja sitt eget språk.
  await requireStaff();

  // Kontrollen finns också som villkor i schemat. Den här är för att kunna
  // svara med ett nej i stället för att låta ett databasfel bubbla upp genom
  // en knapp någon just tryckt på.
  if (!isLocale(locale)) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_locale", { p_locale: locale });

  if (error) return { ok: false };

  // Språket sitter på sessionen och läses av varje personalyta. Utan den här
  // raden byter sidomenyn språk först nästa gång sidan råkar renderas om.
  revalidatePath("/dashboard", "layout");
  revalidatePath("/kok");

  return { ok: true };
}
