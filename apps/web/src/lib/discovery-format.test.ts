import { COUNTRY_INFO } from "@burp/core";
import { describe, expect, it } from "vitest";
import {
  priceTierLabel,
  sanitizeQuery,
  todaysHours,
  type OpeningHours,
} from "./discovery-format";

const SARAJEVO = COUNTRY_INFO.BA.timeZone;

/**
 * Varje dag har ett eget klockslag. Skulle veckodagarna hamna ett steg fel
 * syns det direkt som fel siffra, i stället för att gömma sig bakom två dagar
 * som råkar ha samma öppettider.
 */
const HOURS: OpeningHours = {
  sun: [{ opens: "07:00", closes: "07:30" }],
  mon: [{ opens: "08:00", closes: "08:30" }],
  tue: [{ opens: "09:00", closes: "09:30" }],
  wed: [{ opens: "10:00", closes: "10:30" }],
  thu: [{ opens: "11:00", closes: "11:30" }],
  fri: [{ opens: "12:00", closes: "12:30" }],
  sat: [{ opens: "13:00", closes: "13:30" }],
};

describe("todaysHours — rätt dag", () => {
  // 2026-08-14 är en fredag. Klockan 12 UTC är 14 i Stockholm, samma dygn.
  it("visar fredagens tider på en fredag", () => {
    expect(todaysHours(HOURS, SARAJEVO, new Date("2026-08-14T12:00:00Z"))).toBe("12:00–12:30");
  });

  it("visar söndagens tider på en söndag", () => {
    expect(todaysHours(HOURS, SARAJEVO, new Date("2026-08-16T12:00:00Z"))).toBe("07:00–07:30");
  });

  it("visar måndagens tider på en måndag", () => {
    expect(todaysHours(HOURS, SARAJEVO, new Date("2026-08-17T12:00:00Z"))).toBe("08:00–08:30");
  });

  // Fredag 23:00 UTC är lördag 01:00 i Stockholm. Läses tiden i UTC i stället
  // för lokal tid visar sidan fredagens tider åt en gäst som redan är inne på
  // lördagen.
  it("följer svensk tid över midnatt, inte UTC", () => {
    expect(todaysHours(HOURS, SARAJEVO, new Date("2026-08-14T23:00:00Z"))).toBe("13:00–13:30");
  });
});

describe("todaysHours — stängt och tomt", () => {
  it("ger null när dagen saknas i schemat", () => {
    const stängtPåMåndag: OpeningHours = { fri: [{ opens: "16:00", closes: "23:00" }] };
    expect(todaysHours(stängtPåMåndag, SARAJEVO, new Date("2026-08-17T12:00:00Z"))).toBeNull();
  });

  it("ger null när dagen finns men är tom", () => {
    expect(todaysHours({ fri: [] }, SARAJEVO, new Date("2026-08-14T12:00:00Z"))).toBeNull();
  });

  it("ger null när restaurangen saknar öppettider helt", () => {
    expect(todaysHours(null, SARAJEVO, new Date("2026-08-14T12:00:00Z"))).toBeNull();
  });

  it("sätter ihop lunch och kväll till en rad", () => {
    const tvåPass: OpeningHours = {
      fri: [
        { opens: "11:00", closes: "14:00" },
        { opens: "17:00", closes: "22:00" },
      ],
    };
    expect(todaysHours(tvåPass, SARAJEVO, new Date("2026-08-14T12:00:00Z"))).toBe(
      "11:00–14:00, 17:00–22:00",
    );
  });
});

/**
 * Sökordet hamnar inuti en PostgREST-`or(...)`-sträng. Kommatecken och
 * parenteser är syntax där — släpps de igenom slutar filtret att betyda det
 * som stod i sökrutan.
 */
describe("sanitizeQuery — söksträngen får inte bli filtersyntax", () => {
  it("tar bort tecken som PostgREST läser som syntax", () => {
    expect(sanitizeQuery("pizza,kebab")).toBe("pizza kebab");
    expect(sanitizeQuery("mat(fisk)")).toBe("mat fisk");
    expect(sanitizeQuery("100%")).toBe("100");
    expect(sanitizeQuery("a\\b")).toBe("a b");
  });

  it("plattar ut mellanrummen som blir kvar", () => {
    expect(sanitizeQuery("a,,,b")).toBe("a b");
  });

  it("trimmar kanterna", () => {
    expect(sanitizeQuery("  sushi  ")).toBe("sushi");
  });

  it("kapar orimligt långa sökningar", () => {
    expect(sanitizeQuery("x".repeat(500))).toHaveLength(80);
  });

  it("lämnar svenska tecken i fred", () => {
    expect(sanitizeQuery("kött & rödbetor på Möllan")).toBe("kött & rödbetor på Möllan");
  });
});

describe("priceTierLabel", () => {
  it("ger en valutasymbol per nivå", () => {
    expect(priceTierLabel(1, "BAM")).toBe("KM");
    expect(priceTierLabel(2, "BAM")).toBe("KM KM");
    expect(priceTierLabel(3, "BAM")).toBe("KM KM KM");
  });

  it("ger null när prisklass saknas", () => {
    expect(priceTierLabel(null, "BAM")).toBeNull();
    expect(priceTierLabel(0, "BAM")).toBeNull();
  });

  it("följer restaurangens valuta, inte kodens", () => {
    expect(priceTierLabel(2, "EUR")).toBe("€ €");
    expect(priceTierLabel(2, "RSD")).toBe("дин. дин.");
    expect(priceTierLabel(2, "SEK")).toBe("kr kr");
  });

  it("tar inte emot skräp som skulle rita en oändlig rad", () => {
    expect(priceTierLabel(999, "BAM")).toBe("KM KM KM KM");
    expect(priceTierLabel(Number.NaN, "BAM")).toBeNull();
    expect(priceTierLabel(Number.POSITIVE_INFINITY, "BAM")).toBeNull();
  });
});
