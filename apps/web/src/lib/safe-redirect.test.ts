import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

/**
 * Öppen vidarebefordran är en av de fel som är lättast att återinföra: någon
 * "förenklar" kontrollen och ingenting går sönder synligt. Därför ligger varje
 * känd kringgåendeform här som ett eget fall.
 */
describe("safeNext — släpper igenom interna sökvägar", () => {
  it("accepterar en vanlig sökväg", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/dashboard/bord")).toBe("/dashboard/bord");
  });

  it("behåller frågesträng och fragment", () => {
    expect(safeNext("/kok?ljud=pa")).toBe("/kok?ljud=pa");
  });
});

describe("safeNext — avvisar allt som lämnar domänen", () => {
  const attacks = [
    ["absolut URL", "https://angripare.se"],
    ["absolut URL utan protokoll", "//angripare.se"],
    ["protokollrelativ med sökväg", "//angripare.se/logga-in"],
    ["backslash i stället för snedstreck", "/\\angripare.se"],
    ["dubbel backslash", "\\\\angripare.se"],
    ["kodad protokollrelativ", "%2f%2fangripare.se"],
    ["kodad absolut URL", "https%3A%2F%2Fangripare.se"],
    ["javascript-schema", "javascript:alert(1)"],
    ["data-schema", "data:text/html,<script>alert(1)</script>"],
    ["schema efter snedstreck", "/\thttps://angripare.se"],
    ["relativ utan snedstreck", "dashboard"],
    ["trasig procentkodning", "%zz"],
  ] as const;

  for (const [label, value] of attacks) {
    it(`avvisar ${label}`, () => {
      expect(safeNext(value)).toBeUndefined();
    });
  }
});

describe("safeNext — tomma värden", () => {
  it("hanterar undefined, null och tom sträng", () => {
    expect(safeNext(undefined)).toBeUndefined();
    expect(safeNext(null)).toBeUndefined();
    expect(safeNext("")).toBeUndefined();
  });

  it("hanterar värden som inte är strängar", () => {
    expect(safeNext(42 as unknown as string)).toBeUndefined();
  });
});
