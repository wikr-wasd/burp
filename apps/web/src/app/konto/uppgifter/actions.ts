"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eraseGuest } from "@/lib/gdpr";
import { getGuest } from "@/lib/guest";
import { dictionary, fill, requestLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * Radering av det egna kontot (artikel 17).
 *
 * Gästen kan bara radera SIG SJÄLV. Id:t kommer ur den verifierade sessionen
 * och tas aldrig emot som argument — en parameter hade varit en inbjudan att
 * prova någon annans.
 *
 * Bekräftelseordet kontrolleras här och inte bara i webbläsaren. En
 * knapp som skickar samma anrop utan att någon skrivit något är en klickning
 * bort i devtools, och det här är den enda åtgärden i produkten som inte går
 * att ångra.
 */

export interface EraseActionResult {
  ok: boolean;
  message?: string;
}

const CONFIRMATION = "RADERA";

export async function eraseMyAccount(confirmation: string): Promise<EraseActionResult> {
  const guest = await getGuest();
  const t = dictionary(await requestLocale()).account;

  if (!guest) {
    return { ok: false, message: t.errors.mustBeLoggedIn };
  }

  // Ordet självt översätts inte — se `delete-account.tsx`. Det är ett lösenord
  // och inte en mening, och ett översatt ord hade krävt att servern och
  // webbläsaren är överens om språket i exakt det ögonblicket.
  if (confirmation.trim().toUpperCase() !== CONFIRMATION) {
    return { ok: false, message: fill(t.errors.confirmWord, { word: CONFIRMATION }) };
  }

  const result = await eraseGuest(guest.userId);

  if (!result.ok) {
    return { ok: false, message: result.message ?? t.errors.eraseFailed };
  }

  /*
   * Sessionen städas bort efteråt.
   *
   * Kontot finns inte längre, så cookien pekar på ingenting — men den ligger
   * kvar i webbläsaren tills något tar bort den, och en gäst som ser sig själv
   * "inloggad" efter en radering har ingen anledning att tro att den gick
   * igenom. `signOut` kan misslyckas mot ett borttaget konto; det får inte
   * stoppa något, raderingen är redan gjord.
   */
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Avsiktligt tyst. Se ovan.
  }

  redirect("/konto/raderat");
}

/**
 * Samtycke till utskick — att lämna det, och att ta tillbaka det.
 *
 * Skriver genom gästens EGEN session. `profiles` har redan en policy som säger
 * att var och en råder över sin egen rad, så service role vore både onödig och
 * fel: det enda id som får skrivas är det som sessionen bevisar.
 *
 * GDPR kräver att ett samtycke går att återkalla lika enkelt som det lämnades.
 * Den här åtgärden är därför inte en inställning bland andra — den är andra
 * halvan av rutan vid registreringen.
 */
export async function setMarketingOptIn(optIn: boolean): Promise<EraseActionResult> {
  const guest = await getGuest();
  const t = dictionary(await requestLocale()).account;

  if (!guest) {
    return { ok: false, message: t.errors.mustBeLoggedIn };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ marketing_opt_in: optIn })
    .eq("id", guest.userId);

  if (error) return { ok: false, message: t.errors.favoriteFailed };

  revalidatePath("/konto/uppgifter");
  return { ok: true };
}

/* ── Profilbilden ────────────────────────────────────────────────────────── */

/**
 * Kopplar en uppladdad bild till gästens profil.
 *
 * Filen ligger redan i Storage när det här anropas — samma ordning som för
 * restaurangernas bilder, och av samma skäl: en pekare till en fil som inte
 * finns är en trasig bild, en fil utan pekare är skräp ingen ser.
 *
 * Den GAMLA bilden raderas här. Utan det växer bucketen med varje byte, och
 * gamla ansikten blir kvar i en lagring som ingen städar — vilket är precis
 * den sortens data GDPR-flödet finns för att bli av med.
 */
export async function saveAvatar(storagePath: string): Promise<EraseActionResult> {
  const guest = await getGuest();
  const t = dictionary(await requestLocale()).account;

  if (!guest) return { ok: false, message: t.errors.mustBeLoggedIn };

  // Sökvägen måste börja med gästens eget id. Storage-policyn säger samma sak
  // om filen; den här kontrollen hindrar att profilen pekar på någon annans.
  if (!storagePath.startsWith(`${guest.userId}/`)) {
    return { ok: false, message: t.errors.saveFailed };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", guest.userId)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: storagePath })
    .eq("id", guest.userId);

  if (error) return { ok: false, message: t.errors.saveFailed };

  if (existing?.avatar_path && existing.avatar_path !== storagePath) {
    await supabase.storage.from("guest-avatars").remove([existing.avatar_path]);
  }

  revalidatePath("/konto");
  revalidatePath("/konto/uppgifter");
  return { ok: true };
}

/** Tar bort bilden — både pekaren och filen. */
export async function removeAvatar(): Promise<EraseActionResult> {
  const guest = await getGuest();
  const t = dictionary(await requestLocale()).account;

  if (!guest) return { ok: false, message: t.errors.mustBeLoggedIn };

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", guest.userId)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", guest.userId);

  if (error) return { ok: false, message: t.errors.saveFailed };

  if (profile?.avatar_path) {
    await supabase.storage.from("guest-avatars").remove([profile.avatar_path]);
  }

  revalidatePath("/konto");
  revalidatePath("/konto/uppgifter");
  return { ok: true };
}

/**
 * Gästens val att visa bilden på sina omdömen.
 *
 * Eget val och inte en följd av att hon laddat upp en bild. Uppladdningen i
 * migration 0067 stod under löftet "bara du ser den", och ett löfte upphävs
 * inte av att en kolumn tillkommer.
 *
 * Statusen rörs inte här — `profiles_avatar_guard` (0068) avvisar en gäst som
 * försöker godkänna sin egen bild, och nollställer granskningen så fort bilden
 * byts.
 */
export async function setAvatarPublic(isPublic: boolean): Promise<EraseActionResult> {
  const guest = await getGuest();
  const t = dictionary(await requestLocale()).account;

  if (!guest) return { ok: false, message: t.errors.mustBeLoggedIn };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_public: isPublic })
    .eq("id", guest.userId);

  if (error) return { ok: false, message: t.errors.saveFailed };

  revalidatePath("/konto/uppgifter");
  return { ok: true };
}

/**
 * Namnet gästen väljer att visa vid sina omdömen (migration 0069).
 *
 * Aldrig hennes profilnamn. `full_name` är vad hon heter; det här är vad hon
 * valt att kalla sig offentligt, och tomt betyder att omdömet står som "Gäst"
 * — vilket är det vanliga fallet.
 */
export async function setDisplayName(name: string): Promise<EraseActionResult> {
  const guest = await getGuest();
  const t = dictionary(await requestLocale()).account;

  if (!guest) return { ok: false, message: t.errors.mustBeLoggedIn };

  const trimmed = name.trim();
  if (trimmed.length > 40) {
    return { ok: false, message: t.displayNameTooLong };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    // Tomt fält betyder "jag vill inte synas", inte en tom sträng i databasen.
    .update({ display_name: trimmed === "" ? null : trimmed })
    .eq("id", guest.userId);

  if (error) return { ok: false, message: t.errors.saveFailed };

  revalidatePath("/konto/uppgifter");
  return { ok: true };
}
