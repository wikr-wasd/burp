import { describe, expect, it } from "vitest";
import { csvAmount, csvCell, csvFilename, csvHeaders, toCsv } from "./csv";

describe("csvCell", () => {
  it("lämnar en vanlig text orörd", () => {
    expect(csvCell("Ćevapi")).toBe("Ćevapi");
  });

  it("citerar text med komma, citattecken eller radbrytning", () => {
    expect(csvCell("Bord 6, zon A")).toBe('"Bord 6, zon A"');
    expect(csvCell('Kallas "husets"')).toBe('"Kallas ""husets"""');
    expect(csvCell("rad\nrad")).toBe('"rad\nrad"');
  });

  it("avväpnar en cell som skulle köras som formel", () => {
    // Cellen är restaurangens egen text och får aldrig köras hos den som
    // öppnar filen.
    expect(csvCell("=SUMMA(A1:A9)")).toBe("'=SUMMA(A1:A9)");
    expect(csvCell("@import")).toBe("'@import");
    expect(csvCell("+1")).toBe("'+1");
  });

  it("rör inte tal — de ska gå att summera", () => {
    // Ett negativt tal är ett tal, inte en formel.
    expect(csvCell(-1200)).toBe("-1200");
    expect(csvCell(0)).toBe("0");
  });

  it("ger tom cell för null och odefinierat", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("csvAmount", () => {
  it("räknar om ören till hela enheter", () => {
    expect(csvAmount(1200, "BAM")).toBe("12.00");
    expect(csvAmount(1250, "SEK")).toBe("12.50");
  });

  it("skriver dinarer utan decimaler", () => {
    // RSD har noll decimaler. 1200 är 1200 dinarer, inte 12.
    expect(csvAmount(1200, "RSD")).toBe("1200");
  });

  it("klarar negativa belopp", () => {
    expect(csvAmount(-500, "EUR")).toBe("-5.00");
  });
});

describe("toCsv", () => {
  it("inleder med BOM så att Excel läser å, ä och ö rätt", () => {
    expect(toCsv([["Räkor"]]).charCodeAt(0)).toBe(0xfeff);
  });

  it("skiljer rader med CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("﻿a,b\r\nc,d\r\n");
  });
});

describe("csvFilename", () => {
  it("gör ett filnamn av restaurangens namn", () => {
    expect(csvFilename(["burp", "statistik", "Kod Bage"])).toBe("burp-statistik-kod-bage.csv");
  });

  it("byter ut svenska tecken i stället för att tappa dem", () => {
    expect(csvFilename(["Öl & Mat"])).toBe("ol-mat.csv");
  });

  it("faller tillbaka på burp när ingenting blir kvar", () => {
    expect(csvFilename(["***"])).toBe("burp.csv");
  });
});

describe("csvHeaders", () => {
  it("gör svaret till en nedladdning och aldrig till en cachad sida", () => {
    const headers = csvHeaders("burp.csv") as Record<string, string>;
    expect(headers["Content-Disposition"]).toBe('attachment; filename="burp.csv"');
    expect(headers["Cache-Control"]).toBe("no-store");
  });
});
