import type { Ore } from "./money";

/* ── Roller ──────────────────────────────────────────────────────────────── */

/** Personalroller. Speglar enum `staff_role` i databasen (avsnitt 11). */
export const STAFF_ROLES = ["owner", "manager", "staff", "kitchen"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Svenska etiketter för UI. */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Ägare",
  manager: "Chef",
  staff: "Personal",
  kitchen: "Kock",
};

/* ── Order ───────────────────────────────────────────────────────────────── */

/** Speglar enum `order_status`. Livscykeln beskrivs i avsnitt 5.1. */
export const ORDER_STATUSES = [
  "DRAFT",
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Speglar enum `order_type`. */
export const ORDER_TYPES = ["DELIVERY", "PICKUP", "TABLE"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/* ── Moms ────────────────────────────────────────────────────────────────── */

/**
 * Momssatser i baspunkter.
 *
 * Sverige: 12 % på livsmedel och restaurangtjänster, 25 % på alkohol.
 * Detta är den vanliga uppdelningen men momsklassning är restaurangens ansvar
 * — därför sitter satsen per menyrad (`menu_items.vat_rate_bps`), inte hårdkodad.
 */
export const VAT_FOOD_BPS = 1200;
export const VAT_ALCOHOL_BPS = 2500;
export const VAT_STANDARD_BPS = 2500;

/* ── Prisberäkning ───────────────────────────────────────────────────────── */

/**
 * Priser anges alltid INKLUSIVE moms (bruttopris), som svensk konsumentprissättning
 * kräver. Nettobelopp och momsbelopp räknas fram, aldrig tvärtom.
 */
export interface PricedOption {
  optionId: string;
  name: string;
  /** Prispåslag inkl. moms. Kan vara 0 eller negativt (t.ex. "utan ost"). */
  priceOre: Ore;
}

export interface PricedLine {
  menuItemId: string;
  name: string;
  /** Styckpris inkl. moms, exkl. tillval. */
  unitPriceOre: Ore;
  quantity: number;
  /** Momssats för raden i baspunkter, t.ex. 1200. */
  vatRateBps: number;
  options: readonly PricedOption[];
}

export interface LineTotal {
  menuItemId: string;
  /** (styckpris + summa tillval) × antal, inkl. moms. */
  grossOre: Ore;
  /** Momsbeloppet som ingår i `grossOre`. */
  vatOre: Ore;
  /** `grossOre` − `vatOre`. */
  netOre: Ore;
  vatRateBps: number;
}

/**
 * Vad Burps avgift räknas på. Detta är öppen fråga 1 och måste beslutas
 * innan lansering — modellen är därför konfigurerbar, inte hårdkodad.
 *
 * - `GROSS_ITEMS`   varukorgen inkl. moms, exkl. leverans och dricks (rekommenderat utgångsläge)
 * - `NET_ITEMS`     varukorgen exkl. moms, exkl. leverans och dricks
 * - `GROSS_TOTAL`   varukorgen inkl. moms och leveransavgift, exkl. dricks
 *
 * Dricks ingår aldrig i underlaget. Den är gästens pengar till personalen,
 * inte restaurangens omsättning.
 */
export const FEE_BASES = ["GROSS_ITEMS", "NET_ITEMS", "GROSS_TOTAL"] as const;
export type FeeBase = (typeof FEE_BASES)[number];

/** Burps standardavgift: 340 baspunkter = 3,40 %. */
export const DEFAULT_FEE_BPS = 340;

/** Utgångsläget tills öppen fråga 1 är besvarad. Se docs/OPEN-QUESTIONS.md. */
export const DEFAULT_FEE_BASE: FeeBase = "GROSS_ITEMS";

export interface OrderTotals {
  lines: readonly LineTotal[];
  /** Summa av alla rader inkl. moms. */
  itemsGrossOre: Ore;
  /** Momsen som ingår i `itemsGrossOre`, uppdelad per momssats. */
  vatByRate: Readonly<Record<number, Ore>>;
  itemsVatOre: Ore;
  itemsNetOre: Ore;
  deliveryFeeOre: Ore;
  /** Alltid ≤ 0. Rabatt dras. */
  discountOre: Ore;
  /** Dricks. Separat rad, ingår inte i restaurangens omsättning. */
  tipOre: Ore;
  /** Det gästen faktiskt betalar. */
  totalOre: Ore;
}

export interface FeeBreakdown {
  base: FeeBase;
  /** Underlaget avgiften räknades på. */
  baseAmountOre: Ore;
  bps: number;
  /** Burps avgift till restaurangen. */
  feeOre: Ore;
  /**
   * Vad restaurangen får ut FÖRE betalleverantörens egen avgift.
   *
   * Kortavgiften är inte med här — det är öppen fråga 1: ligger den ovanpå
   * eller inuti 3,4 %? Så länge frågan är obesvarad ska ingen kod låtsas veta.
   */
  restaurantPayoutOre: Ore;
}

/* ── Orderregler ─────────────────────────────────────────────────────────── */

/**
 * Restaurangens egna regler för vad gästen får ändra. Lagras som JSONB i
 * `restaurants.order_policy` (avsnitt 5.2). Körs alltid på servern —
 * klienten läser samma regler enbart för att visa eller dölja knappar.
 */
export interface OrderPolicy {
  /** Ändringsfönster i sekunder från att ordern lades. */
  editWindowSeconds: number;
  /** Ändring tillåts till OCH MED denna status. */
  editableUntilStatus: OrderStatus;
  allowAddItems: boolean;
  allowRemoveItems: boolean;
  allowChangeOptions: boolean;
  /** Avbokning tillåts till OCH MED denna status. */
  allowCancelUntilStatus: OrderStatus;
  /** Hoppar över manuellt godkännande: PLACED → ACCEPTED direkt. */
  autoAccept: boolean;
  prepTimeMinutes: number;
  /** Låter gäster boka i förväg (avsnitt 5.3). */
  allowScheduledOrders: boolean;
}

export const DEFAULT_ORDER_POLICY: OrderPolicy = {
  editWindowSeconds: 120,
  editableUntilStatus: "ACCEPTED",
  allowAddItems: true,
  allowRemoveItems: true,
  allowChangeOptions: false,
  allowCancelUntilStatus: "PREPARING",
  autoAccept: false,
  prepTimeMinutes: 20,
  allowScheduledOrders: false,
};
