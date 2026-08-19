import "server-only";

import { randomBytes } from "node:crypto";
import {
  applyGiftCard,
  formatGiftCardCode,
  giftCardCodeFromBytes,
  isValidGiftCardCode,
  normalizeGiftCardCode,
  type CurrencyCode,
  type GiftCardProblem,
} from "@burp/core";
import { createAdminClient } from "./supabase/admin";

/**
 * Presentkortens serversida.
 *
 * Uppslaget sker med service role därför att `gift_cards` medvetet saknar
 * SELECT-policy för gäster: en läsbar tabell hade varit en lista över
 * värdepapper. Servern slår upp ETT kort på dess kod och svarar med saldot
 * eller med ett skäl.
 *
 * Alla regler som avgör om kortet får användas ligger i `@burp/core` OCH i
 * `redeem_gift_card()`. Dubbleringen är avsiktlig: koden ger ett begripligt
 * svar direkt, databasen är garantin — och den enda som håller när två gäster
 * använder samma kort samtidigt.
 */

export type GiftCardLookup =
  | { ok: true; giftCardId: string; balanceOre: number; appliedOre: number }
  | { ok: false; problem: GiftCardProblem };

export async function resolveGiftCard(input: {
  code: string;
  restaurantId: string;
  currency: CurrencyCode;
  amountDueOre: number;
  now?: Date;
}): Promise<GiftCardLookup> {
  const code = normalizeGiftCardCode(input.code);
  if (!isValidGiftCardCode(code)) return { ok: false, problem: "UNKNOWN_CODE" };

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("gift_cards")
    .select("id, restaurant_id, currency, expires_at, is_active")
    .eq("code", code)
    .maybeSingle();

  if (!row) return { ok: false, problem: "UNKNOWN_CODE" };

  const { data: balance } = await supabase.rpc("gift_card_balance", {
    p_gift_card_id: row.id,
  });

  const result = applyGiftCard(
    {
      id: row.id,
      restaurantId: row.restaurant_id,
      currency: row.currency as CurrencyCode,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      isActive: row.is_active,
    },
    {
      restaurantId: input.restaurantId,
      currency: input.currency,
      amountDueOre: input.amountDueOre,
      balanceOre: balance ?? 0,
      now: input.now ?? new Date(),
    },
  );

  if (!result.ok) return result;

  return {
    ok: true,
    giftCardId: row.id,
    balanceOre: balance ?? 0,
    appliedOre: result.appliedOre,
  };
}

/**
 * Skapar en kod som inte redan finns.
 *
 * Kodrymden är 2^60, så en krock är osannolik — men "osannolik" är inte
 * "omöjlig", och ett unikt index gör krocken till ett fel i stället för till ett
 * kort som skriver över ett annat. Samma mönster som `createTable` använder mot
 * felkod 23505.
 */
export function generateGiftCardCode(): string {
  return giftCardCodeFromBytes(randomBytes(16));
}

export { formatGiftCardCode };
