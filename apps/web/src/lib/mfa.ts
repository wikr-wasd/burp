import "server-only";

import { MFA_CHALLENGE_PATH } from "./mfa-path";
import { createClient } from "./supabase/server";

export { MFA_CHALLENGE_PATH };

/**
 * Andra faktorn, sedd från appen.
 *
 * Egen modul och inte en del av `lib/auth.ts`, av en enkel anledning:
 * `lib/platform.ts` behöver samma kontroll, och `auth.ts` importerar redan
 * `getPlatformAdmin()` därifrån. En import åt andra hållet hade slutit en
 * cirkel. Frågan "har den här sessionen klarat sin andra faktor" hör dessutom
 * varken till restaurangpersonalen eller till Burps egen personal — den gäller
 * inloggningen, som är gemensam.
 *
 * DET HÄR ÄR LAGER TVÅ AV TRE. Proxy:n omdirigerar, den här modulen svarar på
 * frågan i server components, och grinden som faktiskt håller ligger i
 * databasen: `mfa_satisfied()` i migration 0051 sitter i `is_staff_of`,
 * `has_role_at`, `is_platform_admin` och `has_platform_role`.
 *
 * Utan databaslagret vore allt det här bara en omdirigering, och en
 * omdirigering går runt genom att anropa PostgREST direkt med samma
 * access-token.
 */

/**
 * Har personen en registrerad andra faktor som sessionen ännu inte klarat?
 *
 * `getAuthenticatorAssuranceLevel()` räknas fram ur den redan hämtade
 * sessionens JWT och kostar inget nätanrop. `nextLevel` blir `aal2` först när
 * det finns en VERIFIERAD faktor — den som påbörjat en registrering men aldrig
 * matat in sin första kod låses alltså inte ute halvvägs.
 *
 * Kontrollen behövs trots RLS, och skälet är UPPLEVELSEN: en ägare med aal1
 * ser inga rader alls, och en tom dashboard läser som ett trasigt konto
 * snarare än som "du har inte matat in koden".
 */
export async function needsMfaChallenge(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error || !data) return false;

  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
