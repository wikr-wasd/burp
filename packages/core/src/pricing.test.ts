import { describe, expect, it } from "vitest";
import {
  assertClientTotalMatches,
  calculateFee,
  calculateLine,
  calculateOrderTotals,
  PriceMismatchError,
  vatFromGross,
} from "./pricing";
import {
  applyBasisPoints,
  formatAmountInput,
  formatMoney,
  kronorToOre,
  parseAmount,
  roundHalfEven,
} from "./money";
import { VAT_ALCOHOL_BPS, VAT_FOOD_BPS, type PricedLine } from "./types";

function line(overrides: Partial<PricedLine> = {}): PricedLine {
  return {
    menuItemId: "00000000-0000-0000-0000-000000000001",
    name: "Pizza Margherita",
    unitPriceOre: kronorToOre(149),
    quantity: 1,
    vatRateBps: VAT_FOOD_BPS,
    options: [],
    ...overrides,
  };
}

describe("roundHalfEven", () => {
  it("rundar exakta halvor till närmaste jämna tal", () => {
    expect(roundHalfEven(0.5)).toBe(0);
    expect(roundHalfEven(1.5)).toBe(2);
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
  });

  it("rundar normalt när värdet inte är en exakt halva", () => {
    expect(roundHalfEven(2.4)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
  });

  it("hanterar negativa belopp (återbetalningar)", () => {
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(-3.5)).toBe(-4);
  });
});

describe("vatFromGross", () => {
  it("bryter ut 12 % moms ur ett bruttopris", () => {
    // 149,00 kr inkl. moms → 133,04 netto + 15,96 moms
    expect(vatFromGross(14900, VAT_FOOD_BPS)).toEqual({ netOre: 13304, vatOre: 1596 });
  });

  it("bryter ut 25 % moms för alkohol", () => {
    // 89,00 kr inkl. moms → 71,20 netto + 17,80 moms
    expect(vatFromGross(8900, VAT_ALCOHOL_BPS)).toEqual({ netOre: 7120, vatOre: 1780 });
  });

  it("netto plus moms ger alltid tillbaka exakt bruttot", () => {
    for (let gross = 1; gross <= 2000; gross++) {
      const { netOre, vatOre } = vatFromGross(gross, VAT_FOOD_BPS);
      expect(netOre + vatOre).toBe(gross);
    }
  });
});

describe("calculateLine", () => {
  it("multiplicerar styckpris med antal", () => {
    const result = calculateLine(line({ quantity: 3 }));
    expect(result.grossOre).toBe(44700);
  });

  it("lägger tillvalspriser på styckpriset innan multiplikation", () => {
    const result = calculateLine(
      line({
        quantity: 2,
        options: [
          { optionId: "a", name: "Extra ost", priceOre: kronorToOre(15) },
          { optionId: "b", name: "Stor", priceOre: kronorToOre(25) },
        ],
      }),
    );
    // (149 + 15 + 25) × 2 = 378 kr
    expect(result.grossOre).toBe(37800);
  });

  it("tillåter negativa tillval så länge raden inte blir negativ", () => {
    const result = calculateLine(
      line({ options: [{ optionId: "c", name: "Utan ost", priceOre: -1000 }] }),
    );
    expect(result.grossOre).toBe(13900);
  });

  it("avvisar tillval som gör raden negativ", () => {
    expect(() =>
      calculateLine(line({ options: [{ optionId: "c", name: "Fel", priceOre: -20000 }] })),
    ).toThrow(/negativt pris/);
  });

  it("avvisar antal som inte är ett positivt heltal", () => {
    expect(() => calculateLine(line({ quantity: 0 }))).toThrow(RangeError);
    expect(() => calculateLine(line({ quantity: 1.5 }))).toThrow(RangeError);
  });
});

describe("calculateOrderTotals", () => {
  it("summerar rader, leverans och dricks", () => {
    const totals = calculateOrderTotals({
      lines: [line({ quantity: 2 })],
      deliveryFeeOre: kronorToOre(49),
      tipOre: kronorToOre(30),
    });

    expect(totals.itemsGrossOre).toBe(29800);
    expect(totals.totalOre).toBe(29800 + 4900 + 3000);
  });

  it("håller isär moms per sats när ordern blandar mat och alkohol", () => {
    const totals = calculateOrderTotals({
      lines: [
        line({ quantity: 1 }),
        line({ menuItemId: "beer", name: "Öl", unitPriceOre: 8900, vatRateBps: VAT_ALCOHOL_BPS }),
      ],
    });

    expect(totals.vatByRate[VAT_FOOD_BPS]).toBe(1596);
    expect(totals.vatByRate[VAT_ALCOHOL_BPS]).toBe(1780);
    expect(totals.itemsVatOre).toBe(3376);
    expect(totals.itemsNetOre).toBe(totals.itemsGrossOre - 3376);
  });

  it("lagrar rabatt negativt", () => {
    const totals = calculateOrderTotals({
      lines: [line()],
      discountOre: kronorToOre(20),
    });

    expect(totals.discountOre).toBe(-2000);
    expect(totals.totalOre).toBe(12900);
  });

  it("låter aldrig en rabatt göra ordern negativ", () => {
    const totals = calculateOrderTotals({
      lines: [line()],
      discountOre: kronorToOre(9999),
    });

    expect(totals.totalOre).toBe(0);
  });

  it("avvisar negativ dricks", () => {
    expect(() => calculateOrderTotals({ lines: [line()], tipOre: -100 })).toThrow(/dricks/);
  });
});

