"use server";

import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Personalens egna notisenheter.
 *
 * Skrivs med den inloggades egen session, inte service role: policyn i
 * migration 0036 säger att man bara får spara sina egna rader, och bara för en
 * restaurang man faktiskt jobbar på. Det är RLS som avgör — den här filen ska
 * inte upprepa kontrollen och därmed kunna glömma den.
 *
 * Kocken ingår. Han är den som står vid ugnen och den som skärmen är byggd för;
 * att stänga ute honom från larmet vore att bygga larmet åt fel person.
 */

export interface PushActionResult {
  ok: boolean;
  message?: string;
}

/** Vad webbläsaren ger oss när den prenumererat. */
export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}

export async function savePushSubscription(
  input: PushSubscriptionInput,
): Promise<PushActionResult> {
  const staff = await requireStaff();

  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { ok: false, message: "Prenumerationen var ofullständig." };
  }

  const supabase = await createClient();

  /*
   * Upsert på endpoint.
   *
   * Webbläsaren kan ge samma endpoint igen efter en omprenumeration — då är det
   * samma enhet och raden ska uppdateras, inte dubbleras. Byter personalen
   * restaurang följer prenumerationen med.
   */
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: staff.userId,
      restaurant_id: staff.restaurantId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent.slice(0, 300),
      failure_count: 0,
    },
    { onConflict: "endpoint" },
  );

  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<PushActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  return error ? { ok: false, message: error.message } : { ok: true };
}
