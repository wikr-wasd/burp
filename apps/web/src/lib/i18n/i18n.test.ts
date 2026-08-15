import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALES, localePath, pickLocale } from "./index";
import { en } from "./en";
import { sv } from "./sv";

/**
 * Nycklarna måste vara identiska mellan språken.
 *
 * TypeScript fångar en saknad nyckel redan vid bygget, men inte en EXTRA i
 * engelskan — en nyckel som inte längre används någonstans. Den blir kvar och
 * blir så småningom en text ingen vet om den stämmer.
 */
function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object" && child !== null && !Array.isArray(child)
      ? keys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("ordböckerna", () => {
  it("har exakt samma nycklar", () => {
    expect(keys(en).sort()).toEqual(keys(sv).sort());
  });

  it("saknar tomma texter", () => {
    for (const dict of [sv, en]) {
      for (const [path, value] of Object.entries(flatten(dict))) {
        if (typeof value === "string") {
          expect(value.trim(), `tom text: ${path}`).not.toBe("");
        }
      }
    }
  });

  /**
   * Engelskan får inte råka vara en kopia av svenskan. En oöversatt sträng är
   * lättare att missa än en saknad — den syns inte som ett fel, bara som fel
   * språk.
   */
  it("är faktiskt översatt", () => {
    const svFlat = flatten(sv);
    const enFlat = flatten(en);

    const identical = Object.keys(svFlat).filter(
      (key) => typeof svFlat[key] === "string" && svFlat[key] === enFlat[key],
    );

    // "Meny"/"Menu" skiljer sig; ingenting i ordboken ska vara helt lika.
    expect(identical).toEqual([]);
  });
});

function flatten(value: unknown, prefix = ""): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return { [prefix]: value };

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, child]) => {
    if (typeof child === "object" && child !== null && !Array.isArray(child)) {
      return { ...acc, ...flatten(child, `${prefix}${key}.`) };
    }
    acc[`${prefix}${key}`] = child;
    return acc;
  }, {});
}

describe("pickLocale", () => {
  it("väljer det högst rankade språket vi har", () => {
    expect(pickLocale("en-GB,en;q=0.9,sv;q=0.8")).toBe("en");
    expect(pickLocale("sv-SE,sv;q=0.9,en;q=0.8")).toBe("sv");
  });

  it("respekterar kvalitet framför ordning", () => {
    expect(pickLocale("de;q=1.0,en;q=0.9,sv;q=0.95")).toBe("sv");
  });

  it("hoppar över språk vi inte har", () => {
    expect(pickLocale("bs-BA,hr;q=0.9,en;q=0.5")).toBe("en");
  });

  it("faller tillbaka på standardspråket", () => {
    expect(pickLocale(null)).toBe(DEFAULT_LOCALE);
    expect(pickLocale("")).toBe(DEFAULT_LOCALE);
    expect(pickLocale("de,fr;q=0.8")).toBe(DEFAULT_LOCALE);
    // q=0 betyder uttryckligen "inte det här språket".
    expect(pickLocale("en;q=0")).toBe(DEFAULT_LOCALE);
  });
});

describe("localePath", () => {
  it("prefixar sökvägar", () => {
    expect(localePath("en", "/sarajevo")).toBe("/en/sarajevo");
    expect(localePath("sv", "sarajevo")).toBe("/sv/sarajevo");
  });

  it("ger roten utan efterföljande snedstreck", () => {
    expect(localePath("sv", "/")).toBe("/sv");
  });
});

describe("isLocale", () => {
  it("känner igen språken och inget annat", () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
    for (const bad of ["de", "sv-SE", "", null, 1, {}]) expect(isLocale(bad)).toBe(false);
  });
});
