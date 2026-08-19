import "server-only";

import { isPunchCardEnabled, punchCardState, type PunchCardState } from "@burp/core";
import { createAdminClient } from "./supabase/admin";

export interface PunchCardOffer extends PunchCardState {
  /** Restaurangens tak för belöningen. Null = hela ordern bjuds. */
  maxRewardOre: number | null;
}

/**
 * Klippkortets serversida.
 *
 * Läget räknas ur order och uttag, aldrig ur ett lagrat antal (regel 7).
 * Funktionen svarar null när restaurangen inte har något klippkort eller när
 * gästen inte är inloggad — och det andra är inte en begränsning att beklaga.
 * En anonym QR-gäst går inte att räkna besök på, och ska inte gå att räkna
 * besök på: klippkortet får inte bli ett skäl att spåra den som valt bort konto.
 */

export async function getPunchCard(
  restaurantId: string,
  guestId: string | null,
): Promise<PunchCardOffer | null> {
  if (!guestId) return null;

  const supabase = createAdminClient();

  const [status, { data: settings }] = await Promise.all([
    supabase.rpc("punch_card_status", {
      p_restaurant_id: restaurantId,
      p_guest_id: guestId,
    }),
    supabase
      .from("restaurants")
      .select("punch_card_max_reward_ore")
      .eq("id", restaurantId)
      .maybeSingle(),
  ]);

  // Funktionen returnerar en tabell med noll eller en rad. Typerna för RPC:er
  // är inte genererade här, därför den explicita formen.
  const row = (status.data as { size: number | null; completed_orders: number; rewards_redeemed: number }[] | null)?.[0];

  if (!row || !isPunchCardEnabled(row.size)) return null;

  return {
    ...punchCardState({
      size: row.size,
      completedOrders: Number(row.completed_orders),
      rewardsRedeemed: Number(row.rewards_redeemed),
    }),
    maxRewardOre: settings?.punch_card_max_reward_ore ?? null,
  };
}
