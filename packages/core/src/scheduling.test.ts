import { describe, expect, it } from "vitest";
import {
  availableSlots,
  ceilToSlot,
  earliestPickup,
  formatSlot,
  isDueForKitchen,
  validateScheduledFor,
} from "./scheduling";
import { CLOSED_ALL_WEEK, type OpeningHours } from "./opening-hours";

/**
 * Testerna räknar i lokal tid, eftersom det är så gästen och köket tänker.
 * 2026-08-11 är en tisdag.
 */
const openTueEve: OpeningHours = {
  ...CLOSED_ALL_WEEK,
  tue: [
    { opens: "11:00", closes: "14:00" },
    { opens: "17:00", closes: "22:00" },
  ],
};

const at = (time: string) => new Date(`2026-08-11T${time}:00`);

describe("ceilToSlot", () => {
  it("avrundar uppåt till nästa kvart", () => {
    expect(formatSlot(ceilToSlot(at("12:01")))).toBe("12:15");
    expect(formatSlot(ceilToSlot(at("12:14")))).toBe("12:15");
    expect(formatSlot(ceilToSlot(at("12:16")))).toBe("12:30");
  });

  it("lämnar en exakt kvart orörd", () => {
    expect(formatSlot(ceilToSlot(at("12:30")))).toBe("12:30");
  });

  it("nollställer sekunder", () => {
    const withSeconds = new Date("2026-08-11T12:30:45");
    expect(ceilToSlot(withSeconds).getSeconds()).toBe(0);
  });
});

describe("earliestPickup", () => {
  it("lägger på tillagningstiden och avrundar till kvart", () => {
    // 12:00 + 20 min = 12:20 → nästa kvart är 12:30.
    expect(formatSlot(earliestPickup(20, at("12:00")))).toBe("12:30");
  });

  it("erbjuder aldrig en tid som redan passerat", () => {
    const now = at("12:07");
    expect(earliestPickup(20, now).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("availableSlots", () => {
  it("erbjuder bara tider när restaurangen är öppen", () => {
    const slots = availableSlots({
      openingHours: openTueEve,
      prepTimeMinutes: 20,
      now: at("12:00"),
      horizonHours: 12,
    });

    const times = slots.map(formatSlot);

    expect(times).toContain("12:30");
    expect(times).toContain("13:45");
    // Stängt mellan 14 och 17.
    expect(times).not.toContain("14:00");
    expect(times).not.toContain("15:30");
    expect(times).toContain("17:00");
    // 22:00 är stängningstid och exklusiv.
    expect(times).not.toContain("22:00");
    expect(times).toContain("21:45");
  });

  it("ger inga tider när restaurangen är stängd hela dagen", () => {
    const slots = availableSlots({
      openingHours: CLOSED_ALL_WEEK,
      prepTimeMinutes: 20,
      now: at("12:00"),
    });
    expect(slots).toHaveLength(0);
  });

  it("erbjuder inga tider inom tillagningstiden", () => {
    const slots = availableSlots({
      openingHours: openTueEve,
      prepTimeMinutes: 45,
      now: at("12:00"),
    });
    expect(formatSlot(slots[0]!)).toBe("12:45");
  });
});

describe("isDueForKitchen", () => {
  it("visar en order utan hämttid direkt", () => {
    expect(isDueForKitchen(null, 20, at("12:00"))).toBe(true);
  });

  /**
   * Kärnan i hela funktionen: utan den här regeln börjar köket laga en lunch
   * som ska hämtas klockan 18.
   */
  it("håller undan en order tills tillagningstiden återstår", () => {
    const pickup = at("18:00");
    expect(isDueForKitchen(pickup, 20, at("12:00"))).toBe(false);
    expect(isDueForKitchen(pickup, 20, at("17:39"))).toBe(false);
    expect(isDueForKitchen(pickup, 20, at("17:40"))).toBe(true);
  });

  it("visar en order vars hämttid redan passerat", () => {
    // Sen är sent, men den ska absolut synas — inte gömmas för att den missats.
    expect(isDueForKitchen(at("12:00"), 20, at("13:00"))).toBe(true);
  });
});

describe("validateScheduledFor", () => {
  const options = {
    openingHours: openTueEve,
    prepTimeMinutes: 20,
    now: at("12:00"),
    horizonHours: 12,
  };

  it("godkänner en giltig tid", () => {
    expect(validateScheduledFor(at("13:00"), options)).toBeNull();
  });

  it("avvisar en tid köket inte hinner till", () => {
    expect(validateScheduledFor(at("12:15"), options)).toBe("TOO_SOON");
  });

  it("avvisar en tid när restaurangen är stängd", () => {
    expect(validateScheduledFor(at("15:00"), options)).toBe("CLOSED");
  });

  it("avvisar en tid som inte ligger på en kvart", () => {
    expect(validateScheduledFor(at("13:07"), options)).toBe("NOT_A_SLOT");
  });

  it("avvisar en tid för långt fram", () => {
    expect(validateScheduledFor(new Date("2026-08-20T13:00:00"), options)).toBe("TOO_FAR");
  });

  it("avvisar en tid i det förflutna", () => {
    expect(validateScheduledFor(at("09:00"), options)).toBe("TOO_SOON");
  });
});
