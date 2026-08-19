import { describe, expect, it } from "vitest";
import { isPunchCardEnabled, punchCardState } from "./punch-card";

describe("punchCardState", () => {
  it("räknar besök, inte kronor", () => {
    const state = punchCardState({ size: 10, completedOrders: 3, rewardsRedeemed: 0 });
    expect(state.visits).toBe(3);
    expect(state.remaining).toBe(7);
    expect(state.isEarned).toBe(false);
  });

  it("belöningen är intjänad vid tionde besöket", () => {
    const state = punchCardState({ size: 10, completedOrders: 10, rewardsRedeemed: 0 });
    expect(state.isEarned).toBe(true);
    expect(state.remaining).toBe(0);
  });

  it("kortet börjar om efter en uttagen belöning", () => {
    // Utan avdraget för uttagna belöningar hade den som ätit tjugo gånger stått
    // med en evigt intjänad belöning i stället för två uttagna och noll kvar.
    const state = punchCardState({ size: 10, completedOrders: 10, rewardsRedeemed: 1 });
    expect(state.visits).toBe(0);
    expect(state.remaining).toBe(10);
    expect(state.isEarned).toBe(false);
  });

  it("tjugo besök och en uttagen belöning ger en till", () => {
    const state = punchCardState({ size: 10, completedOrders: 20, rewardsRedeemed: 1 });
    expect(state.isEarned).toBe(true);
    expect(state.rewardsRedeemed).toBe(1);
  });

  it("visar aldrig fler klipp än kortet rymmer", () => {
    const state = punchCardState({ size: 10, completedOrders: 14, rewardsRedeemed: 0 });
    expect(state.visits).toBe(10);
    expect(state.isEarned).toBe(true);
  });

  it("restaurangen får välja en annan storlek", () => {
    const state = punchCardState({ size: 8, completedOrders: 8, rewardsRedeemed: 0 });
    expect(state.isEarned).toBe(true);
  });

  it("tål orimliga tal utan att ge orimliga svar", () => {
    const state = punchCardState({ size: 0, completedOrders: -5, rewardsRedeemed: -1 });
    expect(state.size).toBe(1);
    expect(state.visits).toBeGreaterThanOrEqual(0);
    expect(state.remaining).toBeGreaterThanOrEqual(0);
  });
});

describe("isPunchCardEnabled", () => {
  it("null betyder av", () => {
    expect(isPunchCardEnabled(null)).toBe(false);
  });

  it("ett klippkort på ett besök är inget klippkort", () => {
    expect(isPunchCardEnabled(1)).toBe(false);
  });

  it("två eller fler är påslaget", () => {
    expect(isPunchCardEnabled(2)).toBe(true);
    expect(isPunchCardEnabled(10)).toBe(true);
  });
});
