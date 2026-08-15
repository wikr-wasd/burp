import { describe, expect, it } from "vitest";
import {
  allowedVatRates,
  COUNTRIES,
  COUNTRY_INFO,
  CURRENCY_INFO,
  isAllowedVatRate,
  isCountryCode,
  normalizeOrgNumber,
  normalizePostalCode,
} from "./country";

describe("landsuppgifter", () => {
  it("har fullständig information för varje land", () => {
    for (const code of COUNTRIES) {
      const info = COUNTRY_INFO[code];
      expect(info.code).toBe(code);
      expect(CURRENCY_INFO[info.currency]).toBeDefined();
      expect(info.timeZone).toMatch(/^Europe\//);
      expect(info.vat.reduced).toBeGreaterThan(0);
      expect(info.vat.standard).toBeGreaterThanOrEqual(info.vat.reduced);
    }
  });

  it("kopplar rätt valuta till rätt land", () => {
    expect(COUNTRY_INFO.HR.currency).toBe("EUR");
    expect(COUNTRY_INFO.RS.currency).toBe("RSD");
    expect(COUNTRY_INFO.BA.currency).toBe("BAM");
    expect(COUNTRY_INFO.SE.currency).toBe("SEK");
  });

  /**
   * Dinaren visas utan decimaler. Para har i praktiken slutat användas, och
   * "1 234 RSD" är vad en gäst i Belgrad förväntar sig se.
   */
  it("visar dinar utan decimaler men euro med", () => {
    expect(CURRENCY_INFO.RSD.decimalDigits).toBe(0);
    expect(CURRENCY_INFO.EUR.decimalDigits).toBe(2);
  });
});

describe("momssatser", () => {
  it("ger två satser för länder som har två", () => {
    expect(allowedVatRates("HR")).toEqual([1300, 2500]);
    expect(allowedVatRates("RS")).toEqual([1000, 2000]);
    expect(allowedVatRates("SE")).toEqual([1200, 2500]);
  });

  /** Bosnien har en enda sats. Att båda är 17 % är avsiktligt, inte en bugg. */
  it("ger en enda sats för Bosnien", () => {
    expect(allowedVatRates("BA")).toEqual([1700]);
  });

  it("avvisar satser landet inte har", () => {
    expect(isAllowedVatRate("HR", 1200)).toBe(false); // svensk matmoms
    expect(isAllowedVatRate("HR", 1300)).toBe(true);
    expect(isAllowedVatRate("BA", 2500)).toBe(false);
    expect(isAllowedVatRate("RS", 2000)).toBe(true);
  });
});

describe("organisationsnummer", () => {
  it("accepterar rätt längd per land", () => {
    expect(normalizeOrgNumber("SE", "5566778899")).toBe("5566778899");
    expect(normalizeOrgNumber("HR", "12345678901")).toBe("12345678901");
    expect(normalizeOrgNumber("RS", "123456789")).toBe("123456789");
    expect(normalizeOrgNumber("BA", "1234567890123")).toBe("1234567890123");
  });

  it("tar bort mellanslag och bindestreck", () => {
    expect(normalizeOrgNumber("SE", "556677-8899")).toBe("5566778899");
    expect(normalizeOrgNumber("HR", "123 456 789 01")).toBe("12345678901");
  });

  /**
   * Ett kroatiskt OIB har elva siffror, ett svenskt organisationsnummer tio.
   * Utan landet går de inte att skilja åt — och ett tiosiffrigt OIB finns inte.
   */
  it("avvisar ett nummer med fel längd för landet", () => {
    expect(normalizeOrgNumber("HR", "5566778899")).toBeNull();
    expect(normalizeOrgNumber("SE", "12345678901")).toBeNull();
    expect(normalizeOrgNumber("RS", "1234567890123")).toBeNull();
  });

  it("avvisar bokstäver", () => {
    expect(normalizeOrgNumber("SE", "55667788AB")).toBeNull();
  });
});

describe("postnummer", () => {
  it("accepterar fem siffror i alla fyra länderna", () => {
    for (const code of COUNTRIES) {
      expect(normalizePostalCode(code, "21422")).toBe("21422");
    }
  });

  it("tar bort mellanslag", () => {
    expect(normalizePostalCode("SE", "214 22")).toBe("21422");
  });

  it("avvisar fel längd", () => {
    expect(normalizePostalCode("SE", "2142")).toBeNull();
    expect(normalizePostalCode("HR", "214223")).toBeNull();
  });
});

describe("isCountryCode", () => {
  it("skiljer kända landskoder från allt annat", () => {
    expect(isCountryCode("HR")).toBe(true);
    expect(isCountryCode("NO")).toBe(false);
    expect(isCountryCode("hr")).toBe(false);
    expect(isCountryCode(null)).toBe(false);
  });
});
