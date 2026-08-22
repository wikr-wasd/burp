"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "../env";
import type { Database } from "./database.types";

/**
 * Supabase-klient för browsern.
 *
 * Använder anon-nyckeln och lyder alla RLS-policies. Sessionen ligger i
 * cookies (inte localStorage) så att server components och middleware ser
 * samma inloggning.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
