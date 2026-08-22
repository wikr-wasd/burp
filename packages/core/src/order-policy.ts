import { hasReachedStatus, isTerminal } from "./order-status";
import { DEFAULT_ORDER_POLICY, type OrderPolicy, type OrderStatus } from "./types";

/**
 * Regelmotorn för vad gästen får ändra på en lagd order (avsnitt 5.2).
 *
 * Restaurangen sätter reglerna i `restaurants.order_policy`. Motorn körs på
 * SERVERN vid varje ändringsförsök. Klienten kör samma funktioner enbart för
 * att visa eller dölja knappar — en gäst som anropar API:t direkt möter
 * exakt samma svar.
 */

export type EditAction = "ADD_ITEM" | "REMOVE_ITEM" | "CHANGE_OPTIONS" | "CANCEL";

export interface OrderEditContext {
  status: OrderStatus;
  /** När ordern gick från DRAFT till PLACED. */
  placedAt: Date;
  /** Injiceras för testbarhet och för att servern ska styra tiden, inte klienten. */
  now?: Date;
}

export type EditDecision =
  | { allowed: true }
  | { allowed: false; reason: EditDenialReason; message: string };

export type EditDenialReason =
  | "ORDER_FINISHED"
  | "ACTION_DISABLED"
  | "STATUS_PASSED"
  | "WINDOW_EXPIRED";

/**
 * Får gästen utföra `action` på ordern just nu?
 *
 * Kontrollerna görs i denna ordning, och den strängaste vinner:
 *   1. Ordern är i ett slutläge  → aldrig
 *   2. Restaurangen har stängt av åtgärden → aldrig
 *   3. Ordern har passerat tillåten status → nej
 *   4. Tidsfönstret har löpt ut → nej
 */
export function canGuestEdit(
  policy: OrderPolicy,
  context: OrderEditContext,
  action: EditAction,
): EditDecision {
  const now = context.now ?? new Date();

  if (isTerminal(context.status)) {
    return deny("ORDER_FINISHED", "Ordern är avslutad och kan inte ändras.");
  }

  if (!isActionEnabled(policy, action)) {
    return deny("ACTION_DISABLED", "Restaurangen tillåter inte den här ändringen.");
  }

  // Avbokning har ett eget statustak; övriga ändringar delar `editableUntilStatus`.
  const limitStatus = action === "CANCEL" ? policy.allowCancelUntilStatus : policy.editableUntilStatus;

  // Gränsen är inklusive: är ordern PÅ statusen går det fortfarande, har den
  // gått förbi går det inte.
  if (hasPassedStatus(context.status, limitStatus)) {
    return deny("STATUS_PASSED", "Köket har redan kommit för långt med ordern.");
  }

  // Avbokning styrs enbart av status. Tidsfönstret gäller innehållsändringar —
  // en gäst ska kunna avboka så länge maten inte påbörjats, även efter 2 minuter.
  if (action !== "CANCEL") {
    const elapsedSeconds = (now.getTime() - context.placedAt.getTime()) / 1000;
    if (elapsedSeconds > policy.editWindowSeconds) {
      return deny(
        "WINDOW_EXPIRED",
        `Tiden för att ändra ordern har gått ut (${policy.editWindowSeconds} sekunder).`,
      );
    }
  }

  return { allowed: true };
}

function isActionEnabled(policy: OrderPolicy, action: EditAction): boolean {
  switch (action) {
    case "ADD_ITEM":
      return policy.allowAddItems;
    case "REMOVE_ITEM":
      return policy.allowRemoveItems;
    case "CHANGE_OPTIONS":
      return policy.allowChangeOptions;
    case "CANCEL":
      return true;
  }
}

/** Har ordern gått FÖRBI `limit`? Att stå på `limit` räknas inte som passerat. */
function hasPassedStatus(current: OrderStatus, limit: OrderStatus): boolean {
  return current !== limit && hasReachedStatus(current, limit);
}

