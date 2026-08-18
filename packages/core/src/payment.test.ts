import { describe, expect, it } from "vitest";
import {
  allowedPaymentTransitions,
  amountToCharge,
  assertPaymentCoversOrder,
  assertPaymentTransition,
  canTransitionPayment,
  InsufficientPaymentError,
  InvalidPaymentTransitionError,
  isPaymentSettled,
  isPaymentTerminal,
  providerForMethod,
  requiresUpfrontPayment,
  statusAfterRefund,
} from "./payment";
import { calculateOrderTotals } from "./pricing";
import { kronorToOre } from "./money";
import { PAYMENT_STATUSES, type PricedLine } from "./types";

function line(overrides: Partial<PricedLine> = {}): PricedLine {
  return {
    menuItemId: "item-1",
    name: "Ćevapi",
    unitPriceOre: kronorToOre(12),
    quantity: 1,
    vatRateBps: 1700,
    options: [],
    ...overrides,
  };
}

const totals = (tipOre = 0) => calculateOrderTotals({ lines: [line()], tipOre });

describe("statusmaskinen", () => {
  it("låter en väntande betalning capturas direkt", () => {
    expect(canTransitionPayment("PENDING", "CAPTURED")).toBe(true);
  });

  it("låter en reserverad betalning capturas", () => {
    expect(canTransitionPayment("AUTHORIZED", "CAPTURED")).toBe(true);
  });

  it("tillåter aldrig att en misslyckad betalning återupplivas", () => {
    expect(allowedPaymentTransitions("FAILED")).toEqual([]);
    expect(canTransitionPayment("FAILED", "CAPTURED")).toBe(false);
  });

  it("tillåter aldrig att en återbetald betalning capturas igen", () => {
    expect(canTransitionPayment("REFUNDED", "CAPTURED")).toBe(false);
  });

  it("låter en delvis återbetald betalning återbetalas mer", () => {
    expect(canTransitionPayment("PARTIALLY_REFUNDED", "PARTIALLY_REFUNDED")).toBe(true);
    expect(canTransitionPayment("PARTIALLY_REFUNDED", "REFUNDED")).toBe(true);
  });

  it("går aldrig baklänges", () => {
    expect(canTransitionPayment("CAPTURED", "PENDING")).toBe(false);
    expect(canTransitionPayment("CAPTURED", "AUTHORIZED")).toBe(false);
  });

  it("kastar med de tillåtna stegen i meddelandet", () => {
    expect(() => assertPaymentTransition("CAPTURED", "PENDING")).toThrow(
      InvalidPaymentTransitionError,
    );
    expect(() => assertPaymentTransition("CAPTURED", "PENDING")).toThrow(/REFUNDED/);
  });

  it("har en regel för varje status i enumet", () => {
    for (const status of PAYMENT_STATUSES) {
      expect(Array.isArray(allowedPaymentTransitions(status))).toBe(true);
    }
  });

  it("skiljer slutläge från betald", () => {
    expect(isPaymentTerminal("REFUNDED")).toBe(true);
    expect(isPaymentTerminal("FAILED")).toBe(true);
    // Delvis återbetald är betald men inte avslutad — mer kan återbetalas.
    expect(isPaymentTerminal("PARTIALLY_REFUNDED")).toBe(false);
    expect(isPaymentSettled("PARTIALLY_REFUNDED")).toBe(true);
    expect(isPaymentSettled("AUTHORIZED")).toBe(false);
  });
});

describe("statusAfterRefund", () => {
  it("hela beloppet ger REFUNDED", () => {
    expect(statusAfterRefund(1200, 1200)).toBe("REFUNDED");
  });

  it("en del av beloppet ger PARTIALLY_REFUNDED", () => {
    expect(statusAfterRefund(1200, 400)).toBe("PARTIALLY_REFUNDED");
  });

  it("vägrar återbetala mer än som betalats", () => {
    expect(() => statusAfterRefund(1200, 1300)).toThrow(RangeError);
  });

  it("vägrar en återbetalning på noll", () => {
    expect(() => statusAfterRefund(1200, 0)).toThrow(RangeError);
  });
});

describe("amountToCharge", () => {
  it("hela notan när inget är betalt", () => {
    const result = amountToCharge(totals());
    expect(result.chargeOre).toBe(kronorToOre(12));
    expect(result.isFullyCovered).toBe(false);
  });

  it("drar av ett presentkort som täcker en del", () => {
    const result = amountToCharge(totals(), [kronorToOre(5)]);
    expect(result.coveredOre).toBe(kronorToOre(5));
    expect(result.chargeOre).toBe(kronorToOre(7));
  });

  it("går aldrig under noll när presentkortet är större än notan", () => {
    const result = amountToCharge(totals(), [kronorToOre(50)]);
    expect(result.chargeOre).toBe(0);
    expect(result.isFullyCovered).toBe(true);
  });

  it("presentkortet sänker inte ordersumman — bara det som debiteras", () => {
    const base = totals();
    const result = amountToCharge(base, [kronorToOre(5)]);
    // Momsen och avgiftsunderlaget räknas på hela notan. Ett presentkort är
    // betalmedel, inte rabatt.
    expect(result.totalOre).toBe(base.totalOre);
  });

  it("dricksen ska betalas den också", () => {
    const withTip = totals(kronorToOre(2));
    expect(amountToCharge(withTip).chargeOre).toBe(kronorToOre(14));
  });

  it("vägrar negativa täckande belopp", () => {
    expect(() => amountToCharge(totals(), [-100])).toThrow(RangeError);
  });
});

describe("assertPaymentCoversOrder", () => {
  it("släpper igenom en betalning som täcker notan exakt", () => {
    expect(() => assertPaymentCoversOrder(1200, [1200])).not.toThrow();
  });

  it("släpper igenom flera betalmedel som tillsammans täcker notan", () => {
    expect(() => assertPaymentCoversOrder(1200, [500, 700])).not.toThrow();
  });

  it("stoppar en webhook som säger betald på ett för litet belopp", () => {
    expect(() => assertPaymentCoversOrder(1200, [1199])).toThrow(InsufficientPaymentError);
  });
});

describe("providerForMethod", () => {
  it("kontant och presentkort är sina egna leverantörer", () => {
    expect(providerForMethod("CASH", null)).toBe("CASH");
    expect(providerForMethod("GIFT_CARD", null)).toBe("GIFT_CARD");
  });

  it("kort avgörs av restaurangens betalkonto, inte av landet", () => {
    expect(providerForMethod("CARD", "MONRI")).toBe("MONRI");
    expect(providerForMethod("CARD", "STRIPE")).toBe("STRIPE");
  });

  it("utan betalkonto finns ingen kortväg — och ingen död knapp", () => {
    expect(providerForMethod("CARD", null)).toBeNull();
  });
});

describe("requiresUpfrontPayment", () => {
  it("kort betalas innan köket ser ordern", () => {
    expect(requiresUpfrontPayment("STRIPE")).toBe(true);
    expect(requiresUpfrontPayment("MONRI")).toBe(true);
  });

  it("kontant kvitteras efteråt i kassan", () => {
    expect(requiresUpfrontPayment("CASH")).toBe(false);
  });
});
