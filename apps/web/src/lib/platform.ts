import "server-only";

import { redirect } from "next/navigation";
import { MFA_CHALLENGE_PATH, needsMfaChallenge } from "./mfa";
import { createClient } from "./supabase/server";

/**
 * Burps egen backoffice (avsnitt 1, punkt 3).
 *
 * Skild från `lib/auth.ts`, som handlar om restaurangpersonal. En användare
 * kan i princip vara båda — en Burp-anställd som också driver en restaurang —
 * och de två rollerna ska inte blandas ihop någonstans i koden.
 */

export const PLATFORM_ROLES = ["support", "admin", "owner"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  support: "Support",
  admin: "Administratör",
  owner: "Ägare",
};

export interface PlatformContext {
  userId: string;
  email: string | null;
  role: PlatformRole;
}

export async function getPlatformAdmin(): Promise<PlatformContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("platform_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;

  return { userId: user.id, email: user.email ?? null, role: data.role as PlatformRole };
}

/**
 * Kräver Burp-personal.
 *
 * Skickar till startsidan, inte till inloggningen, för den som är inloggad men
 * saknar behörighet. En restaurangägare som råkar på /backoffice ska inte
 * mötas av ett formulär som antyder att ett annat lösenord skulle släppa in
 * hen — ytan ska inte ens bekräftas existera.
 */
export async function requirePlatformAdmin(
  allowed: readonly PlatformRole[] = PLATFORM_ROLES,
): Promise<PlatformContext> {
  const admin = await getPlatformAdmin();

  if (!admin) {
    /*
     * Andra faktorn först, av samma skäl som i `requireStaff()`.
     *
     * `is_platform_admin()` bär MFA-kravet sedan migration 0051, så en admin
     * med aal1 och en registrerad faktor får ingen rad ur `platform_admins` —
     * och hade utan den här grenen skickats till startsidan som vore hen
     * någon annan. Ytan ska inte bekräftas för den som saknar behörighet, men
     * den som HAR den ska inte behöva gissa varför den plötsligt är borta.
     */
    if (await needsMfaChallenge()) redirect(MFA_CHALLENGE_PATH);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    redirect(user ? "/" : "/logga-in?next=%2Fbackoffice");
  }

  if (!allowed.includes(admin.role)) {
    redirect("/backoffice");
  }

  return admin;
}
