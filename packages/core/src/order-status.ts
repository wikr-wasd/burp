import type { OrderStatus } from "./types";

/**
 * Orderns statusmaskin (avsnitt 5.1).
 *
 *   DRAFT → PLACED → ACCEPTED → PREPARING → READY → COMPLETED
 *                      │
 *                      └──→ CANCELLED / REFUNDED
 *
 * Övergångarna finns här och bara här. Databasen har samma regel som trigger
 * (migration 0010) — koden är för snabb feedback, triggern är garantin.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ["PLACED", "CANCELLED"],
  PLACED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED", "REFUNDED"],
  PREPARING: ["READY", "CANCELLED", "REFUNDED"],
  READY: ["COMPLETED", "REFUNDED"],
  // Slutlägen. COMPLETED kan bara lämnas via REFUNDED, och bara av personal.
  COMPLETED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

/** Ordningen i det normala flödet. Används för "till och med status"-jämförelser. */
const HAPPY_PATH: readonly OrderStatus[] = [
  "DRAFT",
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["COMPLETED", "CANCELLED", "REFUNDED"];

/**
 * Statusarna som betyder "köket har något att göra med den här".
 *
 * `DRAFT` ingår inte, och det är hela poängen sedan kortbetalning finns: en
 * kortorder skapas som utkast innan gästen betalat och lyfts till `PLACED`
 * först av leverantörens webhook. Köket ska aldrig se en obetald order.
 *
 * Ligger här och inte i webbens datalager därför att både köksskärmens fråga
 * och dess larm behöver samma lista — och den ena körs på servern medan den
 * andra körs i webbläsaren.
 */
export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
];

/** Har köket något ogjort med den här ordern? */
export function isActiveForKitchen(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export class InvalidTransitionError extends Error {
  override readonly name = "InvalidTransitionError";
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(
      `Ordern kan inte gå från ${from} till ${to}. Tillåtna nästa steg: ${
        TRANSITIONS[from].join(", ") || "inga (slutläge)"
      }.`,
    );
  }
}

/**
 * Har ordern nått `threshold` i det normala flödet?
 *
 * Avbrutna och återbetalade order ligger utanför flödet och räknas alltid som
 * passerade — inget får ändras på dem.
 */
export function hasReachedStatus(current: OrderStatus, threshold: OrderStatus): boolean {
  const currentIndex = HAPPY_PATH.indexOf(current);
  if (currentIndex === -1) return true;

  const thresholdIndex = HAPPY_PATH.indexOf(threshold);
  if (thresholdIndex === -1) return true;

  return currentIndex >= thresholdIndex;
}

/** Statusen ordern hamnar i när den läggs, givet om restaurangen auto-accepterar. */
export function statusAfterPlacement(autoAccept: boolean): OrderStatus {
  return autoAccept ? "ACCEPTED" : "PLACED";
}

/*
 * Statusernas namn låg här på svenska som `ORDER_STATUS_LABELS` till
 * 2026-08-21. De ligger nu i ordboken, och i TVÅ uppsättningar: `staff.status`
 * för personalen och `receipt.status` för gästen.
 *
 * Att det är två är inte en dubblett som glömts. Gästen läser "Serverad" där
 * personalen läser "Slutförd", därför att gästen beskriver sin mat och
 * personalen sitt arbete. Samma rad i databasen, två läsare, två ordval — och
 * `OrderStatus` här är den enda nyckeln båda utgår från.
 */