/**
 * Erbjöd restaurangen någonsin ett ändringsfönster?
 *
 * Frågan gäller POLICYN och inte vad som är tillåtet just nu, och skillnaden är
 * hela poängen. Kvittosidan visade nedräkningen bara när en icke-avbokande
 * åtgärd fortfarande var tillåten — alltså exakt så länge nedräkningen var
 * positiv. I samma sekund som fönstret gick ut försvann villkoret, och med det
 * beskedet om att det gått ut: `receipt.editExpired` fanns översatt på fem
 * språk och kunde aldrig renderas.
 *
 * Gästen såg då rubriken "Ändra beställningen" med rättlistan borta och
 * ingenting som sa varför. Fyndet kom ur genomgången av gästflödet 2026-08-22.
 *
 * En restaurang som stängt av alla innehållsändringar, eller satt fönstret till
 * noll, ska däremot inte visa någon nedräkning alls — det finns inget som gått
 * ut. Det är den kontrollen som ska stå i UI:t, och den är statisk.
 */
export function policyOffersEditWindow(policy: OrderPolicy): boolean {
  if (policy.editWindowSeconds <= 0) return false;
  return policy.allowAddItems || policy.allowRemoveItems || policy.allowChangeOptions;
}

/** Alla åtgärder gästen får utföra just nu. Bekvämt för att rendera UI. */
export function availableEditActions(
  policy: OrderPolicy,
  context: OrderEditContext,
): readonly EditAction[] {
  const actions: EditAction[] = ["ADD_ITEM", "REMOVE_ITEM", "CHANGE_OPTIONS", "CANCEL"];
  return actions.filter((action) => canGuestEdit(policy, context, action).allowed);
}

/**
 * Läser en policy ur databasens JSONB och fyller på med standardvärden.
 * Okända eller trasiga fält faller tillbaka på `DEFAULT_ORDER_POLICY` i stället
 * för att kasta — en felskriven policy ska inte stoppa beställningar.
 */
export function parseOrderPolicy(raw: unknown): OrderPolicy {
  if (raw === null || typeof raw !== "object") return { ...DEFAULT_ORDER_POLICY };
  const input = raw as Record<string, unknown>;

  return {
    editWindowSeconds: num(input["edit_window_seconds"], DEFAULT_ORDER_POLICY.editWindowSeconds),
    editableUntilStatus: status(input["editable_until_status"], DEFAULT_ORDER_POLICY.editableUntilStatus),
    allowAddItems: bool(input["allow_add_items"], DEFAULT_ORDER_POLICY.allowAddItems),
    allowRemoveItems: bool(input["allow_remove_items"], DEFAULT_ORDER_POLICY.allowRemoveItems),
    allowChangeOptions: bool(input["allow_change_options"], DEFAULT_ORDER_POLICY.allowChangeOptions),
    allowCancelUntilStatus: status(
      input["allow_cancel_until_status"],
      DEFAULT_ORDER_POLICY.allowCancelUntilStatus,
    ),
    autoAccept: bool(input["auto_accept"], DEFAULT_ORDER_POLICY.autoAccept),
    prepTimeMinutes: num(input["prep_time_minutes"], DEFAULT_ORDER_POLICY.prepTimeMinutes),
    allowScheduledOrders: bool(
      input["allow_scheduled_orders"],
      DEFAULT_ORDER_POLICY.allowScheduledOrders,
    ),
  };
}

/** Skriver tillbaka en policy till databasens snake_case-format. */
export function serializeOrderPolicy(policy: OrderPolicy): Record<string, unknown> {
  return {
    edit_window_seconds: policy.editWindowSeconds,
    editable_until_status: policy.editableUntilStatus,
    allow_add_items: policy.allowAddItems,
    allow_remove_items: policy.allowRemoveItems,
    allow_change_options: policy.allowChangeOptions,
    allow_cancel_until_status: policy.allowCancelUntilStatus,
    auto_accept: policy.autoAccept,
    prep_time_minutes: policy.prepTimeMinutes,
    allow_scheduled_orders: policy.allowScheduledOrders,
  };
}

function deny(reason: EditDenialReason, message: string): EditDecision {
  return { allowed: false, reason, message };
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function status(value: unknown, fallback: OrderStatus): OrderStatus {
  const known: OrderStatus[] = [
    "DRAFT",
    "PLACED",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "COMPLETED",
    "CANCELLED",
    "REFUNDED",
  ];
  return typeof value === "string" && (known as string[]).includes(value)
    ? (value as OrderStatus)
    : fallback;
}
