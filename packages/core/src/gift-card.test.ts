import { describe, expect, it } from "vitest";
import {
  applyGiftCard,
  formatGiftCardCode,
  giftCardBalance,
  giftCardCodeFromBytes,
  isValidGiftCardCode,
  normalizeGiftCardCode,
  type GiftCard,
  type GiftCardContext,
} from "./gift-card";
import { kronorToOre } from "./money";

const NOW = new Date("2026-08-19T12:00:00Z");

function card(overrides: Partial<GiftCard> = {}): GiftCard {
  return {
    id: "card-1",
    restaurantId: "rest-1",
    currency: "BAM",
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

function context(overrides: Partial<GiftCardContext> = {}): GiftCardContext {
  return {
    restaurantId: "rest-1",
    currency: "BAM",
    amountDueOre: kronorToOre(12),
    balanceOre: kronorToOre(50),
    now: NOW,
    ...overrides,
  };
}

describe("giftCardBalance", () => {
  it("summerar utgivning minus inlösen", () => {
    expect(
      giftCardBalance([
        { kind: "ISSUE", amountOre: kronorToOre(50) },
        { kind: "REDEEM", amountOre: kronorToOre(12) },
      ]),
    ).toBe(kronorToOre(38));
  });

  it("en återbetalning lägger tillbaka värdet på kortet", () => {
    // Pengarna ska tillbaka dit de kom ifrån. Annars är presentkortet en väg
    // att växla in förbetalt värde mot kontanter.
    expect(
      giftCardBalance([
        { kind: "ISSUE", amountOre: kronorToOre(50) },
        { kind: "REDEEM", amountOre: kronorToOre(12) },
        { kind: "REFUND", amountOre: kronorToOre(12) },
      ]),
    ).toBe(kronorToOre(50));
  });

  it("tomt kort är noll, inte odefinierat", () => {
    expect(giftCardBalance([])).toBe(0);
  });

  it("vägrar en rad med negativt belopp", () => {
    // Tecknet följer av kind. En negativ ISSUE hade varit ett andra sätt att
    // uttrycka en inlösen, och två sätt glider isär.
    expect(() => giftCardBalance([{ kind: "ISSUE", amountOre: -100 }])).toThrow(RangeError);
  });
});

describe("applyGiftCard", () => {
  it("betalar hela notan när saldot räcker", () => {
    const result = applyGiftCard(card(), context());
    expect(result).toEqual({
      ok: true,
      appliedOre: kronorToOre(12),
      remainingBalanceOre: kronorToOre(38),
      remainingDueOre: 0,
    });
  });

  it("betalar så långt saldot räcker och lämnar resten att debitera", () => {
    const result = applyGiftCard(card(), context({ balanceOre: kronorToOre(5) }));
    expect(result).toEqual({
      ok: true,
      appliedOre: kronorToOre(5),
      remainingBalanceOre: 0,
      remainingDueOre: kronorToOre(7),
    });
  });

  it("gäller inte hos en annan restaurang", () => {
    // Spärren som gör konstruktionen möjlig utan tillstånd att ge ut
    // elektroniska pengar.
    const result = applyGiftCard(card({ restaurantId: "rest-2" }), context());
    expect(result).toEqual({ ok: false, problem: "WRONG_RESTAURANT" });
  });

  it("gäller inte i en annan valuta", () => {
    const result = applyGiftCard(card({ currency: "EUR" }), context({ currency: "BAM" }));
    expect(result).toEqual({ ok: false, problem: "WRONG_CURRENCY" });
  });

  it("ett tomt kort går inte att använda", () => {
    expect(applyGiftCard(card(), context({ balanceOre: 0 }))).toEqual({
      ok: false,
      problem: "EMPTY",
    });
  });

  it("ett utgånget kort går inte att använda", () => {
    const result = applyGiftCard(
      card({ expiresAt: new Date("2026-01-01T00:00:00Z") }),
      context(),
    );
    expect(result).toEqual({ ok: false, problem: "EXPIRED" });
  });

  it("ett spärrat kort går inte att använda", () => {
    expect(applyGiftCard(card({ isActive: false }), context())).toEqual({
      ok: false,
      problem: "INACTIVE",
    });
  });
});

describe("koden", () => {
  it("normaliserar hur gästen faktiskt skriver av den", () => {
    expect(normalizeGiftCardCode("a2b3-c4d5 e6f7")).toBe("A2B3C4D5E6F7");
  });

  it("skrivs i grupper om fyra", () => {
    expect(formatGiftCardCode("A2B3C4D5E6F7")).toBe("A2B3-C4D5-E6F7");
  });

  it("undviker förväxlingsbara tecken", () => {
    const code = giftCardCodeFromBytes(new Uint8Array(Array.from({ length: 12 }, (_, i) => i)));
    expect(code).not.toMatch(/[01IO]/);
    expect(isValidGiftCardCode(code)).toBe(true);
  });

  it("avvisar en kod med fel längd", () => {
    expect(isValidGiftCardCode("A2B3")).toBe(false);
  });

  it("avvisar en kod med en nolla i", () => {
    expect(isValidGiftCardCode("A2B3C4D5E6F0")).toBe(false);
  });

  it("kräver tillräckligt med slump", () => {
    expect(() => giftCardCodeFromBytes(new Uint8Array(4))).toThrow(RangeError);
  });
});
