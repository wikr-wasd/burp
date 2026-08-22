import { describe, expect, it } from "vitest";
import { buildCsp, isCachedRoute } from "./csp";

const OPTIONS = {
  isDevelopment: false,
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  mapTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

/**
 * Vilken sida som får en nonce avgör hur stark policyn är just där.
 *
 * En cachad sida kan inte bära en nonce — dess HTML återanvänds i en timme.
 * Klassas en DYNAMISK sida av misstag som cachad får den `'unsafe-inline'` i
 * onödan; klassas en CACHAD som dynamisk blockeras Next egna skript för alla
 * utom den första besökaren. Båda felen är tysta, och därför testade.
 */
describe("isCachedRoute", () => {
  it("känner igen de tre ISR-sidorna", () => {
    expect(isCachedRoute("/sv/sarajevo")).toBe(true);
    expect(isCachedRoute("/bs/sarajevo/grill")).toBe(true);
    expect(isCachedRoute("/de/r/sarajevo/cevabdzinica-zeljo")).toBe(true);
  });

  it("släpper igenom en avslutande snedstreck", () => {
    expect(isCachedRoute("/sv/sarajevo/")).toBe(true);
  });

  it("undantar de dynamiska rutterna under samma språksegment", () => {
    // Ser ut som en stadssida men är force-dynamic. Utan undantaget hade
    // värvningssidan fått den svagare policyn utan skäl.
    expect(isCachedRoute("/sv/anslut")).toBe(false);
    expect(isCachedRoute("/sv/upptack")).toBe(false);
  });

  it("räknar inte startsidan som cachad", () => {
    // `/[locale]/page.tsx` är force-dynamic — sökningen ligger i query.
    expect(isCachedRoute("/sv")).toBe(false);
    expect(isCachedRoute("/")).toBe(false);
  });

  it("rör inte ytor utanför språksegmentet", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/kassa",
      "/kok",
      "/backoffice/media",
      "/konto/favoriter",
      "/t/R7K2M9TGGY",
      "/order/abc",
      "/api/orders",
    ]) {
      expect(isCachedRoute(path), path).toBe(false);
    }
  });

  it("låter sig inte luras av ett segment som ser ut som ett språk", () => {
    // `/r/` under roten är ingen giltig rutt, men formen ska ändå inte
    // förväxlas med `/sv/r/stad/slug`.
    expect(isCachedRoute("/r/sarajevo/zeljo")).toBe(false);
    expect(isCachedRoute("/sv/r/sarajevo")).toBe(false);
  });
});

describe("buildCsp", () => {
  it("nonce ger strict-dynamic, ingen nonce ger unsafe-inline", () => {
    const strict = buildCsp({ ...OPTIONS, nonce: "abc123" });
    expect(strict).toContain("'nonce-abc123'");
    expect(strict).toContain("'strict-dynamic'");
    // Hela poängen: ett injicerat skript utan nonce körs inte.
    expect(strict).not.toContain("script-src 'self' 'unsafe-inline'");

    const cached = buildCsp({ ...OPTIONS, nonce: null });
    expect(cached).toContain("script-src 'self' 'unsafe-inline'");
    expect(cached).not.toContain("nonce-");
  });

  it("unsafe-eval finns bara i utveckling", () => {
    // React bygger felstackar med eval och Next bygger om moduler vid varje
    // sparning. Ingetdera sker i produktion.
    expect(buildCsp({ ...OPTIONS, nonce: "n", isDevelopment: true })).toContain("'unsafe-eval'");
    expect(buildCsp({ ...OPTIONS, nonce: "n" })).not.toContain("'unsafe-eval'");
  });

  it("släpper igenom Supabase över både HTTP och WebSocket", () => {
    // Köksskärmens larm går över Realtime. Utan wss-ursprunget tystnar det.
    const csp = buildCsp({ ...OPTIONS, nonce: "n" });
    expect(csp).toContain("https://abcdefghijklmnopqrst.supabase.co");
    expect(csp).toContain("wss://abcdefghijklmnopqrst.supabase.co");
  });

  it("tar ursprunget ur kartrutans mall-URL", () => {
    // Värdet innehåller {z}/{x}/{y} och är ingen giltig URL att skicka rakt in.
    expect(buildCsp({ ...OPTIONS, nonce: "n" })).toContain("https://tile.openstreetmap.org");
    expect(buildCsp({ ...OPTIONS, nonce: "n" })).not.toContain("{z}");
  });

  it("klarar en lokal Supabase över http", () => {
    const csp = buildCsp({ ...OPTIONS, nonce: "n", supabaseUrl: "http://127.0.0.1:54321" });
    expect(csp).toContain("http://127.0.0.1:54321");
    expect(csp).toContain("ws://127.0.0.1:54321");
  });

  it("bär de direktiv som faktiskt begränsar skadan", () => {
    const csp = buildCsp({ ...OPTIONS, nonce: "n" });
    // form-action hindrar ett injicerat formulär från att posta gästens
    // uppgifter till en annan värd. base-uri hindrar att alla relativa
    // adresser flyttas. object-src stänger en gammal plugin-väg in.
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("uppgraderar inte till https lokalt", () => {
    // Utvecklingsservern kör http. Direktivet hade skrivit om varje egen
    // resurs till https och gjort sidan otillgänglig.
    expect(buildCsp({ ...OPTIONS, nonce: "n", isDevelopment: true })).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(buildCsp({ ...OPTIONS, nonce: "n" })).toContain("upgrade-insecure-requests");
  });

  it("faller inte på en trasig URL", () => {
    // Miljövariabeln kan vara felskriven. En CSP som kastar hade tagit ner
    // varje request; en med ett tomt ursprung blockerar bara mer än den ska.
    expect(() => buildCsp({ ...OPTIONS, nonce: "n", supabaseUrl: "inte-en-url" })).not.toThrow();
  });
});
