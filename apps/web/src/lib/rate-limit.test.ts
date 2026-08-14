import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, rateLimit, RATE_LIMITS } from "./rate-limit";

/**
 * Rate limitern skyddar QR-endpoints mot att påhittade koder blir gratis att
 * prova. Fönsterlogiken är lätt att få subtilt fel — av på ett, eller ett
 * fönster som aldrig nollställs — och båda felen syns först under angrepp.
 */
describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00Z"));
  });

  it("släpper igenom upp till gränsen", () => {
    const key = `test:${Math.random()}`;
    const options = { limit: 3, windowSeconds: 60 };

    expect(rateLimit(key, options).success).toBe(true);
    expect(rateLimit(key, options).success).toBe(true);
    expect(rateLimit(key, options).success).toBe(true);
  });

  it("blockerar anropet efter gränsen", () => {
    const key = `test:${Math.random()}`;
    const options = { limit: 2, windowSeconds: 60 };

    rateLimit(key, options);
    rateLimit(key, options);
    expect(rateLimit(key, options).success).toBe(false);
  });

  it("räknar ned remaining och aldrig under noll", () => {
    const key = `test:${Math.random()}`;
    const options = { limit: 2, windowSeconds: 60 };

    expect(rateLimit(key, options).remaining).toBe(1);
    expect(rateLimit(key, options).remaining).toBe(0);
    expect(rateLimit(key, options).remaining).toBe(0);
  });

  it("nollställs när fönstret löpt ut", () => {
    const key = `test:${Math.random()}`;
    const options = { limit: 1, windowSeconds: 60 };

    expect(rateLimit(key, options).success).toBe(true);
    expect(rateLimit(key, options).success).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(rateLimit(key, options).success).toBe(true);
  });

  it("håller isär olika nycklar", () => {
    const options = { limit: 1, windowSeconds: 60 };
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;

    expect(rateLimit(a, options).success).toBe(true);
    expect(rateLimit(a, options).success).toBe(false);
    // B ska vara opåverkad — annars slår en enda ivrig gäst ut hela lokalen.
    expect(rateLimit(b, options).success).toBe(true);
  });

  it("rapporterar när fönstret nollställs", () => {
    const key = `test:${Math.random()}`;
    const result = rateLimit(key, { limit: 5, windowSeconds: 30 });
    expect(result.reset).toBe(Date.now() + 30_000);
  });
});

describe("RATE_LIMITS", () => {
  it("är generösare på QR-uppslag än på orderskapande", () => {
    // Gästen laddar om menyn flera gånger under en måltid; att lägga order
    // gör hen ett fåtal gånger.
    expect(RATE_LIMITS.qrLookup.limit).toBeGreaterThan(RATE_LIMITS.orderCreate.limit);
  });
});

describe("clientIp", () => {
  it("tar första adressen i x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" });
    expect(clientIp(headers)).toBe("203.0.113.5");
  });

  it("hanterar mellanslag runt adressen", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "  203.0.113.5  " }))).toBe("203.0.113.5");
  });

  it("faller tillbaka på x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("ger 'unknown' när ingen header finns", () => {
    // Viktigt att det blir en enda gemensam nyckel och inte något slumpat:
    // annars får varje anrop utan header sin egen kvot.
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("ger 'unknown' när headern är tom", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});
