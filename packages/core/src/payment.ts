import { assertOre, sumOre, type Ore } from "./money";
import type { OrderTotals, PaymentMethod, PaymentProviderId, PaymentStatus } from "./types";

/**
 * Betalningens livscykel och de regler som gäller oavsett leverantör.
 *
 *   PENDING → AUTHORIZED → CAPTURED → REFUNDED / PARTIALLY_REFUNDED
 *      │           │
 *      └───────────┴──→ FAILED
 *
 * Precis som orderns statusmaskin (`order-status.ts`) finns reglerna på två
 * ställen med flit: här för snabb feedback och för att appen och webben ska
 * räkna likadant, och som trigger i databasen för att vara garantin. En
 * webhook som kommer i oordning ska avvisas av båda.
 *
 * `PARTIALLY_REFUNDED` är inte ett slutläge. En order kan återbetalas i flera
 * steg — en felaktig rätt idag, resten i morgon — och först när summan når hela
 * beloppet blir betalningen `REFUNDED`.
 */
const TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  PENDING: ["AUTHORIZED", "CAPTURED", "FAILED"],
  // Vissa leverantörer capturar direkt och hoppar över AUTHORIZED helt.
  AUTHORIZED: ["CAPTURED", "FAILED"],
  CAPTURED: ["REFUNDED", "PARTIALLY_REFUNDED"],
  PARTIALLY_REFUNDED: ["REFUNDED", "PARTIALLY_REFUNDED"],
  FAILED: [],
  REFUNDED: [],
};

/** Betalningen är avslutad och kan inte ändras vidare. */
export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = ["FAILED", "REFUNDED"];

export function isPaymentTerminal(status: PaymentStatus): boolean {
  return TERMINAL_PAYMENT_STATUSES.includes(status);
}

/** Pengarna har kommit in. Det är det här ordern ska vänta på, inte AUTHORIZED. */
export function isPaymentSettled(status: PaymentStatus): boolean {
  return status === "CAPTURED" || status === "PARTIALLY_REFUNDED" || status === "REFUNDED";
}

export function allowedPaymentTransitions(from: PaymentStatus): readonly PaymentStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new InvalidPaymentTransitionError(from, to);
  }
}

export class InvalidPaymentTransitionError extends Error {
  override readonly name = "InvalidPaymentTransitionError";
  constructor(
    readonly from: PaymentStatus,
    readonly to: PaymentStatus,
  ) {
    super(
      `Betalningen kan inte gå från ${from} till ${to}. Tillåtna nästa steg: ${
        TRANSITIONS[from].join(", ") || "inga (slutläge)"
      }.`,
    );
  }
}

/**
 * Statusen efter en återbetalning.
 *
 * Delbeloppen summeras och jämförs mot betalningen. Att i stället lita på att
 * anropande kod vet om det var "hela" eller "en del" hade gjort statusen
 * beroende av vem som råkade anropa den.
 */
export function statusAfterRefund(paidOre: Ore, refundedOre: Ore): PaymentStatus {
  assertOre(paidOre, "betalt belopp");
  assertOre(refundedOre, "återbetalt belopp");

  if (refundedOre <= 0) {
    throw new RangeError(`återbetalt belopp måste vara positivt, fick: ${refundedOre}`);
  }
  if (refundedOre > paidOre) {
    throw new RangeError(
      `återbetalningen (${refundedOre}) är större än betalningen (${paidOre})`,
    );
  }

  return refundedOre === paidOre ? "REFUNDED" : "PARTIALLY_REFUNDED";
}

/* ── Vad som återstår att debitera ───────────────────────────────────────── */

export interface ChargeBreakdown {
  /** Ordersumman, alltså det gästen ska betala totalt. */
  totalOre: Ore;
  /** Summan av alla betalmedel som redan täckt en del av notan. */
  coveredOre: Ore;
  /** Det som återstår för leverantören att debitera. Aldrig negativt. */
  chargeOre: Ore;
  /** Sant när notan redan är täckt och ingen kortbetalning behövs. */
  isFullyCovered: boolean;
}

/**
 * Vad som återstår att debitera när presentkort och andra betalmedel dragits.
 *
 * Ett presentkort är **betalmedel, inte rabatt**. Skillnaden är inte
 * akademisk: en rabatt sänker ordersumman och därmed både momsen och Burps
 * avgiftsunderlag, medan ett presentkort bara sänker vad som återstår att
 * debitera. Blandas de ihop blir momsen fel i restaurangens bokföring och
 * avgiften fel i vår.
 *
 * Därför tar den här funktionen ordersumman som den är och drar av redan
 * lagda betalningar — den rör aldrig `OrderTotals`.
 */