describe("calculateFee", () => {
  const totals = calculateOrderTotals({
    lines: [line({ quantity: 2 })], // 298,00 kr
    deliveryFeeOre: kronorToOre(49),
    tipOre: kronorToOre(30),
  });

  it("räknar 3,4 % på varukorgen inkl. moms som standard", () => {
    const fee = calculateFee(totals, "GROSS_ITEMS", 340);
    expect(fee.baseAmountOre).toBe(29800);
    expect(fee.feeOre).toBe(applyBasisPoints(29800, 340)); // 1013 öre
    expect(fee.feeOre).toBe(1013);
  });

  it("räknar på nettot när basen är NET_ITEMS", () => {
    const fee = calculateFee(totals, "NET_ITEMS", 340);
    expect(fee.baseAmountOre).toBeLessThan(29800);
  });

  it("inkluderar leveransavgiften när basen är GROSS_TOTAL", () => {
    const fee = calculateFee(totals, "GROSS_TOTAL", 340);
    expect(fee.baseAmountOre).toBe(29800 + 4900);
  });

  it("räknar aldrig avgift på dricks, oavsett bas", () => {
    for (const base of ["GROSS_ITEMS", "NET_ITEMS", "GROSS_TOTAL"] as const) {
      expect(calculateFee(totals, base, 340).baseAmountOre).toBeLessThan(totals.totalOre);
    }
  });

  it("dricksen går orörd förbi avgiften till restaurangen", () => {
    const fee = calculateFee(totals, "GROSS_ITEMS", 340);
    expect(fee.restaurantPayoutOre).toBe(totals.totalOre - totals.tipOre - fee.feeOre);
  });

  it("drar rabatten från underlaget", () => {
    const discounted = calculateOrderTotals({
      lines: [line({ quantity: 2 })],
      discountOre: kronorToOre(50),
    });
    expect(calculateFee(discounted, "GROSS_ITEMS", 340).baseAmountOre).toBe(24800);
  });
});

describe("assertClientTotalMatches", () => {
  const totals = calculateOrderTotals({ lines: [line()] });

  it("släpper igenom när summorna stämmer", () => {
    expect(() => assertClientTotalMatches(totals, 14900)).not.toThrow();
  });

  it("avvisar en manipulerad summa", () => {
    expect(() => assertClientTotalMatches(totals, 1)).toThrow(PriceMismatchError);
  });

  it("avvisar en summa som inte är heltal öre", () => {
    expect(() => assertClientTotalMatches(totals, 14900.5)).toThrow(TypeError);
  });
});

describe("parseAmount", () => {
  it("tolkar decimalkomma", () => {
    expect(parseAmount("149,50", "BAM")).toBe(14950);
    expect(parseAmount("0,05", "BAM")).toBe(5);
  });

  it("tolkar punkt lika gärna", () => {
    expect(parseAmount("149.50", "EUR")).toBe(14950);
  });

  it("tolkar heltal", () => {
    expect(parseAmount("129", "BAM")).toBe(12900);
  });

  it("tål mellanslag och valutasymbol efter beloppet", () => {
    expect(parseAmount(" 1 495,00 KM ", "BAM")).toBe(149500);
    expect(parseAmount("1 495", "BAM")).toBe(149500);
    expect(parseAmount("1495 kr", "SEK")).toBe(149500);
  });

  it("tillåter negativa belopp för tillval som drar av", () => {
    expect(parseAmount("-10", "BAM")).toBe(-1000);
  });

  it("avvisar fler decimaler än valutan har", () => {
    expect(parseAmount("149,555", "BAM")).toBeNull();
  });

  /**
   * Dinar har inga decimaler i praktiken. "1200" i ett serbiskt prisfält
   * betyder 1200 dinarer — inte 12. Med den svenska tolkningen hade varje
   * serbiskt menypris blivit hundra gånger för lågt.
   */
  it("läser dinar som hela enheter", () => {
    expect(parseAmount("1200", "RSD")).toBe(120000);
    expect(parseAmount("1200,50", "RSD")).toBeNull();
  });

  it("avvisar allt som inte otvetydigt är ett belopp", () => {
    for (const bad of ["", "  ", "abc", "12abc", "1,2,3", "1..5", "--5", "KM"]) {
      expect(parseAmount(bad, "BAM")).toBeNull();
    }
  });

  it("avvisar värden som inte är strängar", () => {
    expect(parseAmount(149 as unknown as string, "BAM")).toBeNull();
  });
});

describe("formatAmountInput", () => {
  it("ger ett redigerbart tal utan valuta", () => {
    expect(formatAmountInput(14950, "BAM")).toBe("149,50");
    expect(formatAmountInput(12900, "EUR")).toBe("129,00");
    expect(formatAmountInput(-1000, "SEK")).toBe("-10,00");
    expect(formatAmountInput(120000, "RSD")).toBe("1200");
  });

  it("överlever en tur fram och tillbaka", () => {
    for (const amount of [0, 5, 12900, 149500, -1000]) {
      expect(parseAmount(formatAmountInput(amount, "BAM"), "BAM")).toBe(amount);
    }
    for (const amount of [0, 100, 120000, -1000]) {
      expect(parseAmount(formatAmountInput(amount, "RSD"), "RSD")).toBe(amount);
    }
  });
});

describe("formatMoney", () => {
  it("formaterar i restaurangens valuta", () => {
    // Intl använder smalt mellanslag (U+00A0/U+202F) — normalisera före jämförelse.
    const normalize = (value: string) => value.replace(/\s/g, " ");

    expect(normalize(formatMoney(1200, "BAM"))).toBe("12,00 KM");
    expect(normalize(formatMoney(1200, "EUR"))).toBe("12,00 €");
    expect(normalize(formatMoney(14900, "SEK"))).toBe("149,00 kr");
  });

  it("skriver dinar utan decimaler", () => {
    const normalize = (value: string) => value.replace(/\s/g, " ");
    expect(normalize(formatMoney(120000, "RSD"))).toBe("1.200 дин.");
  });
});
