import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
  it("känner igen de fyra ISR-sidorna", () => {
    expect(isCachedRoute("/sv/sarajevo")).toBe(true);
    expect(isCachedRoute("/bs/sarajevo/grill")).toBe(true);
    expect(isCachedRoute("/sv/sarajevo/ratt/punjene-paprike")).toBe(true);
    expect(isCachedRoute("/de/r/sarajevo/cevabdzinica-zeljo")).toBe(true);
  });

  it("fyra segment under en stad är rättsidan och ingenting annat", () => {
    // Rättsidan byggdes 2026-08-27 och saknades här till 2026-08-28. Den föll
    // igenom som "inte cachad" och fick därför en nonce instämplad i HTML som
    // sedan återanvändes i en timme — vilket med policyn påslagen hade gett en
    // sida som renderas men aldrig hydrerar.
    expect(isCachedRoute("/sv/sarajevo/ratt/punjene-paprike")).toBe(true);
    expect(isCachedRoute("/sv/sarajevo/grill/nagot")).toBe(false);
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
  it("Sentrys ingest står i connect-src när en DSN finns", () => {
    // Utan den blockeras varje felrapport den dagen policyn slås på — tyst,
    // och just när rapporterna behövs som mest. Värden härleds ur DSN:en
    // eftersom den bär REGIONEN: organisationen ligger på EU.
    const csp = buildCsp({
      ...OPTIONS,
      nonce: "abc",
      sentryDsn: "https://publicnyckel@o4508.ingest.de.sentry.io/4509",
    });

    expect(csp).toContain("https://o4508.ingest.de.sentry.io");
    expect(csp).not.toContain("publicnyckel");
  });

  it("utan DSN läggs ingenting till i connect-src", () => {
    const utan = buildCsp({ ...OPTIONS, nonce: "abc" });
    expect(utan).toContain("connect-src 'self'");
    expect(utan).not.toContain("sentry");
  });

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

  it("ramar bara in Stripe", () => {
    /*
     * Kartan ritas av Leaflet i vår egen kod och hämtar bara rutor. Så länge
     * openstreetmap.org stod i `frame-src` gav policyn tillstånd till något
     * appen slutat göra — och ett tillstånd ingen använder är ett tillstånd
     * ingen märker att en angripare börjar använda.
     */
    const frameSrc = buildCsp({ ...OPTIONS, nonce: "n" })
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("frame-src"));

    expect(frameSrc).toBe("frame-src https://js.stripe.com https://hooks.stripe.com");
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

/**
 * Listan över cachade rutter läses ur app-katalogen, inte ur minnet.
 *
 * `isCachedRoute()` matchar på formen hos en adress. En ny sida med
 * `revalidate` ändrar inte den funktionen, och den som lägger till sidan har
 * ingen anledning att misstänka att en CSP-modul behöver veta om den. Precis
 * det hände rättsidan: byggd 2026-08-27 med `revalidate = 3600`, upptäckt
 * 2026-08-28.
 *
 * Testet går därför till källan. Varje `page.tsx` under `src/app` klassas som
 * cachad eller dynamisk utifrån vad filen själv exporterar, och funktionen
 * måste svara likadant. Faller det här testet är svaret nästan aldrig att
 * ändra testet.
 */
describe("isCachedRoute mot app-katalogen", () => {
  const APP_DIR = fileURLToPath(new URL("../app", import.meta.url));

  /** Alla `page.tsx` under `src/app`, som sökvägar relativa till app-roten. */
  function pageFiles(dir: string, prefix = ""): string[] {
    const found: string[] = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = join(dir, entry.name);

      if (entry.isDirectory()) found.push(...pageFiles(next, `${prefix}/${entry.name}`));
      else if (entry.name === "page.tsx") found.push(prefix || "/");
    }

    return found;
  }

  /**
   * Ruttmallen till en konkret adress.
   *
   * `[locale]` blir alltid `sv` — funktionen kräver två bokstäver där. Övriga
   * parametrar blir en slug som inte kan förväxlas med ett riktigt segment:
   * hade `[kok]` fyllts i med "ratt" hade testet mätt fel sak.
   */
  function samplePath(route: string): string {
    return (
      route
        .split("/")
        .filter(Boolean)
        // Ruttgrupper `(namn)` finns inte i adressen.
        .filter((segment) => !segment.startsWith("("))
        .map((segment) => {
          if (segment === "[locale]") return "sv";
          return segment.startsWith("[") ? "provvarde" : segment;
        })
        .join("/")
        .replace(/^/, "/")
    );
  }

  /** Exporterar filen `revalidate`, alltså ISR-cachad HTML? */
  function isCachedFile(route: string): boolean {
    const file = join(APP_DIR, route === "/" ? "" : route, "page.tsx");
    return /export const revalidate\s*=/.test(readFileSync(file, "utf8"));
  }

  const routes = pageFiles(APP_DIR);

  it("hittar sidorna över huvud taget", () => {
    // Utan den här skulle en trasig sökväg ge noll rutter och ett grönt test
    // som inte kontrollerar någonting alls.
    expect(routes.length).toBeGreaterThan(20);
  });

  it("varje sida med revalidate känns igen som cachad", () => {
    const cached = routes.filter(isCachedFile);

    // Fyra i dag: stad, stad+kök, rätt och restaurang.
    expect(cached.length).toBeGreaterThanOrEqual(4);

    for (const route of cached) {
      expect(isCachedRoute(samplePath(route)), route).toBe(true);
    }
  });

  it("ingen sida utan revalidate klassas som cachad", () => {
    for (const route of routes.filter((entry) => !isCachedFile(entry))) {
      expect(isCachedRoute(samplePath(route)), route).toBe(false);
    }
  });
});
