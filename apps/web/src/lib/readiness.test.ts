import { describe, expect, it } from "vitest";
import { capabilities, summarise, type ReadinessEnv } from "./readiness";

/**
 * Listan över vad som faktiskt är påslaget.
 *
 * Testerna finns för att listan ska LJUGA MINDRE än den den ersätter. En
 * statusyta som säger "allt är bra" när halva VAPID-paret saknas är värre än
 * ingen statusyta alls — då slutar man titta på den.
 */

/** Allt satt. Utgångsläget varje test avviker från. */
const KOMPLETT: ReadinessEnv = {
  vapidPublicKey: "BPublik",
  vapidPrivateKey: "hemlig",
  resendApiKey: "re_xxx",
  opsEmail: "ops@burp.se",
  stripeSecretKey: "sk_test",
  stripePublishableKey: "pk_test",
  stripeWebhookSecret: "whsec",
  cronSecret: "abc",
  qrTokenSecret: "def",
  mapTileUrl: "https://tiles.example.com/{z}/{x}/{y}.png",
  sentryDsn: "https://x@sentry.io/1",
};

const hitta = (env: ReadinessEnv, key: string) =>
  capabilities(env).find((entry) => entry.key === key)!;

describe("capabilities", () => {
  it("allt satt ger inga luckor alls", () => {
    const list = capabilities(KOMPLETT);
    expect(list.every((entry) => entry.level === "live")).toBe(true);
    expect(summarise(list).blocking).toBe(0);
  });

  it("tom miljö ger ingen krasch och inga live-rader", () => {
    const list = capabilities({});
    expect(list.length).toBeGreaterThan(5);
    expect(list.some((entry) => entry.level === "live")).toBe(false);
  });

  it("varje nyckel förekommer en enda gång", () => {
    // En dubblerad nyckel gör listan omöjlig att läsa maskinellt, och två
    // rader med samma namn läser som ett fel i ytan.
    const keys = capabilities({}).map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe("VAPID — halvt par är farligare än inget par", () => {
    it("båda satta är live", () => {
      expect(hitta(KOMPLETT, "push").level).toBe("live");
    });

    it("ingen satt är off och stoppar inte lansering", () => {
      const push = hitta({ ...KOMPLETT, vapidPublicKey: undefined, vapidPrivateKey: undefined }, "push");
      expect(push.level).toBe("off");
      expect(push.blocksLaunch).toBe(false);
    });

    it("bara publik satt är degraded OCH blockerande", () => {
      // Det här är hela skälet till att `degraded` finns som eget läge: den
      // publika nyckeln ligger i webbläsarens prenumeration, och en ensam
      // privat nyckel gör varje registrerad enhet onåbar utan att något syns.
      const push = hitta({ ...KOMPLETT, vapidPrivateKey: undefined }, "push");
      expect(push.level).toBe("degraded");
      expect(push.blocksLaunch).toBe(true);
    });

    it("bara privat satt är också degraded", () => {
      expect(hitta({ ...KOMPLETT, vapidPublicKey: undefined }, "push").level).toBe("degraded");
    });

    it("tom sträng räknas inte som satt", () => {
      expect(hitta({ ...KOMPLETT, vapidPrivateKey: "   " }, "push").level).toBe("degraded");
    });
  });

  describe("Stripe — alla tre eller ingen", () => {
    it("tre av tre är live", () => {
      expect(hitta(KOMPLETT, "card").level).toBe("live");
    });

    it("noll av tre är off, och stoppar inte lansering", () => {
      // Utan nycklar visar kassan bara "betala på plats". Det är korrekt
      // beteende, inte ett fel.
      const card = hitta(
        { ...KOMPLETT, stripeSecretKey: undefined, stripePublishableKey: undefined, stripeWebhookSecret: undefined },
        "card",
      );
      expect(card.level).toBe("off");
      expect(card.blocksLaunch).toBe(false);
    });

    it("två av tre är degraded och blockerande", () => {
      // Saknas webhook-hemligheten bokförs betalningar aldrig som genomförda.
      const card = hitta({ ...KOMPLETT, stripeWebhookSecret: undefined }, "card");
      expect(card.level).toBe("degraded");
      expect(card.blocksLaunch).toBe(true);
      expect(card.detail).toContain("2 av 3");
    });
  });

  describe("kartrutor", () => {
    it("OpenStreetMaps egna servrar är degraded, inte live", () => {
      const map = hitta(
        { ...KOMPLETT, mapTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png" },
        "map",
      );
      expect(map.level).toBe("degraded");
      expect(map.blocksLaunch).toBe(true);
    });

    it("saknad adress är också degraded — standardvärdet ÄR OSM", () => {
      expect(hitta({ ...KOMPLETT, mapTileUrl: undefined }, "map").level).toBe("degraded");
    });

    it("en egen leverantör är live", () => {
      expect(hitta(KOMPLETT, "map").level).toBe("live");
    });
  });

  describe("det som stoppar en lansering", () => {
    it("QR utan hemlighet blockerar", () => {
      const qr = hitta({ ...KOMPLETT, qrTokenSecret: undefined }, "qr");
      expect(qr.level).toBe("off");
      expect(qr.blocksLaunch).toBe(true);
    });

    it("bakgrundsjobb utan hemlighet blockerar", () => {
      expect(hitta({ ...KOMPLETT, cronSecret: undefined }, "jobs").blocksLaunch).toBe(true);
    });

    it("ansökningar utan mottagare blockerar", () => {
      // En påslagen brevleverantör utan mottagaradress skickar ansökan till
      // ingen, och tystnaden ser ut som att ingen ansöker.
      expect(hitta({ ...KOMPLETT, opsEmail: undefined }, "ops-email").blocksLaunch).toBe(true);
    });
  });

  describe("summarise", () => {
    it("räknar lägena och de blockerande var för sig", () => {
      const list = capabilities({ ...KOMPLETT, vapidPrivateKey: undefined, resendApiKey: undefined });
      const s = summarise(list);

      expect(s.degraded).toBe(1);
      expect(s.off).toBe(1);
      expect(s.live).toBe(list.length - 2);
      expect(s.blocking).toBe(2);
    });

    it("en live-rad räknas aldrig som blockerande", () => {
      const s = summarise(capabilities(KOMPLETT));
      expect(s.blocking).toBe(0);
      expect(s.live).toBeGreaterThan(0);
    });
  });
});
