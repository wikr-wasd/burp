import { describe, expect, it } from "vitest";
import {
  chunk,
  isTranslatable,
  normalizeSource,
  translationKey,
  TRANSLATION_MAX_LENGTH,
} from "./translation";

describe("normalizeSource", () => {
  it("gör två stavningar av samma mening till en", () => {
    // Utan det här betalar vi för samma mening flera gånger.
    expect(normalizeSource("  utan   lök\n")).toBe("utan lök");
    expect(normalizeSource("utan lök")).toBe("utan lök");
  });

  it("kapar det som inte är en anteckning längre", () => {
    const long = "a".repeat(TRANSLATION_MAX_LENGTH + 500);
    expect(normalizeSource(long)).toHaveLength(TRANSLATION_MAX_LENGTH);
  });
});

describe("isTranslatable", () => {
  it("säger ja till text med ord i", () => {
    expect(isTranslatable("utan lök")).toBe(true);
    expect(isTranslatable("bez luka")).toBe(true);
    // Diakriter och kyrilliska är bokstäver, vad än en a–z-regex tycker.
    expect(isTranslatable("ćevapi")).toBe(true);
    expect(isTranslatable("ћевапи")).toBe(true);
  });

  it("säger nej till det som betyder samma sak på alla språk", () => {
    expect(isTranslatable("")).toBe(false);
    expect(isTranslatable("   ")).toBe(false);
    expect(isTranslatable("3")).toBe(false);
    expect(isTranslatable("12:30")).toBe(false);
    expect(isTranslatable("!!!")).toBe(false);
    expect(isTranslatable("x")).toBe(false);
  });
});

describe("translationKey", () => {
  it("ger samma nyckel för samma text och språk", async () => {
    const a = await translationKey("utan lök", "bs");
    const b = await translationKey("  utan  lök ", "bs");

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("skiljer målspråken åt", async () => {
    // Annars delar tyskan och norskan rad, och den som skrev sist vinner.
    const de = await translationKey("utan lök", "de");
    const no = await translationKey("utan lök", "no");

    expect(de).not.toBe(no);
  });

  it("ger en ny nyckel när texten ändras", async () => {
    // Det är hela invalideringen: den gamla raden blir oanvänd, inte fel.
    const before = await translationKey("utan lök", "bs");
    const after = await translationKey("utan lök och utan salt", "bs");

    expect(before).not.toBe(after);
  });
});

describe("chunk", () => {
  it("delar upp i omgångar utan att tappa något", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    expect(chunk([], 5)).toEqual([]);
  });

  it("faller tillbaka på en enda omgång vid orimlig storlek", () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });
});
