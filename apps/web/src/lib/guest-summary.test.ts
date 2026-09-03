import { describe, expect, it } from "vitest";
import { summariseGuest } from "./guest-summary";
import type { GuestOrder } from "./guest";

const order = (over: Partial<GuestOrder>): GuestOrder => ({
  id: crypto.randomUUID(),
  status: "COMPLETED",
  type: "TABLE",
  totalOre: 1200,
  currency: "BAM",
  placedAt: "2026-08-01T18:00:00Z",
  completedAt: "2026-08-01T18:40:00Z",
  restaurantId: "r1",
  restaurantName: "Željo",
  restaurantSlug: "zeljo",
  citySlug: "sarajevo",
  itemNames: ["Ćevapi"],
  hasReview: false,
  ...over,
});

describe("summariseGuest", () => {
  it("ger en tom sammanfattning utan historik", () => {
    expect(summariseGuest([])).toEqual({ visits: 0, since: null, places: [], dishes: [] });
  });

  it("räknar inte avbrutna eller återbetalda som besök", () => {
    // "Din favoriträtt" som pekar på något hon fick pengarna tillbaka för
    // läser som ett hån.
    const summary = summariseGuest([
      order({ status: "CANCELLED", itemNames: ["Burek"] }),
      order({ status: "REFUNDED", itemNames: ["Burek"] }),
      order({ status: "COMPLETED", itemNames: ["Ćevapi"] }),
    ]);

    expect(summary.visits).toBe(1);
    expect(summary.dishes).toEqual([{ name: "Ćevapi", times: 1 }]);
  });

  it("rankar ställen efter antal besök", () => {
    const summary = summariseGuest([
      order({ restaurantId: "a", restaurantName: "Alfa" }),
      order({ restaurantId: "b", restaurantName: "Beta" }),
      order({ restaurantId: "b", restaurantName: "Beta" }),
    ]);

    expect(summary.places.map((p) => [p.name, p.visits])).toEqual([
      ["Beta", 2],
      ["Alfa", 1],
    ]);
  });

  it("räknar samma rätt två gånger på en nota som ett tillfälle", () => {
    // Den som beställer två portioner åt sällskapet har valt en gång.
    const summary = summariseGuest([order({ itemNames: ["Ćevapi", "Ćevapi", "Burek"] })]);
    expect(summary.dishes).toEqual([
      { name: "Burek", times: 1 },
      { name: "Ćevapi", times: 1 },
    ]);
  });

  it("håller ordningen stabil när två har lika många", () => {
    // Annars byter listan ordning mellan två sidladdningar utan att något hänt.
    const first = summariseGuest([order({ itemNames: ["Burek"] }), order({ itemNames: ["Ajvar"] })]);
    const again = summariseGuest([order({ itemNames: ["Ajvar"] }), order({ itemNames: ["Burek"] })]);
    expect(first.dishes).toEqual(again.dishes);
  });

  it("hittar det äldsta besöket", () => {
    const summary = summariseGuest([
      order({ completedAt: "2026-08-01T10:00:00Z" }),
      order({ completedAt: "2026-06-01T10:00:00Z" }),
    ]);
    expect(summary.since).toBe("2026-06-01T10:00:00Z");
  });

  it("faller tillbaka på placedAt när ordern inte hunnit bli klar", () => {
    const summary = summariseGuest([
      order({ status: "PREPARING", completedAt: null, placedAt: "2026-05-01T10:00:00Z" }),
    ]);
    expect(summary.since).toBe("2026-05-01T10:00:00Z");
  });

  it("visar högst tre av varje som standard", () => {
    const summary = summariseGuest(
      ["a", "b", "c", "d"].map((n) => order({ restaurantId: n, restaurantName: n, itemNames: [n] })),
    );
    expect(summary.places).toHaveLength(3);
    expect(summary.dishes).toHaveLength(3);
  });
});