export function amountToCharge(
  totals: OrderTotals,
  coveringPaymentsOre: readonly Ore[] = [],
): ChargeBreakdown {
  assertOre(totals.totalOre, "ordersumma");

  const coveredOre = sumOre(coveringPaymentsOre);
  if (coveredOre < 0) {
    throw new RangeError(`täckande betalningar kan inte vara negativa, fick: ${coveredOre}`);
  }

  const chargeOre = Math.max(0, totals.totalOre - coveredOre);

  return {
    totalOre: totals.totalOre,
    coveredOre,
    chargeOre,
    isFullyCovered: chargeOre === 0,
  };
}

/**
 * Serverside-kontroll att betalningarna täcker ordern.
 *
 * Klienten får aldrig skicka ett belopp — men leverantören skickar ett, i sin
 * webhook, och det är minst lika viktigt att kontrollera. En webhook kan komma
 * för fel order, med fel valuta eller med ett belopp som inte stämmer, och en
 * order som markeras betald på ett belopp som aldrig kom in är värre än en
 * order som fastnar.
 */
export function assertPaymentCoversOrder(
  orderTotalOre: Ore,
  paidOre: readonly Ore[],
): void {
  assertOre(orderTotalOre, "ordersumma");

  const total = sumOre(paidOre);
  if (total < orderTotalOre) {
    throw new InsufficientPaymentError(orderTotalOre, total);
  }
}

export class InsufficientPaymentError extends Error {
  override readonly name = "InsufficientPaymentError";
  constructor(
    readonly expectedOre: Ore,
    readonly receivedOre: Ore,
  ) {
    super(
      `Betalningen täcker inte ordern. Ordern är ${expectedOre} öre, betalt är ${receivedOre} öre.`,
    );
  }
}

/* ── Leverantör och betalsätt ────────────────────────────────────────────── */

/**
 * Vilken leverantör ett betalsätt går genom hos en viss restaurang.
 *
 * `CARD` avgörs av restaurangens betalkonto och aldrig av landet i en
 * komponent (regel 9). En restaurang i Kroatien kan ha Stripe i dag och Monri
 * i morgon, och gästen ska inte märka bytet.
 */
export function providerForMethod(
  method: PaymentMethod,
  cardProvider: PaymentProviderId | null,
): PaymentProviderId | null {
  switch (method) {
    case "CASH":
      return "CASH";
    case "GIFT_CARD":
      return "GIFT_CARD";
    case "CARD":
      return cardProvider;
  }
}

/** Leverantörer som kräver att gästen betalar innan köket ser ordern. */
export function requiresUpfrontPayment(provider: PaymentProviderId): boolean {
  return provider === "STRIPE" || provider === "MONRI";
}

/**
 * Betalsätt som avslutas utan att någon leverantör behöver tillfrågas.
 *
 * Sedlar lämnas tillbaka över disk, presentkortsvärde skrivs upp igen, och en
 * terminalbetalning återbetalas i terminalen — i inget av fallen finns det en
 * webhook som ska bekräfta något. En återbetalning blir därför SUCCEEDED direkt
 * i stället för att ligga kvar som PENDING i evighet.
 *
 * Regeln stod tidigare som `provider === "CASH" || provider === "GIFT_CARD"` på
 * tre ställen i app-koden och en gång till i `request_refund()`. Tre kopior av
 * samma villkor glider isär första gången ett betalsätt läggs till — vilket är
 * precis vad som hände när terminalen kom.
 */
export function settlesOutsideBurp(provider: PaymentProviderId): boolean {
  return provider === "CASH" || provider === "TERMINAL" || provider === "GIFT_CARD";
}

/**
 * Betalsätt personalen registrerar för hand i kassan.
 *
 * Beloppet skrivs in av en människa och kan avvika från notan — avrundning i
 * lokalen, en rabatt över disk. Kortflödet genom Burp kan aldrig avvika, för
 * där är det leverantören som säger vad som drogs.
 */
export function isStaffRegistered(provider: PaymentProviderId): boolean {
  return provider === "CASH" || provider === "TERMINAL";
}

/**
 * Vad ett betalsätt heter för en människa.
 *
 * Låg tidigare som en egen lista i `cash-register.tsx`. Två listor betyder att
 * kassan och kvittot kan säga olika saker om samma betalning, och gästen som
 * jämför dem har rätt att bli förvirrad.
 */
export const PAYMENT_PROVIDER_LABELS: Record<PaymentProviderId, string> = {
  CASH: "Kontant",
  TERMINAL: "Kort i terminal",
  GIFT_CARD: "Presentkort",
  STRIPE: "Kort",
  MONRI: "Kort",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Väntar",
  AUTHORIZED: "Reserverad",
  CAPTURED: "Betald",
  FAILED: "Misslyckad",
  REFUNDED: "Återbetald",
  PARTIALLY_REFUNDED: "Delvis återbetald",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Kontant",
  CARD: "Kort",
  GIFT_CARD: "Presentkort",
};
