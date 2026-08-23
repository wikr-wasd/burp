"use server";

import type {
  PushActionResult,
  PushSubscriptionInput,
} from "@/components/notifications/push-toggle";
import { requireGuest } from "@/lib/guest";
import { dictionary, requestLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * Gästens egna notisenheter.
 *
 * Samma tabell som personalens, men med `restaurant_id` som NULL — se
 * migration 0050. NULL betyder "mina order", inte "alla restauranger", och
 * policyn kontrollerar det: en gäst som skickar in ett restaurang-id nekas,
 * eftersom hon annars hade prenumererat på allt som beställs där.
 *
 * Skrivs med gästens egen session och inte med service role. Det är RLS som
 * avgör vem raden får höra till; den här filen ska inte upprepa kontrollen och
 * därmed kunna glömma den.
 *
 * Felmeddelandet kommer på sidans språk. `/konto` läser `Accept-Language` och
 * har inget språk i adressen — samma val som QR-sidan och kvittona gör.
 */

export async function saveGuestPushSubscription(
  input: PushSubscriptionInput,
): Promise<PushActionResult> {
  const guest = await requireGuest();
  const t = dictionary(await requestLocale()).account;

  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { ok: false, message: t.pushIncomplete };
  }

  const supabase = await createClient();

  /*
   * Upsert på endpoint.
   *
   * Webbläsaren kan ge samma endpoint igen efter en omprenumeration — då är det
   * samma enhet och raden ska uppdateras, inte dubbleras. Samma enhet kan
   * dessutom ha varit personalens och sedan bli en gästs: raden skrivs då om
   * med NULL i restaurangen, vilket är precis vad som ska hända när någon
   * loggar in som sig själv i stället för som anställd.
   */
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: guest.userId,
      restaurant_id: null,
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

export async function removeGuestPushSubscription(
  endpoint: string,
): Promise<PushActionResult> {
  await requireGuest();

  const supabase = await createClient();

  // Ingen kontroll av vems raden är: policyn släpper bara igenom
  // `user_id = auth.uid()`, så en främmande endpoint träffar noll rader.
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  return error ? { ok: false, message: error.message } : { ok: true };
}
