import { assertOre, sumOre, type Ore } from "./money";
import type { CurrencyCode } from "./country";

/**
 * Presentkort.
 *
 * Ett presentkort är **betalmedel, inte rabatt**. Det sänker vad som återstår
 * att debitera, aldrig ordersumman — momsen och Burps avgiftsunderlag räknas
 * på hela notan även när halva betalas med ett kort. Blandas de ihop förlorar
 * restaurangen momsunderlag den ska redovisa.
 *
 * **Kortet gäller hos EN restaurang.** Det är inte en produktbegränsning utan
 * hela skälet till att det går att bygga: förbetalt värde som kan lösas in var
 * som helst är utgivning av elektroniska pengar och kräver tillstånd i alla
 * tre marknaderna. Ett kort som bara går att använda hos utgivaren faller
 * normalt under undantaget för begränsade nätverk — men det ska kontrolleras
 * av jurist per land innan det säljs skarpt.
 *
 * Saldot LAGRAS ALDRIG. Det summeras ur transaktionsloggen, av samma skäl som
 * lojalitetssaldot (regel 7): ett lagrat saldo kan hamna i otakt med sina
 * rader, en summa över loggen kan det inte.
 */

export const GIFT_CARD_KINDS = ["ISSUE", "REDEEM", "REFUND"] as const;
export type GiftCardKind = (typeof GIFT_CARD_KINDS)[number];

export interface GiftCardTransaction {
  kind: GiftCardKind;
  /** Alltid positivt. Tecknet följer av `kind`, inte av beloppet. */
  amountOre: Ore;
}

export interface GiftCard {
  id: string;
  restaurantId: string;
  currency: CurrencyCode;
  expiresAt: Date | null;
  isActive: boolean;
}

export type GiftCardProblem =
  | "UNKNOWN_CODE"
  | "INACTIVE"
  | "EXPIRED"
  | "WRONG_RESTAURANT"
  | "WRONG_CURRENCY"
  | "EMPTY";

export const GIFT_CARD_PROBLEM_MESSAGES: Record<GiftCardProblem, string> = {
  UNKNOWN_CODE: "Presentkortet finns inte.",
  INACTIVE: "Presentkortet är spärrat.",
  EXPIRED: "Presentkortet har gått ut.",
  WRONG_RESTAURANT: "Presentkortet gäller bara hos restaurangen som gav ut det.",
  WRONG_CURRENCY: "Presentkortet är i en annan valuta.",
  EMPTY: "Presentkortet är slut.",
};

/**
 * Saldot, räknat ur loggen.
 *
 * `ISSUE` och `REFUND` lägger till, `REDEEM` drar ifrån. En återbetalad order
 * som betalades med presentkort ska ge tillbaka värdet på kortet och inte
 * kontant — annars är presentkortet en väg att växla in det mot pengar.
 */
export function giftCardBalance(transactions: readonly GiftCardTransaction[]): Ore {
  const signed = transactions.map((transaction) => {
    assertOre(transaction.amountOre, "presentkortsbelopp");
    if (transaction.amountOre < 0) {
      throw new RangeError(
        `presentkortsrader lagras med positivt belopp; tecknet följer av kind (fick ${transaction.amountOre})`,
      );
    }
    return transaction.kind === "REDEEM" ? -transaction.amountOre : transaction.amountOre;
  });

  return sumOre(signed);
}

export interface GiftCardContext {
  restaurantId: string;
  currency: CurrencyCode;
  /** Vad som återstår att betala på ordern. */
  amountDueOre: Ore;
  balanceOre: Ore;
  now: Date;
}

export type GiftCardResult =
  | { ok: true; appliedOre: Ore; remainingBalanceOre: Ore; remainingDueOre: Ore }
  | { ok: false; problem: GiftCardProblem };

/**
 * Hur mycket av ett presentkort som får användas på en order.
 *
 * Aldrig mer än saldot och aldrig mer än notan. Ett kort på 50 mot en nota på
 * 12 betalar 12 och behåller 38 — resten står kvar på kortet i stället för att
 * betalas ut, vilket är skillnaden mellan ett presentkort och kontanter.
 */
export function applyGiftCard(card: GiftCard, context: GiftCardContext): GiftCardResult {
  assertOre(context.amountDueOre, "belopp att betala");
  assertOre(context.balanceOre, "presentkortssaldo");

  if (!card.isActive) return { ok: false, problem: "INACTIVE" };
  if (card.expiresAt && context.now >= card.expiresAt) {
    return { ok: false, problem: "EXPIRED" };
  }

  // Spärren som gör hela konstruktionen möjlig utan tillstånd.
  if (card.restaurantId !== context.restaurantId) {
    return { ok: false, problem: "WRONG_RESTAURANT" };
  }

  if (card.currency !== context.currency) {
    return { ok: false, problem: "WRONG_CURRENCY" };
  }

  if (context.balanceOre <= 0) return { ok: false, problem: "EMPTY" };

  const appliedOre = Math.min(context.balanceOre, Math.max(0, context.amountDueOre));

  return {
    ok: true,
    appliedOre,
    remainingBalanceOre: context.balanceOre - appliedOre,
    remainingDueOre: context.amountDueOre - appliedOre,
  };
}

/**
 * Tecken ur en alfabetsrymd utan förväxlingsbara glyfer.
 *
 * Samma urval som QR-koderna: inga nollor, ettor, I eller O. Ett presentkort
 * läses högt över ett bord eller skrivs av från ett papper, och "0" mot "O" är
 * skillnaden mellan att koden fungerar och att gästen tror att den är fejk.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Presentkortskodens längd. 12 tecken ur 32 ger en rymd på 2^60. */
export const GIFT_CARD_CODE_LENGTH = 12;

/**
 * Normaliserar en inskriven presentkortskod.
 *
 * Koden trycks i grupper om fyra för att gå att läsa; gästen skriver av den med
 * eller utan bindestreck, med gemener och med mellanslag. Allt det ska fungera.
 */
export function normalizeGiftCardCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Skriver koden som den trycks: fyra tecken i taget. */
export function formatGiftCardCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join("-");
}

export function isValidGiftCardCode(code: string): boolean {
  if (code.length !== GIFT_CARD_CODE_LENGTH) return false;
  return [...code].every((character) => ALPHABET.includes(character));
}

/**
 * Skapar en kod ur slumptal som anroparen ger.
 *
 * Slumpen kommer utifrån av samma skäl som i `qr.ts`: `@burp/core` får inte
 * bero på någon runtime, och `crypto` ser olika ut i Node, i webbläsaren och i
 * React Native. Anroparen skickar in byten, funktionen gör en kod av dem.
 */
export function giftCardCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < GIFT_CARD_CODE_LENGTH) {
    throw new RangeError(`behöver minst ${GIFT_CARD_CODE_LENGTH} byte, fick ${bytes.length}`);
  }

  let code = "";
  for (let index = 0; index < GIFT_CARD_CODE_LENGTH; index += 1) {
    code += ALPHABET[bytes[index]! % ALPHABET.length];
  }
  return code;
}
