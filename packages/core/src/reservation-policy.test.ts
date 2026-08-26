import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESERVATION_POLICY,
  holdsTable,
  parseReservationPolicy,
  serializeReservationPolicy,
  validateReservationRequest,
  type ReservationPolicy,
} from "./reservation-policy";

const ON: ReservationPolicy = { ...DEFAULT_RESERVATION_POLICY, enabled: true };

const NOW = new Date("2026-08-26T12:00:00Z");
const in3h = new Date("2026-08-26T15:00:00Z");

function request(overrides: Partial<Parameters<typeof validateReservationRequest>[0]> = {}) {
  return { partySize: 2, at: in3h, guestName: "Amina", ...overrides };
}

describe("parseReservationPolicy", () => {
  it("faller tillbaka på standarden för skräp", () => {
    expect(parseReservationPolicy(null)).toEqual(DEFAULT_RESERVATION_POLICY);
    expect(parseReservationPolicy("nej")).toEqual(DEFAULT_RESERVATION_POLICY);
    expect(parseReservationPolicy({})).toEqual(DEFAULT_RESERVATION_POLICY);
  });

  /**
   * Standardläget är AVSTÄNGT.
   *
   * En restaurang som inte bett om bokning ska inte plötsligt ta emot den.
   * Tomma bord klockan sju för gäster som aldrig dök upp är ett dyrare misstag
   * än en knapp som saknas.
   */
  it("tar inte emot bokningar förrän någon slagit på det", () => {
    expect(DEFAULT_RESERVATION_POLICY.enabled).toBe(false);
    expect(parseReservationPolicy({ duration_minutes: 60 }).enabled).toBe(false);
  });

  it("läser databasens snake_case", () => {
    const policy = parseReservationPolicy({
      enabled: true,
      duration_minutes: 120,
      grace_minutes: 20,
      lead_minutes: 30,
      horizon_days: 60,
      max_party_size: 8,
    });

    expect(policy).toEqual({
      enabled: true,
      durationMinutes: 120,
      graceMinutes: 20,
      leadMinutes: 30,
      horizonDays: 60,
      maxPartySize: 8,
    });
  });

  it("klämmer orimliga värden i stället för att spara dem", () => {
    const policy = parseReservationPolicy({
      duration_minutes: 5000,
      grace_minutes: -10,
      max_party_size: 900,
    });

    expect(policy.durationMinutes).toBe(360);
    expect(policy.graceMinutes).toBe(0);
    expect(policy.maxPartySize).toBe(50);
  });

  it("tur och retur genom serialiseringen ändrar ingenting", () => {
    const policy: ReservationPolicy = { ...ON, durationMinutes: 120, maxPartySize: 6 };
    expect(parseReservationPolicy(serializeReservationPolicy(policy))).toEqual(policy);
  });
});

describe("validateReservationRequest", () => {
  it("släpper igenom en vanlig bokning", () => {
    expect(validateReservationRequest(request(), ON, NOW)).toBeNull();
  });

  it("nekar när restaurangen inte tar emot bokningar", () => {
    expect(validateReservationRequest(request(), DEFAULT_RESERVATION_POLICY, NOW)).toBe("DISABLED");
  });

  it("kräver ett namn — restaurangen ska veta vem som kommer", () => {
    expect(validateReservationRequest(request({ guestName: "   " }), ON, NOW)).toBe("NO_NAME");
  });

  it("nekar ett sällskap större än restaurangen tar emot", () => {
    expect(validateReservationRequest(request({ partySize: 13 }), ON, NOW)).toBe("PARTY_TOO_LARGE");
  });

  it("nekar noll gäster och halva gäster", () => {
    expect(validateReservationRequest(request({ partySize: 0 }), ON, NOW)).toBe("PARTY_TOO_SMALL");
    expect(validateReservationRequest(request({ partySize: 2.5 }), ON, NOW)).toBe("PARTY_TOO_SMALL");
  });

  /** En bokning om tio minuter är ett telefonsamtal, inte en bokning. */
  it("nekar för kort framförhållning", () => {
    const soon = new Date("2026-08-26T12:30:00Z");
    expect(validateReservationRequest(request({ at: soon }), ON, NOW)).toBe("TOO_SOON");
  });

  it("nekar en tid som redan passerat", () => {
    const yesterday = new Date("2026-08-25T19:00:00Z");
    expect(validateReservationRequest(request({ at: yesterday }), ON, NOW)).toBe("TOO_SOON");
  });

  it("nekar bortom horisonten", () => {
    const nextYear = new Date("2027-08-26T19:00:00Z");
    expect(validateReservationRequest(request({ at: nextYear }), ON, NOW)).toBe("TOO_FAR");
  });
});

describe("holdsTable — karensen", () => {
  const startsAt = new Date("2026-08-26T19:00:00Z");

  it("håller bordet fram till karensens slut", () => {
    const at = new Date("2026-08-26T19:14:00Z");
    expect(holdsTable({ status: "BOOKED", startsAt, seatedAt: null }, ON, at)).toBe(true);
  });

  it("släpper bordet när karensen gått", () => {
    const at = new Date("2026-08-26T19:16:00Z");
    expect(holdsTable({ status: "BOOKED", startsAt, seatedAt: null }, ON, at)).toBe(false);
  });

  /**
   * Den som SATT SIG håller bordet hela kvällen.
   *
   * Karensen gäller väntan på någon som inte kommit, inte besöket. En gäst som
   * satt sig 19:05 ska inte få sällskap av en främling 19:16.
   */
  it("släpper aldrig ett bord där gästen sitter", () => {
    const at = new Date("2026-08-26T20:30:00Z");
    const seatedAt = new Date("2026-08-26T19:05:00Z");

    expect(holdsTable({ status: "SEATED", startsAt, seatedAt }, ON, at)).toBe(true);
    expect(holdsTable({ status: "BOOKED", startsAt, seatedAt }, ON, at)).toBe(true);
  });

  it("avbokade och uteblivna håller ingenting", () => {
    const at = new Date("2026-08-26T19:00:00Z");
    expect(holdsTable({ status: "CANCELLED", startsAt, seatedAt: null }, ON, at)).toBe(false);
    expect(holdsTable({ status: "NO_SHOW", startsAt, seatedAt: null }, ON, at)).toBe(false);
    expect(holdsTable({ status: "COMPLETED", startsAt, seatedAt: null }, ON, at)).toBe(false);
  });

  /** Noll karens betyder att bordet släpps på slaget. */
  it("respekterar en karens på noll", () => {
    const strict = { ...ON, graceMinutes: 0 };
    const at = new Date("2026-08-26T19:01:00Z");
    expect(holdsTable({ status: "BOOKED", startsAt, seatedAt: null }, strict, at)).toBe(false);
  });
});
