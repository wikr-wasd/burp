import "server-only";

import webpush from "web-push";
import { publicEnv, serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webbpush till personalens enheter.
 *
 * Köksskärmen har redan ett ljudlarm när den är öppen. Det här är för när den
 * inte är det: den lilla restaurangen har ingen surfplatta, bara en telefon i
 * fickan, och brevet hamnar i en inkorg ingen öppnar en fredag kväll.
 *
 * Ingen leverantör. VAPID-nycklarna är våra, webbläsarens egen pushtjänst gör
 * resten, och meddelandet krypteras med prenumerationens nycklar — varken
 * pushtjänsten eller någon på vägen kan läsa vad som står i notisen.
 *
 * Precis som e-posten kastar ingenting här. En notis som inte gick fram är en
 * notis som inte gick fram; ordern ligger redan i databasen.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Dit notisen leder när någon trycker på den. */
  url: string;
  /**
   * Notiser med samma tagg ersätter varandra i systemets notiscenter.
   *
   * Order-id som tagg betyder att en gäst som ändrar sin beställning inte
   * lämnar två notiser efter sig — men två olika order larmar var för sig,
   * vilket är hela poängen i en rush.
   */
  tag: string;
}

export type PushOutcome =
  | { delivered: true; sent: number; removed: number }
  | { delivered: false; sent: number; removed: number; reason: "ALL_FAILED" }
  | { delivered: false; reason: "NOT_CONFIGURED" | "NO_SUBSCRIBERS" };

function configure(): boolean {
  const { VAPID_PRIVATE_KEY, VAPID_SUBJECT } = serverEnv();
  const publicKey = publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!publicKey || !VAPID_PRIVATE_KEY) return false;

  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, VAPID_PRIVATE_KEY);
  return true;
}

/**
 * Skickar till varje enhet som prenumererar för restaurangen.
 *
 * Service role: det här körs efter svaret, utan användarsammanhang. Frågan
 * filtrerar själv på `restaurant_id`, som regel 5 kräver.
 */
export async function sendPush(
  restaurantId: string,
  message: PushMessage,
): Promise<PushOutcome> {
  if (!configure()) return { delivered: false, reason: "NOT_CONFIGURED" };

  const supabase = createAdminClient();

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("restaurant_id", restaurantId);

  if (!subscriptions || subscriptions.length === 0) {
    return { delivered: false, reason: "NO_SUBSCRIBERS" };
  }

  const payload = JSON.stringify(message);
  const stale: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          // Notisen är värdelös en timme senare. Att låta pushtjänsten spara
          // den längre betyder bara att köket får veta om en order som redan
          // serverats.
          { TTL: 3600, urgency: "high" },
        );
        sent += 1;
      } catch (error) {
        /*
         * 404 och 410 betyder att prenumerationen är död: appen avinstallerad,
         * notiser avstängda, webbläsaren rensad. Raden ska bort — annars
         * försöker vi skicka till en adress som aldrig kommer att svara igen,
         * varje gång någon beställer.
         */
        const status = (error as { statusCode?: number }).statusCode;

        if (status === 404 || status === 410) {
          stale.push(row.id);
        } else {
          console.error(`[push] Utskicket till ${row.id} misslyckades:`, error);
        }
      }
    }),
  );

  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", stale);
  }

  if (sent > 0) {
    await supabase
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("restaurant_id", restaurantId);
  }

  return sent > 0
    ? { delivered: true, sent, removed: stale.length }
    : { delivered: false, sent, removed: stale.length, reason: "ALL_FAILED" };
}

/** Går push att erbjuda alls? Avgör om knappen visas för personalen. */
export function isPushConfigured(): boolean {
  return Boolean(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY && serverEnv().VAPID_PRIVATE_KEY);
}
