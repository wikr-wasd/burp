import "server-only";

import {
  applyCoupon,
  normalizeCouponCode,
  type Coupon,
  type CouponProblem,
  type CurrencyCode,
} from "@burp/core";
import { createAdminClient } from "./supabase/admin";

/**
 * Kupongens väg från en kod till ett belopp.
 *
 * Uppslaget sker med service role därför att `coupons` medvetet saknar
 * SELECT-policy för gäster: en lista över giltiga koder är en lista att prova
 * igenom. Servern slår upp EN kod i taget och svarar med rabatten eller med ett
 * skäl — aldrig med kupongens villkor.
 *
 * Beloppet räknas i `@burp/core`, aldrig här och aldrig i en komponent.
 */

export type CouponLookup =
  | { ok: true; couponId: string; discountOre: number }
  | { ok: false; problem: CouponProblem };

export async function resolveCoupon(input: {
  code: string;
  restaurantId: string;
  currency: CurrencyCode;
  itemsGrossOre: number;
  guestId: string | null;
  now?: Date;
}): Promise<CouponLookup> {
  const code = normalizeCouponCode(input.code);
  if (!code) return { ok: false, problem: "UNKNOWN_CODE" };

  const supabase = createAdminClient();

  /*
   * Restaurangens egen kupong går före den plattformsbreda.
   *
   * Samma kod kan finnas på båda nivåerna — Burp kör "SOMMAR25" över hela
   * plattformen medan en restaurang har en egen med samma namn. Den som står
   * närmast gästen ska gälla, annars får restaurangen sin kampanj överkörd av
   * vår.
   */
  const { data: rows } = await supabase
    .from("coupons")
    .select(
      "id, code, restaurant_id, discount_ore, discount_bps, currency, min_order_ore, max_discount_ore, valid_from, valid_until, max_redemptions, max_per_guest, is_active, funded_by",
    )
    .eq("code", code)
    .or(`restaurant_id.eq.${input.restaurantId},restaurant_id.is.null`);

  const row =
    (rows ?? []).find((candidate) => candidate.restaurant_id === input.restaurantId) ??
    (rows ?? []).find((candidate) => candidate.restaurant_id === null);

  if (!row) return { ok: false, problem: "UNKNOWN_CODE" };

  const [{ count: totalRedemptions }, { count: guestRedemptions }] = await Promise.all([
    supabase
      .from("coupon_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", row.id),
    input.guestId
      ? supabase
          .from("coupon_redemptions")
          .select("id", { count: "exact", head: true })
          .eq("coupon_id", row.id)
          .eq("guest_id", input.guestId)
      : Promise.resolve({ count: 0 }),
  ]);

  const coupon: Coupon = {
    id: row.id,
    code: row.code,
    restaurantId: row.restaurant_id,
    discountOre: row.discount_ore,
    discountBps: row.discount_bps,
    currency: row.currency as CurrencyCode | null,
    minOrderOre: row.min_order_ore,
    maxDiscountOre: row.max_discount_ore,
    validFrom: row.valid_from ? new Date(row.valid_from) : null,
    validUntil: row.valid_until ? new Date(row.valid_until) : null,
    maxRedemptions: row.max_redemptions,
    maxPerGuest: row.max_per_guest,
    isActive: row.is_active,
    fundedBy: row.funded_by,
  };

  const result = applyCoupon(coupon, {
    restaurantId: input.restaurantId,
    currency: input.currency,
    itemsGrossOre: input.itemsGrossOre,
    totalRedemptions: totalRedemptions ?? 0,
    guestRedemptions: guestRedemptions ?? 0,
    guestId: input.guestId,
    now: input.now ?? new Date(),
  });

  if (!result.ok) return result;

  return { ok: true, couponId: coupon.id, discountOre: result.discountOre };
}
