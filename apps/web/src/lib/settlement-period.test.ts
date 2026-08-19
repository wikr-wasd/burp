import { describe, expect, it } from "vitest";
import {
  closedMonths,
  currentMonthKey,
  formatMonth,
  isMonthKey,
  monthBounds,
  SETTLEMENT_NEXT,
  shiftMonth,
} from "./settlement-period";

/**
 * Avräkningens periodräkning.
 *
 * Månadsaritmetik ser trivial ut och är det inte: årsskiftet, skottåret och
 * tidszonen är tre olika sätt att hamna en dag fel. Ett fel här flyttar order
 * mellan fakturor, och det syns först när en restaurang undrar varför augusti
 * kostade mer än juli.
 *
 * Vad som faktiskt SUMMERAS testas inte här — det räknas i databasen
 * (migration 0039) och täcks av `verify-schema.sh`. En mockad databas hade bara
 * bekräftat att mocken fungerar.
 */

describe("monthBounds", () => {
  it("tar med sista dagen i månaden", () => {
    expect(monthBounds("2026-06")).toEqual({ start: "2026-06-01", end: "2026-06-30" });
    expect(monthBounds("2026-07")).toEqual({ start: "2026-07-01", end: "2026-07-31" });
  });

  it("kan februari, och skottåret", () => {
    expect(monthBounds("2026-02").end).toBe("2026-02-28");
    expect(monthBounds("2028-02").end).toBe("2028-02-29");
  });
});

describe("shiftMonth", () => {
  it("viker runt årsskiftet åt båda håll", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("klarar hopp över flera år", () => {
    expect(shiftMonth("2026-03", -15)).toBe("2024-12");
  });
});

describe("currentMonthKey", () => {
  /*
   * Halv ett på natten den 1 juli i Belgrad är fortfarande 30 juni i UTC.
   *
   * Det här är hela skälet till att månaden räknas i restaurangens tidszon:
   * räknat i UTC hade backoffice erbjudit juni som "senaste stängda månad" en
   * hel sommarnatt efter att juli börjat, och en kafana som stänger efter tolv
   * hade fått sina nattpass i fel faktura.
   */
  it("följer tidszonen, inte UTC", () => {
    const midnightish = new Date("2026-06-30T22:30:00Z");

    expect(currentMonthKey("Europe/Belgrade", midnightish)).toBe("2026-07");
    expect(currentMonthKey("UTC", midnightish)).toBe("2026-06");
  });
});

describe("closedMonths", () => {
  it("börjar med förra månaden, aldrig med den pågående", () => {
    const months = closedMonths("Europe/Sarajevo", 3, new Date("2026-08-19T12:00:00Z"));

    expect(months).toEqual(["2026-07", "2026-06", "2026-05"]);
  });
});

describe("isMonthKey", () => {
  it("avvisar allt som inte är ÅÅÅÅ-MM", () => {
    expect(isMonthKey("2026-06")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(isMonthKey("2026-6")).toBe(false);
    expect(isMonthKey("2026-06-01")).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
  });
});

describe("formatMonth", () => {
  it("skriver månaden på svenska", () => {
    expect(formatMonth("2026-06")).toBe("juni 2026");
  });
});

describe("SETTLEMENT_NEXT", () => {
  /*
   * Speglar triggern i migration 0039. Går de isär visar gränssnittet en knapp
   * som databasen sedan vägrar utföra — eller döljer en som hade fungerat.
   */
  it("låter en betald och en makulerad avräkning vara i fred", () => {
    expect(SETTLEMENT_NEXT.PAID).toEqual([]);
    expect(SETTLEMENT_NEXT.VOID).toEqual([]);
  });

  it("går från utkast till fakturerad till betald", () => {
    expect(SETTLEMENT_NEXT.DRAFT).toContain("INVOICED");
    expect(SETTLEMENT_NEXT.INVOICED).toContain("PAID");
    expect(SETTLEMENT_NEXT.DRAFT).not.toContain("PAID");
  });
});
