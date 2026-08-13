import { oreToKronor, type Ore } from "./money";

/**
 * Lojalitetspoäng (avsnitt 10).
 *
 * Saldot LAGRAS ALDRIG. Det räknas fram ur `loyalty_transactions`, som är en
 * ren händelselogg. Ett lagrat saldo kan hamna i otakt med sina transaktioner
 * vid en misslyckad skrivning eller en samtidig inlösen; en summa över loggen
 * kan det inte.
 */

export const LOYALTY_TRANSACTION_KINDS = [
  "EARN",
  "REDEEM",
  "EXPIRE",
  "REFERRAL",
  "BIRTHDAY",
  "ADJUSTMENT",
] as const;
export type LoyaltyTransactionKind = (typeof LOYALTY_TRANSACTION_KINDS)[number];

export interface LoyaltyTransaction {
  kind: LoyaltyTransactionKind;
  /** Positivt för intjänade poäng, negativt för inlösta och utgångna. */
  points: number;
  createdAt: Date;
  /** Null = poängen går aldrig ut. */
  expiresAt: Date | null;
}

/** Grundnivå satt av Burp. Restaurangen får höja, aldrig sänka. */
export const BASE_POINTS_PER_KRONA = 1;

/**
 * Poäng för en order.
 *
 * Underlaget är varukorgen exklusive leverans och dricks — gästen ska belönas
 * för att köpa mat, inte för att bo långt bort eller ge dricks.
 */
export function pointsForOrder(itemsGrossOre: Ore, pointsPerKrona = BASE_POINTS_PER_KRONA): number {
  if (pointsPerKrona < BASE_POINTS_PER_KRONA) {
    throw new RangeError(
      `Restaurangen kan höja poängnivån men inte sänka den under ${BASE_POINTS_PER_KRONA}.`,
    );
  }
  return Math.floor(oreToKronor(itemsGrossOre) * pointsPerKrona);
}

/**
 * Räknar fram saldot ur loggen vid en given tidpunkt.
 *
 * `EXPIRE`-rader skrivs av ett bakgrundsjobb. Funktionen räknar dessutom bort
 * poster vars `expiresAt` passerat men som jobbet ännu inte hunnit hantera, så
 * att gästen aldrig ser ett saldo hen inte kan använda.
 */
export function calculateBalance(
  transactions: readonly LoyaltyTransaction[],
  now = new Date(),
): number {
  let balance = 0;

  for (const transaction of transactions) {
    if (transaction.points > 0 && transaction.expiresAt && transaction.expiresAt <= now) {
      continue; // Utgången men ännu inte bokförd som EXPIRE.
    }
    balance += transaction.points;
  }

  return Math.max(0, balance);
}

/** Kan gästen lösa in en belöning som kostar `cost` poäng? */
export function canRedeem(balance: number, cost: number): boolean {
  return Number.isInteger(cost) && cost > 0 && balance >= cost;
}

/**
 * Poäng som går ut inom `withinDays`. Underlag för påminnelsemail.
 *
 * Utgångsdatum finns för att poängskulden inte ska växa i evighet — en skuld
 * utan slutdatum är en post i balansräkningen som aldrig går att stänga.
 */
export function expiringPoints(
  transactions: readonly LoyaltyTransaction[],
  withinDays: number,
  now = new Date(),
): number {
  const deadline = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  return transactions
    .filter((t) => t.points > 0 && t.expiresAt !== null && t.expiresAt > now && t.expiresAt <= deadline)
    .reduce((sum, t) => sum + t.points, 0);
}
