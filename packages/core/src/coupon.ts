import { applyBasisPoints, assertOre, type Ore } from "./money";
import type { CurrencyCode } from "./country";

/**
 * Kuponger och erbjudanden.
 *
 * En kupong är en **rabatt**, inte ett betalmedel. Skillnaden avgör mer än man
 * tror: en rabatt sänker ordersumman och därmed både momsen och Burps
 * avgiftsunderlag, medan ett presentkort bara sänker vad som återstår att
 * debitera. Blandas de ihop blir momsen fel i restaurangens bokföring.
 *
 * Klienten skickar en KOD, aldrig ett belopp — exakt samma regel som gäller
 * priser. Beloppet räknas här, på servern, ur kupongens egna villkor.
 */

export const COUPON_FUNDERS = ["BURP", "RESTAURANT"] as const;
/**
 * Vem som bekostar kampanjen.
 *
 * Inte en bokföringsdetalj: `feeBaseAmount()` drar av rabatten ur
 * avgiftsunderlaget, alltså räknas Burps 3,4 % efter rabatt. Det betyder att
 * Burp är med och betalar varje kupong. Rimligt för en plattformsbred kampanj
 * vi själva driver, inte självklart för restaurangens egen — och fältet står
 * på raden så att beslutet går att ändra utan att historiken skrivs om.
 */
export type CouponFunder = (typeof COUPON_FUNDERS)[number];

export interface Coupon {
  id: string;
  code: string;
  /** Null = gäller hela plattformen. */
  restaurantId: string | null;
  /** Fast rabatt i valutans minsta enhet. Ömsesidigt uteslutande med `discountBps`. */
  discountOre: Ore | null;
  /** Rabatt i baspunkter av varukorgen. 1000 = 10 %. */
  discountBps: number | null;
  /** Kupongens valuta. Bara meningsfull för ett fast belopp. */
  currency: CurrencyCode | null;
  /** Lägsta ordersumma kupongen gäller på. */
  minOrderOre: Ore;
  /** Tak för procentrabatter, så att "20 % av allt" inte blir obegränsat. */
  maxDiscountOre: Ore | null;
  validFrom: Date | null;
  validUntil: Date | null;
  /** Null = obegränsat. */
  maxRedemptions: number | null;
  maxPerGuest: number;
  isActive: boolean;
  fundedBy: CouponFunder;
}

export type CouponProblem =
  | "UNKNOWN_CODE"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "WRONG_RESTAURANT"
  | "WRONG_CURRENCY"
  | "BELOW_MINIMUM"
  | "USED_UP"
  | "ALREADY_USED"
  | "GUEST_REQUIRED";

export const COUPON_PROBLEM_MESSAGES: Record<CouponProblem, string> = {
  UNKNOWN_CODE: "Koden finns inte.",
  INACTIVE: "Koden gäller inte längre.",
  NOT_STARTED: "Koden gäller inte än.",
  EXPIRED: "Koden har gått ut.",
  WRONG_RESTAURANT: "Koden gäller inte hos den här restaurangen.",
  WRONG_CURRENCY: "Koden gäller inte i den här valutan.",
  BELOW_MINIMUM: "Beställningen når inte upp till kodens minsta belopp.",
  USED_UP: "Koden är slut.",
  ALREADY_USED: "Du har redan använt den här koden.",
  GUEST_REQUIRED: "Koden kräver att du är inloggad.",
};

export interface CouponContext {
  restaurantId: string;
  currency: CurrencyCode;
  /** Varukorgen inkl. moms, utan dricks och utan leveransavgift. */
  itemsGrossOre: Ore;
  /** Hur många gånger kupongen lösts in totalt. */
  totalRedemptions: number;
  /** Hur många gånger just den här gästen löst in den. */
  guestRedemptions: number;
  /** Null för en anonym QR-gäst. */
  guestId: string | null;
  now: Date;
}

export type CouponResult =
  | { ok: true; discountOre: Ore }
  | { ok: false; problem: CouponProblem };

/**
 * Normaliserar en kupongkod.
 *
 * Gäster skriver av koder från en skylt, ett kvitto eller ett sms. De skriver
 * dem med gemener, med mellanslag och med bindestreck på fel ställe. En kod som
 * inte fungerar för att någon skrev "sommar 25" är ingen säkerhetsåtgärd, bara
 * en förlorad beställning.
 */
export function normalizeCouponCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Prövar en kupong mot en order och räknar fram rabatten.
 *
 * Returnerar rabatten som ett POSITIVT belopp. `orders.discount_ore` lagras
 * negativt, och konverteringen sker där raden skrivs — så att den som läser
 * den här funktionen inte behöver hålla två teckenkonventioner i huvudet.
 */
export function applyCoupon(coupon: Coupon, context: CouponContext): CouponResult {
  assertOre(context.itemsGrossOre, "varukorgens summa");

  if (!coupon.isActive) return { ok: false, problem: "INACTIVE" };

  if (coupon.validFrom && context.now < coupon.validFrom) {
    return { ok: false, problem: "NOT_STARTED" };
  }
  if (coupon.validUntil && context.now >= coupon.validUntil) {
    return { ok: false, problem: "EXPIRED" };
  }

  if (coupon.restaurantId !== null && coupon.restaurantId !== context.restaurantId) {
    return { ok: false, problem: "WRONG_RESTAURANT" };
  }

  // Ett fast belopp betyder olika saker i olika valutor. 500 är fem mark i
  // Sarajevo och fem dinarer i Beograd — det ena är en rabatt, det andra är
  // ingenting. En procentsats har inte det problemet och saknar därför valuta.
  if (coupon.discountOre !== null && coupon.currency !== context.currency) {
    return { ok: false, problem: "WRONG_CURRENCY" };
  }

  if (context.itemsGrossOre < coupon.minOrderOre) {
    return { ok: false, problem: "BELOW_MINIMUM" };
  }

  if (coupon.maxRedemptions !== null && context.totalRedemptions >= coupon.maxRedemptions) {
    return { ok: false, problem: "USED_UP" };
  }

  /*
   * En kupong med gräns per gäst kräver ett konto.
   *
   * En anonym QR-gäst går inte att räkna inlösen på — det finns ingenting att
   * räkna på. Att låta gränsen gälla ändå hade betytt att den inte gällde alls
   * vid bordet, vilket är den yta där kuponger annars är enklast att missbruka.
   */
  if (context.guestId === null) {
    if (coupon.maxPerGuest > 0) return { ok: false, problem: "GUEST_REQUIRED" };
  } else if (coupon.maxPerGuest > 0 && context.guestRedemptions >= coupon.maxPerGuest) {
    return { ok: false, problem: "ALREADY_USED" };
  }

  const raw =
    coupon.discountOre !== null
      ? coupon.discountOre
      : applyBasisPoints(context.itemsGrossOre, coupon.discountBps ?? 0);

  const capped =
    coupon.maxDiscountOre !== null ? Math.min(raw, coupon.maxDiscountOre) : raw;

  // Rabatten kan aldrig göra ordern negativ. En kupong på 50 mark mot en nota
  // på 12 ger 12 i rabatt, inte 38 tillbaka.
  const discountOre = Math.max(0, Math.min(capped, context.itemsGrossOre));

  return { ok: true, discountOre };
}
