import { describe, expect, it } from "vitest";
import type { OpeningHours } from "@burp/core";
import { soonestOpening } from "./next-open";

/**
 * Vilken träff öppnar först?
 *
 * Frågan uppstod 2026-08-24: "Öppet nu" gav noll träffar klockan halv två på
 * natten, och sidan svarade med tre meddelanden som alla lät som fel. Noll var
 * rätt svar — men "allt är stängt, X öppnar 07:00" är svaret gästen kom för.
 */

/** Tom vecka att bygga vidare på. En restaurang utan tider har alla dagar tomma. */
const STANGT: OpeningHours = {
  mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
};

const hours = (dag: keyof OpeningHours, opens: string, closes: string): OpeningHours => ({
  ...STANGT,
  [dag]: [{ opens, closes }],
});

// Måndag 2026-08-24, 01:32 i Sarajevo — alltså 23:32 söndag UTC. Exakt den
// tidpunkt då felet rapporterades.
const NATTEN = new Date("2026-08-23T23:32:00Z");
const SARAJEVO = "Europe/Sarajevo";

describe("soonestOpening", () => {
  it("hittar den som öppnar tidigast samma dag", () => {
    const svar = soonestOpening(
      [
        { name: "Sent", openingHours: hours("mon", "12:00", "23:00"), timeZone: SARAJEVO },
        { name: "Tidigt", openingHours: hours("mon", "07:00", "20:00"), timeZone: SARAJEVO },
      ],
      NATTEN,
    );

    expect(svar?.name).toBe("Tidigt");
    expect(svar?.opens).toBe("07:00");
    expect(svar?.daysAhead).toBe(0);
  });

  /*
   * En som öppnar om sex timmar i dag slår en som öppnar tidigare på klockan
   * men först i morgon. Det var hela skälet att räkna väntetid i stället för
   * att jämföra klockslag.
   */
  it("väger väntetid, inte klockslag", () => {
    const svar = soonestOpening(
      [
        { name: "I morgon 06", openingHours: hours("tue", "06:00", "20:00"), timeZone: SARAJEVO },
        { name: "I dag 09", openingHours: hours("mon", "09:00", "20:00"), timeZone: SARAJEVO },
      ],
      NATTEN,
    );

    expect(svar?.name).toBe("I dag 09");
  });

  /*
   * Samma klockslag i två tidszoner är inte samma ögonblick.
   *
   * Kl 01:32 i Sarajevo är 02:32 i Sofia. En restaurang i Sofia som öppnar
   * 08:00 har alltså 5h28m kvar; en i Sarajevo som öppnar 08:00 har 6h28m.
   * Sofia ska vinna, och gör det bara om jämförelsen sker i väntetid.
   */
  it("jämför rätt över tidszoner", () => {
    const svar = soonestOpening(
      [
        { name: "Sarajevo", openingHours: hours("mon", "08:00", "20:00"), timeZone: SARAJEVO },
        { name: "Sofia", openingHours: hours("mon", "08:00", "20:00"), timeZone: "Europe/Sofia" },
      ],
      NATTEN,
    );

    expect(svar?.name).toBe("Sofia");
  });

  it("går vidare till nästa vecka när bara en dag är öppen", () => {
    const svar = soonestOpening(
      [{ name: "Bara lördag", openingHours: hours("sat", "10:00", "16:00"), timeZone: SARAJEVO }],
      NATTEN,
    );

    expect(svar?.day).toBe("sat");
    expect(svar?.daysAhead).toBe(5);
  });

  // En nyss godkänd restaurang har inga tider alls. Den ska inte kunna vinna
  // jämförelsen med ett tomt svar.
  it("hoppar över den som saknar öppettider helt", () => {
    const svar = soonestOpening(
      [
        { name: "Utan tider", openingHours: STANGT, timeZone: SARAJEVO },
        { name: "Med tider", openingHours: hours("mon", "11:00", "20:00"), timeZone: SARAJEVO },
      ],
      NATTEN,
    );

    expect(svar?.name).toBe("Med tider");
  });

  it("ger null när ingen har någon öppettid", () => {
    expect(
      soonestOpening([{ name: "Tom", openingHours: STANGT, timeZone: SARAJEVO }], NATTEN),
    ).toBeNull();
    expect(soonestOpening([], NATTEN)).toBeNull();
  });

  /*
   * Öppningen som redan passerat i dag får inte ge en negativ väntetid.
   *
   * Den skulle vinna varje jämförelse och peka ut fel ställe. Fallet uppstår
   * inte i sidan — listan är stängd per definition — men en jämförelsefunktion
   * ska inte gå att lura med ett anrop som är rimligt någon annanstans.
   */
  it("räknar en passerad öppning som ett helt varv, inte som negativ tid", () => {
    // Måndag 14:00 i Sarajevo. Måndagens öppning 09:00 har passerat.
    const eftermiddag = new Date("2026-08-24T12:00:00Z");

    const svar = soonestOpening(
      [
        { name: "Passerad", openingHours: hours("mon", "09:00", "23:00"), timeZone: SARAJEVO },
        { name: "I morgon", openingHours: hours("tue", "09:00", "23:00"), timeZone: SARAJEVO },
      ],
      eftermiddag,
    );

    expect(svar?.name).toBe("I morgon");
  });
});
