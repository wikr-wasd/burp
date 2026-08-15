import { describe, expect, it } from "vitest";
import { availabilityState, type AvailabilityRule } from "./availability";
import { COUNTRY_INFO } from "./country";

const SARAJEVO = COUNTRY_INFO.BA.timeZone;

const rule = (overrides: Partial<AvailabilityRule> = {}): AvailabilityRule => ({
  availableFrom: null,
  availableTo: null,
  weekday: null,
  reason: null,
  ...overrides,
});

/** 2026-08-11 är en tisdag (dayIndex 2). */
const tisdag = (time: string) => new Date(`2026-08-11T${time}:00+02:00`);

describe("availabilityState", () => {
  it("utan regler är rätten alltid tillgänglig", () => {
    expect(availabilityState([], SARAJEVO, tisdag("12:00"))).toEqual({
      isAvailable: true,
      reason: null,
    });
  });

  it("respekterar ett tidsfönster", () => {
    const lunch = [
      rule({
        availableFrom: "2026-08-11T09:00:00+02:00",
        availableTo: "2026-08-11T14:00:00+02:00",
      }),
    ];

    expect(availabilityState(lunch, SARAJEVO, tisdag("12:00")).isAvailable).toBe(true);
    expect(availabilityState(lunch, SARAJEVO, tisdag("15:00")).isAvailable).toBe(false);
    // Sluttiden är exklusiv, precis som för menyerna.
    expect(availabilityState(lunch, SARAJEVO, tisdag("14:00")).isAvailable).toBe(false);
  });

  it("respekterar veckodag", () => {
    const bara_fredag = [rule({ weekday: 5 })];
    expect(availabilityState(bara_fredag, SARAJEVO, tisdag("12:00")).isAvailable).toBe(false);

    const bara_tisdag = [rule({ weekday: 2 })];
    expect(availabilityState(bara_tisdag, SARAJEVO, tisdag("12:00")).isAvailable).toBe(true);
  });

  /**
   * Reglerna adderas, de skär inte. "Lunch" OCH "fredagar" som krav samtidigt
   * hade varit omöjligt att uppfylla — ingen tidpunkt är både lunch och alla
   * fredagar.
   */
  it("räcker att en regel släpper igenom", () => {
    const rules = [
      rule({ weekday: 5 }),
      rule({ availableFrom: "2026-08-11T09:00:00+02:00", availableTo: "2026-08-11T14:00:00+02:00" }),
    ];

    expect(availabilityState(rules, SARAJEVO, tisdag("12:00")).isAvailable).toBe(true);
  });

  it("ger skälet från den regel som öppnar först", () => {
    const rules = [
      rule({ availableFrom: "2026-08-20T09:00:00+02:00", reason: "Kommer nästa vecka" }),
      rule({ availableFrom: "2026-08-14T09:00:00+02:00", reason: "Slut till fredag" }),
    ];

    const state = availabilityState(rules, SARAJEVO, tisdag("12:00"));
    expect(state.isAvailable).toBe(false);
    expect(state.reason).toBe("Slut till fredag");
  });

  /**
   * En trasig tid får aldrig öppna en rätt. Hellre en rätt som inte går att
   * beställa än en gäst som beställer något köket inte har.
   */
  it("stänger hellre än öppnar vid otolkbar tid", () => {
    const trasig = [rule({ availableFrom: "inte-ett-datum" })];
    expect(availabilityState(trasig, SARAJEVO, tisdag("12:00")).isAvailable).toBe(false);
  });

  /**
   * Veckodagen räknas i restaurangens tidszon. 22:30 UTC på en tisdag är redan
   * onsdag i Sarajevo — en tisdagsregel ska då INTE gälla.
   */
  it("räknar veckodagen i restaurangens tidszon", () => {
    const stund = new Date("2026-08-11T22:30:00Z");
    expect(availabilityState([rule({ weekday: 2 })], SARAJEVO, stund).isAvailable).toBe(false);
    expect(availabilityState([rule({ weekday: 3 })], SARAJEVO, stund).isAvailable).toBe(true);
  });
});
