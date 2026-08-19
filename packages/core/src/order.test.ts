import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  allowedTransitions,
  assertTransition,
  canTransition,
  hasReachedStatus,
  InvalidTransitionError,
  isActiveForKitchen,
  isTerminal,
  statusAfterPlacement,
} from "./order-status";
import {
  availableEditActions,
  canGuestEdit,
  parseOrderPolicy,
  serializeOrderPolicy,
} from "./order-policy";
import { DEFAULT_ORDER_POLICY, type OrderPolicy } from "./types";

const PLACED_AT = new Date("2026-08-13T12:00:00Z");
const secondsAfter = (seconds: number) => new Date(PLACED_AT.getTime() + seconds * 1000);

describe("statusmaskin", () => {
  it("följer det normala flödet", () => {
    expect(canTransition("DRAFT", "PLACED")).toBe(true);
    expect(canTransition("PLACED", "ACCEPTED")).toBe(true);
    expect(canTransition("ACCEPTED", "PREPARING")).toBe(true);
    expect(canTransition("PREPARING", "READY")).toBe(true);
    expect(canTransition("READY", "COMPLETED")).toBe(true);
  });

  it("tillåter inte att hoppa över steg", () => {
    expect(canTransition("PLACED", "READY")).toBe(false);
    expect(canTransition("DRAFT", "COMPLETED")).toBe(false);
  });

  it("tillåter inte att gå bakåt", () => {
    expect(canTransition("PREPARING", "ACCEPTED")).toBe(false);
    expect(canTransition("COMPLETED", "READY")).toBe(false);
  });

  it("låser avbrutna och återbetalade order helt", () => {
    expect(allowedTransitions("CANCELLED")).toHaveLength(0);
    expect(allowedTransitions("REFUNDED")).toHaveLength(0);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("REFUNDED")).toBe(true);
  });

  it("låter en slutförd order återbetalas", () => {
    expect(canTransition("COMPLETED", "REFUNDED")).toBe(true);
  });

  it("kastar med tillåtna alternativ i felmeddelandet", () => {
    expect(() => assertTransition("PLACED", "READY")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("PLACED", "READY")).toThrow(/ACCEPTED/);
  });

  it("hoppar över manuellt godkännande när auto_accept är på", () => {
    expect(statusAfterPlacement(false)).toBe("PLACED");
    expect(statusAfterPlacement(true)).toBe("ACCEPTED");
  });

  it("räknar status utanför flödet som passerad", () => {
    expect(hasReachedStatus("CANCELLED", "ACCEPTED")).toBe(true);
  });
});

describe("isActiveForKitchen", () => {
  it("köket ser en lagd order", () => {
    expect(isActiveForKitchen("PLACED")).toBe(true);
    expect(isActiveForKitchen("ACCEPTED")).toBe(true);
    expect(isActiveForKitchen("PREPARING")).toBe(true);
    expect(isActiveForKitchen("READY")).toBe(true);
  });

  /**
   * Det här är det som gick sönder när kortbetalning byggdes.
   *
   * En kortorder skapas som DRAFT innan gästen betalat och lyfts till PLACED
   * först av webhooken. Köksskärmens larm gick på INSERT, alltså tjöt det för
   * en obetald order som inte syns någonstans — och var tyst i det ögonblick
   * pengarna kom in och maten faktiskt skulle lagas.
   */
  it("köket ser aldrig ett utkast", () => {
    expect(isActiveForKitchen("DRAFT")).toBe(false);
    expect(ACTIVE_STATUSES).not.toContain("DRAFT");
  });

  it("en avslutad order hör inte till köket", () => {
    expect(isActiveForKitchen("COMPLETED")).toBe(false);
    expect(isActiveForKitchen("CANCELLED")).toBe(false);
    expect(isActiveForKitchen("REFUNDED")).toBe(false);
  });
});

