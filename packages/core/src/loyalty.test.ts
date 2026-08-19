import { describe, expect, it } from "vitest";
import {
  calculateBalance,
  canRedeem,
  expiringPoints,
  pointsForOrder,
  type LoyaltyTransaction,
} from "./loyalty";
import { kronorToOre } from "./money";

const NOW = new Date("2026-08-13T12:00:00Z");
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

function tx(overrides: Partial<LoyaltyTransaction> = {}): LoyaltyTransaction {
  return {
    kind: "EARN",
    points: 100,
    createdAt: daysFromNow(-30),
    expiresAt: null,
    ...overrides,
  };
}

describe("pointsForOrder", () => {
  it("ger en poäng per hel krona på grundnivån", () => {
    expect(pointsForOrder(kronorToOre(298))).toBe(298);
  });

  it("avrundar nedåt — inga halva poäng", () => {
    expect(pointsForOrder(kronorToOre(149.5))).toBe(149);
  });

  it("låter restaurangen höja nivån", () => {
    expect(pointsForOrder(kronorToOre(100), 3)).toBe(300);
  });

  it("hindrar restaurangen från att sänka under Burps grundnivå", () => {
    expect(() => pointsForOrder(kronorToOre(100), 0.5)).toThrow(RangeError);
  });
});

describe("calculateBalance", () => {
  it("summerar loggen i stället för att läsa ett lagrat saldo", () => {
    const balance = calculateBalance(
      [tx({ points: 500 }), tx({ kind: "REDEEM", points: -200 }), tx({ points: 50 })],
      NOW,
    );
    expect(balance).toBe(350);
  });

  it("räknar bort poäng som gått ut men ännu inte bokförts som EXPIRE", () => {
    const balance = calculateBalance(
      [tx({ points: 500, expiresAt: daysFromNow(-1) }), tx({ points: 100 })],
      NOW,
    );
    expect(balance).toBe(100);
  });

  it("behåller poäng vars utgångsdatum ligger i framtiden", () => {
    const balance = calculateBalance([tx({ points: 500, expiresAt: daysFromNow(30) })], NOW);
    expect(balance).toBe(500);
  });

  it("dubbelräknar inte när EXPIRE redan bokförts", () => {
    // Jobbet har skrivit EXPIRE-raden; ursprungsraden har kvar sitt gamla datum.
    const balance = calculateBalance(
      [
        tx({ points: 500, expiresAt: daysFromNow(-1) }),
        tx({ kind: "EXPIRE", points: -500, createdAt: daysFromNow(-1) }),
        tx({ points: 100 }),
      ],
      NOW,
    );
    /*
     * 100 kvar, inte 0.
     *
     * Testet hette redan så här och påstod motsatsen: det förväntade sig 0 och
     * förklarade det med att clampningen hindrade ett negativt saldo. Det var
     * inte ett medvetet val utan felet självt — 500 drogs bort av
     * utgångsfiltret OCH av EXPIRE-raden. Så länge jobbet inte fanns syntes det
     * aldrig, eftersom det inte fanns några EXPIRE-rader att dubbelräkna.
     * Migration 0042 skrev jobbet, och då hade varje gäst tappat resten av sitt
     * saldo första natten.
     */
    expect(balance).toBe(100);
  });

  it("ger samma svar före och efter att jobbet bokfört utgången", () => {
    const expired = tx({ points: 500, expiresAt: daysFromNow(-1) });
    const alive = tx({ points: 100 });

    const before = calculateBalance([expired, alive], NOW);
    const after = calculateBalance(
      [expired, tx({ kind: "EXPIRE", points: -500, createdAt: NOW }), alive],
      NOW,
    );

    // Bokföringen ska synas i loggen, inte i saldot. Ändras siffran när jobbet
    // kör har gästen förlorat poäng på en administrativ åtgärd.
    expect(before).toBe(100);
    expect(after).toBe(before);
  });

  it("går aldrig under noll", () => {
    expect(calculateBalance([tx({ kind: "REDEEM", points: -900 })], NOW)).toBe(0);
  });

  it("ger 0 för en gäst utan transaktioner", () => {
    expect(calculateBalance([], NOW)).toBe(0);
  });
});

describe("canRedeem", () => {
  it("kräver att saldot räcker", () => {
    expect(canRedeem(500, 500)).toBe(true);
    expect(canRedeem(499, 500)).toBe(false);
  });

  it("avvisar kostnader som inte är positiva heltal", () => {
    expect(canRedeem(500, 0)).toBe(false);
    expect(canRedeem(500, -100)).toBe(false);
    expect(canRedeem(500, 1.5)).toBe(false);
  });
});

describe("expiringPoints", () => {
  it("listar poäng som går ut inom fönstret", () => {
    const points = expiringPoints(
      [
        tx({ points: 200, expiresAt: daysFromNow(10) }),
        tx({ points: 300, expiresAt: daysFromNow(60) }),
        tx({ points: 400, expiresAt: null }),
      ],
      30,
      NOW,
    );
    expect(points).toBe(200);
  });

  it("räknar inte poäng som redan gått ut", () => {
    expect(expiringPoints([tx({ points: 200, expiresAt: daysFromNow(-1) })], 30, NOW)).toBe(0);
  });
});
