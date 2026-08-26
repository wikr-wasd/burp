import { describe, expect, it } from "vitest";
import {
  checkAccentColor,
  contrastRatio,
  normalizeHex,
  relativeLuminance,
  SURFACE_DARK,
  SURFACE_LIGHT,
} from "./color";

describe("normalizeHex", () => {
  it("läser sexsiffrig hex med och utan brädgård", () => {
    expect(normalizeHex("#DC2626")).toBe("#dc2626");
    expect(normalizeHex("dc2626")).toBe("#dc2626");
  });

  it("expanderar treställig hex", () => {
    expect(normalizeHex("#0af")).toBe("#00aaff");
  });

  it("nekar allt annat i stället för att gissa", () => {
    expect(normalizeHex("rött")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("rgb(220, 38, 38)")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("kontrast — de kända ytterlägena", () => {
  it("svart mot vitt är 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("en färg mot sig själv är 1:1", () => {
    expect(contrastRatio("#dc2626", "#dc2626")).toBeCloseTo(1, 5);
  });

  it("vitt har luminans 1 och svart 0", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });

  /**
   * Ögat är nästan blint för blått. Att rent gult är ljusare än rent blått är
   * hela skälet till att viktningen finns — en väljare som bara mäter "styrka"
   * hade sagt att de är lika.
   */
  it("gult är ljusare än blått trots samma mättnad", () => {
    expect(relativeLuminance("#ffff00")).toBeGreaterThan(relativeLuminance("#0000ff"));
  });
});

describe("checkAccentColor", () => {
  it("godkänner handlingsrött och sätter vit text på det", () => {
    const result = checkAccentColor("#dc2626");

    expect(result.ok).toBe(true);
    expect(result.verdict).toBe("OK");
    expect(result.textOn).toBe("#ffffff");
    expect(result.textRatio).toBeGreaterThanOrEqual(4.5);
  });

  it("godkänner en ljus accent och väljer mörk text i stället", () => {
    const result = checkAccentColor("#fbbf24");

    expect(result.ok).toBe(true);
    expect(result.textOn).toBe("#111827");
  });

  /**
   * Mellantonen är det enda fallet som faller på läsbarheten, och den faller
   * åt båda håll: varken vit eller svart text når 4,5:1. Bandet är smalt —
   * ungefär luminans 0,18 till 0,22 — och det är just därför beskedet måste
   * säga vad som är fel. En aning mörkare eller ljusare löser det, och den
   * restaurang som bara får "gick inte" provar i stället en helt annan färg.
   */
  it("nekar en mellanton som varken bär vit eller svart text", () => {
    const result = checkAccentColor("#7c7c7c");

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe("NO_READABLE_TEXT");
    expect(result.textOn).toBeNull();
  });

  it("nekar nästan vitt — bandet försvinner i ljust läge", () => {
    const result = checkAccentColor("#fdfdfd");

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe("INVISIBLE");
    expect(result.onLight).toBeLessThan(1.5);
  });

  it("nekar nästan svart — bandet försvinner i mörkt läge", () => {
    const result = checkAccentColor("#161d29");

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe("INVISIBLE");
    expect(result.onDark).toBeLessThan(1.5);
  });

  it("nekar en sträng som inte är en färg", () => {
    const result = checkAccentColor("burgundy");

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe("INVALID");
    expect(result.hex).toBeNull();
  });

  /**
   * Kravet mot BÅDA ytorna är hela poängen. En färg som bara provats mot vitt
   * kan vara osynlig i mörkt läge, och det upptäcker ingen förrän en gäst med
   * mörkt läge i telefonen står vid bordet.
   */
  it("mäter mot båda lägenas ytor", () => {
    const result = checkAccentColor("#2563eb");

    expect(result.onLight).toBeCloseTo(
      Math.round(contrastRatio("#2563eb", SURFACE_LIGHT) * 10) / 10,
      5,
    );
    expect(result.onDark).toBeCloseTo(
      Math.round(contrastRatio("#2563eb", SURFACE_DARK) * 10) / 10,
      5,
    );
  });
});
