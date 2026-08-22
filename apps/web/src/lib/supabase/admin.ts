import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "../env";
import type { Database } from "./database.types";

/**
 * Supabase-klient med service role. KRINGGÅR ALL RLS.
 *
 * Får bara användas där det finns ett skäl som inte går att lösa med en policy:
 *
 *   1. QR-flödet (avsnitt 4) — gästen är inte inloggad och har ingen `auth.uid()`
 *      att skriva en policy mot. Servern verifierar bordstokenet i stället och
 *      agerar sedan för gästens räkning.
 *   2. Webhooks från betalleverantören — inget användarsammanhang alls.
 *   3. Bakgrundsjobb (poängutgång, snittbetyg).
 *
 * Varje anrop MÅSTE själv filtrera på restaurant_id. Utan RLS finns inget
 * skyddsnät om ett filter glöms bort.
 *
 * `import "server-only"` gör att bygget kraschar om filen råkar importeras
 * från en klientkomponent.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
