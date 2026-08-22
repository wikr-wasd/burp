import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "../env";
import type { Database } from "./database.types";

/**
 * Supabase-klient för server components och route handlers.
 *
 * Kör som den inloggade användaren och lyder RLS. Det här är standardklienten
 * på servern — `createAdminClient()` ska bara användas där RLS bevisligen inte
 * räcker.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components får inte skriva cookies. Middleware förnyar
            // sessionen i stället, så det här är förväntat och inte ett fel.
          }
        },
      },
    },
  );
}
