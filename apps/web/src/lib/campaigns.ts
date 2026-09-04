import "server-only";

import type { CampaignRow, CampaignTemplate } from "./campaign-types";
import { createClient } from "./supabase/server";

/**
 * Utskicken till restaurangens egna gäster.
 *
 * ── Vem ett utskick FÅR gå till ────────────────────────────────────────────
 *
 * Två villkor, båda nödvändiga, och båda står i `campaign_audience()`
 * (migration 0076):
 *
 *   1. Gästen har sagt ja — `profiles.marketing_opt_in`, ett aktivt val.
 *   2. Gästen har handlat hos DEN HÄR restaurangen.
 *
 * Villkor 2 är inte bara juridik. Samtycket lämnades till Burp, inte till
 * varje restaurang på plattformen, och ett brev från ett ställe gästen aldrig
 * besökt är precis den spam som gör att nästa gäst inte kryssar i rutan.
 *
 * "Potentiella kunder" går alltså inte att nå den här vägen, och det är
 * avsikten. Räckvidd mot NYA gäster är plattformens egen yta — placering i
 * listorna, "Populär den här veckan", notiser till den som sparat stället —
 * inte andras inkorgar.
 *
 * ── Saldot ─────────────────────────────────────────────────────────────────
 *
 * Räknas ur `campaign_credit_events`, aldrig lagrat. Samma regel som
 * lojalitetspoängen, och av samma skäl: det här är pengar restaurangen
 * betalat för.
 */

/*
 * Typerna och mallistan ligger i `campaign-types.ts` — en fil UTAN runtime
 * under sig. Klientkomponenten som ritar utskicksrutan importerar dem, och en
 * import härifrån hade dragit in Supabase-klienten och `next/headers` i
 * klientbunten. Se kommentaren i den filen.
 */
export type { CampaignTemplate, CampaignRow } from "./campaign-types";
export { CAMPAIGN_TEMPLATES, isCampaignTemplate } from "./campaign-types";

export interface CampaignOverview {
  /** Vad som går att skicka: saldot restaurangen köpt, minus det som gått åt. */
  credits: number;
  /** Hur många som faktiskt får ta emot ett utskick just nu. */
  audience: number;
  history: CampaignRow[];
}

export async function getCampaignOverview(restaurantId: string): Promise<CampaignOverview> {
  const supabase = await createClient();

  // Tre oberoende frågor, alltså parallellt.
  const [{ data: credits }, { data: audience }, { data: history }] = await Promise.all([
    supabase.rpc("campaign_credits", { p_restaurant_id: restaurantId }),
    supabase.rpc("campaign_audience", { p_restaurant_id: restaurantId }),
    supabase
      .from("campaigns")
      .select("id, template, subject, status, recipients, failed, sent_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    credits: typeof credits === "number" ? credits : 0,
    // Bara ANTALET lämnar den här funktionen. Adresserna hämtas i
    // serveråtgärden när ett utskick faktiskt görs — en sida som råkar bära
    // gästernas e-postadresser i sin nyttolast är en läcka utan angripare.
    audience: Array.isArray(audience) ? audience.length : 0,
    history: (history ?? []).map((row) => ({
      id: row.id,
      template: row.template as CampaignTemplate,
      subject: row.subject,
      status: row.status as CampaignRow["status"],
      recipients: row.recipients,
      failed: row.failed,
      sentAt: row.sent_at,
    })),
  };
}
