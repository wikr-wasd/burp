import { describe, expect, it } from "vitest";
import { applyCoupon, normalizeCouponCode, type Coupon, type CouponContext } from "./coupon";
import { calculateFee, calculateOrderTotals } from "./pricing";
import { kronorToOre } from "./money";
import type { PricedLine } from "./types";

const NOW = new Date("2026-08-18T12:00:00Z");

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: "coupon-1",
    code: "SOMMAR25",
    restaurantId: null,
    discountOre: null,
    discountBps: 2500,
    currency: null,
    minOrderOre: 0,
    maxDiscountOre: null,
    validFrom: null,
    validUntil: null,
    maxRedemptions: null,
    maxPerGuest: 0,
    isActive: true,
    fundedBy: "BURP",
    ...overrides,
  };
}

function context(overrides: Partial<CouponContext> = {}): CouponContext {
  return {
    restaurantId: "rest-1",
    currency: "BAM",
    itemsGrossOre: kronorToOre(20),
    totalRedemptions: 0,
    guestRedemptions: 0,
    guestId: "guest-1",
    now: NOW,
    ...overrides,
  };
}

describe("normalizeCouponCode", () => {
  it("tål hur en gäst faktiskt skriver av en kod", () => {
    expect(normalizeCouponCode(" sommar-25 ")).toBe("SOMMAR25");
    expect(normalizeCouponCode("Sommar 25")).toBe("SOMMAR25");
  });
});

describe("applyCoupon", () => {
  it("räknar en procentrabatt på varukorgen", () => {
    const result = applyCoupon(coupon({ discountBps: 2500 }), context());
    expect(result).toEqual({ ok: true, discountOre: kronorToOre(5) });
  });

  it("räknar ett fast belopp", () => {
    const result = applyCoupon(
      coupon({ discountBps: null, discountOre: kronorToOre(3), currency: "BAM" }),
      context(),
    );
    expect(result).toEqual({ ok: true, discountOre: kronorToOre(3) });
  });

  it("ett fast belopp i fel valuta gäller inte", () => {
    // 500 är fem mark i Sarajevo och fem dinarer i Beograd. Det ena är en
    // rabatt, det andra är ingenting.
    const result = applyCoupon(
      coupon({ discountBps: null, discountOre: 500, currency: "RSD" }),
      context({ currency: "BAM" }),
    );
    expect(result).toEqual({ ok: false, problem: "WRONG_CURRENCY" });
  });

  it("taket håller en procentrabatt i schack", () => {
    const result = applyCoupon(
      coupon({ discountBps: 5000, maxDiscountOre: kronorToOre(4) }),
      context({ itemsGrossOre: kronorToOre(100) }),
    );
    expect(result).toEqual({ ok: true, discountOre: kronorToOre(4) });
  });

  it("gör aldrig ordern negativ", () => {
    const result = applyCoupon(
      coupon({ discountBps: null, discountOre: kronorToOre(50), currency: "BAM" }),
      context({ itemsGrossOre: kronorToOre(12) }),
    );
    expect(result).toEqual({ ok: true, discountOre: kronorToOre(12) });
  });

  it("respekterar minsta ordersumma", () => {
    const result = applyCoupon(
      coupon({ minOrderOre: kronorToOre(30) }),
      context({ itemsGrossOre: kronorToOre(20) }),
    );
    expect(result).toEqual({ ok: false, problem: "BELOW_MINIMUM" });
  });

  it("en restaurangs kupong gäller inte hos en annan", () => {
    const result = applyCoupon(coupon({ restaurantId: "rest-2" }), context());
    expect(result).toEqual({ ok: false, problem: "WRONG_RESTAURANT" });
  });

  it("en plattformsbred kupong gäller överallt", () => {
    const result = applyCoupon(coupon({ restaurantId: null }), context());
    expect(result.ok).toBe(true);
  });

  it("gäller inte före sin starttid", () => {
    const result = applyCoupon(
      coupon({ validFrom: new Date("2026-09-01T00:00:00Z") }),
      context(),
    );
    expect(result).toEqual({ ok: false, problem: "NOT_STARTED" });
  });

  it("gäller inte efter sin sluttid", () => {
    const result = applyCoupon(
      coupon({ validUntil: new Date("2026-08-01T00:00:00Z") }),
      context(),
    );
    expect(result).toEqual({ ok: false, problem: "EXPIRED" });
  });

  it("tar slut när upplagan är slut", () => {
    const result = applyCoupon(
      coupon({ maxRedemptions: 100 }),
      context({ totalRedemptions: 100 }),
    );
    expect(result).toEqual({ ok: false, problem: "USED_UP" });
  });

  it("en gäst som redan använt koden får inte igen", () => {
    const result = applyCoupon(
      coupon({ maxPerGuest: 1 }),
      context({ guestRedemptions: 1 }),
    );
    expect(result).toEqual({ ok: false, problem: "ALREADY_USED" });
  });

  it("en gräns per gäst kräver ett konto", () => {
    // Den anonyma QR-gästen går inte att räkna inlösen på. Att låta gränsen
    // gälla ändå hade betytt att den inte gällde alls vid bordet.
    const result = applyCoupon(coupon({ maxPerGuest: 1 }), context({ guestId: null }));
    expect(result).toEqual({ ok: false, problem: "GUEST_REQUIRED" });
  });

  it("en kupong utan gräns per gäst fungerar för den anonyma gästen", () => {
    const result = applyCoupon(coupon({ maxPerGuest: 0 }), context({ guestId: null }));
    expect(result.ok).toBe(true);
  });

  it("en avstängd kupong gäller inte", () => {
    expect(applyCoupon(coupon({ isActive: false }), context())).toEqual({
      ok: false,
      problem: "INACTIVE",
    });
  });
});

describe("rabatten i ordersumman", () => {
  const line: PricedLine = {
    menuItemId: "item-1",
    name: "Ćevapi",
    unitPriceOre: kronorToOre(20),
    quantity: 1,
    vatRateBps: 1700,
    options: [],
  };

  it("sänker både notan och avgiftsunderlaget", () => {
    const applied = applyCoupon(coupon({ discountBps: 2500 }), context());
    if (!applied.ok) throw new Error("kupongen skulle ha gällt");

    const totals = calculateOrderTotals({ lines: [line], discountOre: applied.discountOre });
    expect(totals.discountOre).toBe(-kronorToOre(5));
    expect(totals.totalOre).toBe(kronorToOre(15));

    // Burps avgift räknas efter rabatt — restaurangen ska inte betala 3,4 % på
    // pengar den aldrig fick in, och Burp är därmed med och bekostar kampanjen.
    const fee = calculateFee(totals, "GROSS_ITEMS", 340);
    expect(fee.baseAmountOre).toBe(kronorToOre(15));
  });

  it("momsen räknas fortfarande på hela varukorgen", () => {
    // Rabatten är inte kopplad till en enskild rad, så den kan inte fördelas
    // per momssats. Uppdelningen står kvar på bruttot; det är restaurangens
    // bokföring som avgör hur rabatten hanteras där.
    const totals = calculateOrderTotals({ lines: [line], discountOre: kronorToOre(5) });
    expect(totals.itemsVatOre).toBe(calculateOrderTotals({ lines: [line] }).itemsVatOre);
  });
});