describe("canGuestEdit", () => {
  it("tillåter ändring inom fönstret och före statusgränsen", () => {
    const decision = canGuestEdit(
      DEFAULT_ORDER_POLICY,
      { status: "PLACED", placedAt: PLACED_AT, now: secondsAfter(60) },
      "ADD_ITEM",
    );
    expect(decision.allowed).toBe(true);
  });

  it("tillåter ändring PÅ gränsstatusen — gränsen är inklusive", () => {
    const decision = canGuestEdit(
      DEFAULT_ORDER_POLICY,
      { status: "ACCEPTED", placedAt: PLACED_AT, now: secondsAfter(10) },
      "ADD_ITEM",
    );
    expect(decision.allowed).toBe(true);
  });

  it("nekar när ordern passerat gränsstatusen", () => {
    const decision = canGuestEdit(
      DEFAULT_ORDER_POLICY,
      { status: "PREPARING", placedAt: PLACED_AT, now: secondsAfter(10) },
      "ADD_ITEM",
    );
    expect(decision).toMatchObject({ allowed: false, reason: "STATUS_PASSED" });
  });

  it("nekar när tidsfönstret gått ut", () => {
    const decision = canGuestEdit(
      DEFAULT_ORDER_POLICY,
      { status: "PLACED", placedAt: PLACED_AT, now: secondsAfter(121) },
      "ADD_ITEM",
    );
    expect(decision).toMatchObject({ allowed: false, reason: "WINDOW_EXPIRED" });
  });

  it("nekar åtgärder restaurangen stängt av", () => {
    const decision = canGuestEdit(
      DEFAULT_ORDER_POLICY, // allow_change_options: false
      { status: "PLACED", placedAt: PLACED_AT, now: secondsAfter(10) },
      "CHANGE_OPTIONS",
    );
    expect(decision).toMatchObject({ allowed: false, reason: "ACTION_DISABLED" });
  });

  it("nekar allt på en avslutad order", () => {
    for (const status of ["COMPLETED", "CANCELLED", "REFUNDED"] as const) {
      const decision = canGuestEdit(
        DEFAULT_ORDER_POLICY,
        { status, placedAt: PLACED_AT, now: secondsAfter(1) },
        "CANCEL",
      );
      expect(decision).toMatchObject({ allowed: false, reason: "ORDER_FINISHED" });
    }
  });

  it("låter gästen avboka efter att ändringsfönstret gått ut", () => {
    // Avbokning styrs av status, inte av edit_window_seconds.
    const decision = canGuestEdit(
      DEFAULT_ORDER_POLICY,
      { status: "PREPARING", placedAt: PLACED_AT, now: secondsAfter(600) },
      "CANCEL",
    );
    expect(decision.allowed).toBe(true);
  });

  it("nekar avbokning när maten är klar", () => {
    const decision = canGuestEdit(
      DEFAULT_ORDER_POLICY,
      { status: "READY", placedAt: PLACED_AT, now: secondsAfter(600) },
      "CANCEL",
    );
    expect(decision).toMatchObject({ allowed: false, reason: "STATUS_PASSED" });
  });
});

describe("availableEditActions", () => {
  it("listar bara det gästen faktiskt får göra", () => {
    const actions = availableEditActions(DEFAULT_ORDER_POLICY, {
      status: "PLACED",
      placedAt: PLACED_AT,
      now: secondsAfter(30),
    });
    expect(actions).toEqual(["ADD_ITEM", "REMOVE_ITEM", "CANCEL"]);
  });
});

describe("parseOrderPolicy", () => {
  it("faller tillbaka på standard när kolumnen är tom eller trasig", () => {
    expect(parseOrderPolicy(null)).toEqual(DEFAULT_ORDER_POLICY);
    expect(parseOrderPolicy("inte ett objekt")).toEqual(DEFAULT_ORDER_POLICY);
  });

  it("ignorerar enskilda ogiltiga fält utan att kasta", () => {
    const policy = parseOrderPolicy({
      edit_window_seconds: "trehundra",
      editable_until_status: "BANANA",
      auto_accept: true,
    });
    expect(policy.editWindowSeconds).toBe(DEFAULT_ORDER_POLICY.editWindowSeconds);
    expect(policy.editableUntilStatus).toBe(DEFAULT_ORDER_POLICY.editableUntilStatus);
    expect(policy.autoAccept).toBe(true);
  });

  it("överlever en tur till databasen och tillbaka", () => {
    const original: OrderPolicy = {
      ...DEFAULT_ORDER_POLICY,
      editWindowSeconds: 300,
      autoAccept: true,
      allowChangeOptions: true,
    };
    expect(parseOrderPolicy(serializeOrderPolicy(original))).toEqual(original);
  });
});
