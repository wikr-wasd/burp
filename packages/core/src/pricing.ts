import { applyBasisPoints, assertOre, roundHalfEven, sumOre, type Ore } from "./money";
import type { FeeBase, FeeBreakdown, LineTotal, OrderTotals, PricedLine } from "./types";

/**
 * Prisberäkning. Detta är den enda platsen där en ordersumma får räknas fram.
 *
 * Webben, appen och API:t importerar samma funktion så att alla tre kommer till
 * samma krona. Klienten får ALDRIG skicka in ett färdigt pris — servern räknar
 * om från menyns priser och avvisar ordern om klientens summa avviker
 * (avsnitt 12). Se `assertClientTotalMatches`.
 */

export interface CalculateTotalsInput {
  lines: readonly PricedLine[];
  deliveryFeeOre?: Ore;
  /** Anges som positivt belopp; lagras och returneras negativt. */
  discountOre?: Ore;
  tipOre?: Ore;
}

/**
 * Bryter ut momsen ur ett bruttopris.
 *
 * netto = brutto × 10000 / (10000 + sats), moms = brutto − netto.
 * Momsen räknas ur bruttot i stället för att läggas på ett netto, eftersom
 * bruttopriset är det gästen ser och det som måste stämma exakt.
 */
export function vatFromGross(grossOre: Ore, vatRateBps: number): { netOre: Ore; vatOre: Ore } {
  assertOre(grossOre, "bruttobelopp");
  if (!Number.isInteger(vatRateBps) || vatRateBps < 0) {
    throw new RangeError(`momssats måste vara ett icke-negativt heltal i baspunkter, fick: ${vatRateBps}`);
  }
  const netOre = roundHalfEven((grossOre * 10_000) / (10_000 + vatRateBps));
  return { netOre, vatOre: grossOre - netOre };
}

/** Summan för en rad: (styckpris + tillval) × antal, med moms utbruten. */
export function calculateLine(line: PricedLine): LineTotal {
  assertOre(line.unitPriceOre, `styckpris för ${line.name}`);
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new RangeError(`antal måste vara ett positivt heltal, fick: ${line.quantity}`);
  }

  const optionsOre = sumOre(line.options.map((option) => option.priceOre));
  const unitWithOptions = line.unitPriceOre + optionsOre;

  if (unitWithOptions < 0) {
    throw new RangeError(`raden "${line.name}" får ett negativt pris efter tillval`);
  }

  const grossOre = unitWithOptions * line.quantity;
  const { netOre, vatOre } = vatFromGross(grossOre, line.vatRateBps);

  return {
    menuItemId: line.menuItemId,
    grossOre,
    vatOre,
    netOre,
    vatRateBps: line.vatRateBps,
  };
}

/**
 * Räknar fram hela ordersumman.
 *
 * Momsen redovisas per sats (`vatByRate`) eftersom en order kan blanda 12 %
 * mat och 25 % alkohol, och bokföringen behöver dem åtskilda.
 */
export function calculateOrderTotals(input: CalculateTotalsInput): OrderTotals {
  const lines = input.lines.map(calculateLine);

  const deliveryFeeOre = input.deliveryFeeOre ?? 0;
  const tipOre = input.tipOre ?? 0;
  const rawDiscount = input.discountOre ?? 0;

  assertOre(deliveryFeeOre, "leveransavgift");
  assertOre(tipOre, "dricks");
  assertOre(rawDiscount, "rabatt");

  if (deliveryFeeOre < 0) throw new RangeError("leveransavgift kan inte vara negativ");
  if (tipOre < 0) throw new RangeError("dricks kan inte vara negativ");

  const itemsGrossOre = sumOre(lines.map((line) => line.grossOre));

  // Rabatt lagras negativt och kan aldrig göra ordern negativ.
  const discountOre = -Math.min(Math.abs(rawDiscount), itemsGrossOre + deliveryFeeOre);

  const vatByRate: Record<number, Ore> = {};
  for (const line of lines) {
    vatByRate[line.vatRateBps] = (vatByRate[line.vatRateBps] ?? 0) + line.vatOre;
  }

  const itemsVatOre = sumOre(lines.map((line) => line.vatOre));
  const itemsNetOre = itemsGrossOre - itemsVatOre;

  return {
    lines,
    itemsGrossOre,
    vatByRate,
    itemsVatOre,
    itemsNetOre,
    deliveryFeeOre,
    discountOre,
    tipOre,
    totalOre: itemsGrossOre + deliveryFeeOre + discountOre + tipOre,
  };
}

