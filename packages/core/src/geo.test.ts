import { describe, expect, it } from "vitest";
import { distanceMeters, parseCoordinates, roundDistance, toWkt } from "./geo";

/** Ćevabdžinica Željo i Baščaršija — punkten seed-datan använder. */
const ZELJO = { latitude: 43.8595, longitude: 18.4287 };

describe("parseCoordinates — rena tal", () => {
  it("läser ett par med punkt som decimaltecken", () => {
    expect(parseCoordinates("43.8595, 18.4287")).toEqual(ZELJO);
  });

  it("läser decimalkomma, som en svensk eller bosnisk tangentbordsvana ger", () => {
    expect(parseCoordinates("43,8595; 18,4287")).toEqual(ZELJO);
  });

  it("läser par separerade med blanksteg", () => {
    expect(parseCoordinates("  43.8595   18.4287  ")).toEqual(ZELJO);
  });

  it("läser negativa koordinater", () => {
    expect(parseCoordinates("-33.8688, 151.2093")).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
    });
  });
});

describe("parseCoordinates — kartlänkar", () => {
  /**
   * En Google Maps-URL bär ofta två punkter: `@` är var kartan står, `!3d!4d`
   * är platsen. Skillnaden kan vara hundratals meter om ägaren scrollat.
   * Platsen måste vinna.
   */
  it("väljer platsen framför kartans mittpunkt i en Google Maps-URL", () => {
    const url =
      "https://www.google.com/maps/place/%C4%86evabd%C5%BEinica+%C5%BDeljo/" +
      "@43.8600,18.4300,17z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d43.8595!4d18.4287";

    expect(parseCoordinates(url)).toEqual(ZELJO);
  });

  it("faller tillbaka på mittpunkten när platsen saknas", () => {
    expect(parseCoordinates("https://www.google.com/maps/@43.8595,18.4287,17z")).toEqual(ZELJO);
  });

  it("läser en OpenStreetMap-länk", () => {
    expect(
      parseCoordinates("https://www.openstreetmap.org/#map=19/43.8595/18.4287"),
    ).toEqual(ZELJO);
  });

  it("läser en frågeparameter", () => {
    expect(parseCoordinates("https://maps.apple.com/?q=43.8595,18.4287")).toEqual(ZELJO);
    expect(parseCoordinates("https://waze.com/ul?ll=43.8595,18.4287&navigate=yes")).toEqual(
      ZELJO,
    );
  });

  it("läser urlkodat komma", () => {
    expect(
      parseCoordinates("https://www.google.com/maps/dir/?api=1&destination=43.8595%2C18.4287"),
    ).toEqual(ZELJO);
  });
});

describe("parseCoordinates — avvisar", () => {
  it("avvisar tomt och skräp", () => {
    for (const bad of ["", "   ", "Kundurdžiluk 19", "abc, def", "43.8595"]) {
      expect(parseCoordinates(bad)).toBeNull();
    }
  });

  it("avvisar värden utanför jorden", () => {
    expect(parseCoordinates("91, 18")).toBeNull();
    expect(parseCoordinates("43, 181")).toBeNull();
  });

  /**
   * (0, 0) ligger i Guineabukten och är vad man får när ett fält lämnats tomt
   * någonstans i kedjan. Sparas den skickas varje gäst ut i Atlanten.
   */
  it("avvisar Null Island", () => {
    expect(parseCoordinates("0, 0")).toBeNull();
    expect(parseCoordinates("0.0, 0.0")).toBeNull();
  });

  it("avvisar värden som inte är strängar", () => {
    expect(parseCoordinates(43.8595 as unknown as string)).toBeNull();
  });
});

describe("toWkt", () => {
  /**
   * PostGIS tar longitud FÖRE latitud. Att blanda ihop det placerar en
   * restaurang i Sarajevo i Indiska oceanen, och inget typsystem märker det.
   */
  it("skriver longitud före latitud", () => {
    expect(toWkt(ZELJO)).toBe("POINT(18.4287 43.8595)");
  });

  it("överlever en tur genom parsern", () => {
    const point = parseCoordinates("43.8595, 18.4287")!;
    expect(toWkt(point)).toBe("POINT(18.4287 43.8595)");
  });
});

describe("distanceMeters", () => {
  // Baščaršija och Vijećnica i Sarajevo, ungefär 500 meter isär.
  const bascarsija = { latitude: 43.8595, longitude: 18.4287 };
  const vijecnica = { latitude: 43.8589, longitude: 18.4342 };

  it("mäter en kort sträcka inom några meter", () => {
    const meters = distanceMeters(bascarsija, vijecnica);
    expect(meters).toBeGreaterThan(400);
    expect(meters).toBeLessThan(500);
  });

  it("ger noll för samma punkt", () => {
    expect(distanceMeters(bascarsija, bascarsija)).toBe(0);
  });

  it("är symmetrisk", () => {
    expect(distanceMeters(bascarsija, vijecnica)).toBe(
      distanceMeters(vijecnica, bascarsija),
    );
  });

  /*
   * Sarajevo–Zagreb är omkring 29 mil FÅGELVÄGEN. Vägen dit är 39, och den
   * siffran stod först här — vilket fällde ett korrekt avstånd.
   *
   * Kontrollen finns för att fånga den klassiska förväxlingen: latitud och
   * longitud i fel ordning ger ett svar som ser rimligt ut men pekar någon
   * helt annanstans.
   */
  it("stämmer över en lång sträcka", () => {
    const zagreb = { latitude: 45.815, longitude: 15.9819 };
    const meters = distanceMeters(bascarsija, zagreb);
    expect(meters).toBeGreaterThan(285_000);
    expect(meters).toBeLessThan(295_000);
  });

  it("klarar att korsa datumlinjen utan att ge halva jorden", () => {
    const väst = { latitude: 0, longitude: 179.9 };
    const öst = { latitude: 0, longitude: -179.9 };
    expect(distanceMeters(väst, öst)).toBeLessThan(25_000);
  });
});

describe("roundDistance", () => {
  it("avrundar meter till närmaste femtiotal", () => {
    expect(roundDistance(430)).toEqual({ value: 450, unit: "m" });
    expect(roundDistance(12)).toEqual({ value: 0, unit: "m" });
    expect(roundDistance(999)).toEqual({ value: 1000, unit: "m" });
  });

  it("byter till kilometer vid tusen meter", () => {
    expect(roundDistance(1000)).toEqual({ value: 1, unit: "km" });
    expect(roundDistance(2350)).toEqual({ value: 2.4, unit: "km" });
  });

  // Falsk precision för något man kör bil till.
  it("släpper decimalen över en mil", () => {
    expect(roundDistance(12_340)).toEqual({ value: 12, unit: "km" });
  });
});
