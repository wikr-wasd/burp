import { describe, expect, it } from "vitest";
import { landingFor } from "./landing";

/**
 * Regeln som avgjorde vart man hamnar efter inloggning.
 *
 * Den var fel fram till 2026-08-23 — alla skickades till `/dashboard` — och
 * felet var osynligt just för att det inte såg ut som ett fel: inloggningen
 * lyckades, dashboarden kastade ut den som inte var personal, och kvar stod
 * inloggningsformuläret utan meddelande. Det läses som "kontot fungerar inte".
 */
describe("landingFor", () => {
  it("skickar ägare, chef och servitör till dashboarden", () => {
    expect(landingFor("owner", false)).toBe("/dashboard");
    expect(landingFor("manager", false)).toBe("/dashboard");
    expect(landingFor("staff", false)).toBe("/dashboard");
  });

  // Kocken har bara köksskärmen. Dashboarden kastar ut honom.
  it("skickar kocken till köksskärmen", () => {
    expect(landingFor("kitchen", false)).toBe("/kok");
  });

  /*
   * De två fall som var trasiga. Båda saknar rad i `staff`, och båda hamnade
   * därför på en sida som skickade dem tillbaka till inloggningen.
   */
  it("skickar en plattformsadmin till backoffice, inte till dashboarden", () => {
    expect(landingFor(null, true)).toBe("/backoffice");
  });

  it("skickar en gäst till sitt konto, inte till dashboarden", () => {
    expect(landingFor(null, false)).toBe("/konto");
  });

  /*
   * Ingen väg leder till inloggningen.
   *
   * Det var hela buggen: en destination som i sin tur kastar tillbaka hit.
   * Kontrollen är trubbig med flit — den fångar varje framtida gren som
   * råkar peka fel, inte bara de fem ovan.
   */
  it("leder aldrig tillbaka till inloggningen", () => {
    const alla = [
      landingFor("owner", false),
      landingFor("manager", false),
      landingFor("staff", false),
      landingFor("kitchen", false),
      landingFor(null, true),
      landingFor(null, false),
    ];

    for (const mal of alla) {
      expect(mal).not.toContain("/logga-in");
      expect(mal.startsWith("/")).toBe(true);
    }
  });

  // En anställd som också jobbar hos Burp loggar in för att arbeta i
  // restaurangen. Backoffice är två klick bort därifrån.
  it("låter anställningen gå före plattformsrollen", () => {
    expect(landingFor("owner", true)).toBe("/dashboard");
  });
});