/**
 * Räknar Burps avgift.
 *
 * Underlaget styrs av `base` eftersom det inte är beslutat vad 3,4 % ska räknas
 * på (öppen fråga 1). Varje `fees`-rad i databasen sparar bas, procentsats och
 * belopp — då kan modellen ändras utan att historiken skrivs om.
 *
 * OBS: betalleverantörens kortavgift ingår INTE. Om 3,4 % ska vara Burps
 * nettomarginal måste kortavgiften dras här; om den ligger ovanpå ska den inte.
 * Frågan är obesvarad, så funktionen gör inget antagande.
 */
export function calculateFee(totals: OrderTotals, base: FeeBase, bps: number): FeeBreakdown {
  const baseAmountOre = feeBaseAmount(totals, base);
  const feeOre = applyBasisPoints(baseAmountOre, bps);

  // Dricks passerar restaurangen orörd — avgiften får aldrig äta av den.
  const restaurantRevenueOre = totals.totalOre - totals.tipOre;

  return {
    base,
    baseAmountOre,
    bps,
    feeOre,
    restaurantPayoutOre: restaurantRevenueOre - feeOre,
  };
}

function feeBaseAmount(totals: OrderTotals, base: FeeBase): Ore {
  // Rabatten dras från underlaget: restaurangen ska inte betala avgift på
  // pengar den aldrig fick in.
  const discountedItems = Math.max(0, totals.itemsGrossOre + totals.discountOre);

  switch (base) {
    case "GROSS_ITEMS":
      return discountedItems;
    case "NET_ITEMS": {
      const { netOre } = vatFromGross(discountedItems, weightedVatRateBps(totals));
      return netOre;
    }
    case "GROSS_TOTAL":
      return discountedItems + totals.deliveryFeeOre;
  }
}

/**
 * Viktad momssats över ordern, i baspunkter. Behövs bara för `NET_ITEMS` när
 * ordern blandar 12 % och 25 %. Returnerar 0 för en tom order.
 */
function weightedVatRateBps(totals: OrderTotals): number {
  if (totals.itemsNetOre === 0) return 0;
  return Math.round((totals.itemsVatOre / totals.itemsNetOre) * 10_000);
}

/**
 * Serverside-kontroll mot manipulerade priser (avsnitt 12).
 *
 * Klienten skickar med vad den tror att ordern kostar. Servern räknar om från
 * menyn och jämför. Vid avvikelse avbryts ordern — den justeras inte tyst,
 * eftersom en avvikelse antingen är ett angrepp eller en bugg och båda ska synas.
 */
export function assertClientTotalMatches(serverTotals: OrderTotals, clientTotalOre: unknown): void {
  assertOre(clientTotalOre, "klientens totalsumma");
  if (clientTotalOre !== serverTotals.totalOre) {
    throw new PriceMismatchError(serverTotals.totalOre, clientTotalOre);
  }
}

export class PriceMismatchError extends Error {
  override readonly name = "PriceMismatchError";
  constructor(
    readonly expectedOre: Ore,
    readonly receivedOre: Ore,
  ) {
    super(`Priset stämmer inte. Servern räknade ${expectedOre} öre, klienten skickade ${receivedOre} öre.`);
  }
}
