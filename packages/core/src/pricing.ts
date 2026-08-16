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
 * Vad en rätt kan kosta, innan gästen valt något.
 *
 * Menykortet visar ett pris. Har rätten en obligatorisk storleksgrupp är
 * styckpriset inte det priset — gästen betalar alltid minst styckpriset plus
 * det billigaste obligatoriska valet. Att skriva ut styckpriset rakt av är då
 * en siffra ingen kan få, och det är exakt den sortens pris en gäst känner sig
 * lurad av när notan kommer.
 *
 * Därför ett intervall: `fromOre` är lägsta möjliga pris för en giltig rad,
 * `toOre` det högsta. Är de lika är priset exakt och ska skrivas utan "Från".
 *
 * Ligger här och inte i komponenten av samma skäl som allt annat prisarbete
 * (avsnitt 3): en prisregel som duplicerats i en vy hinner glida isär från
 * servern innan någon märker det.
 */
export interface OptionGroupPricing {
  minSelect: number;
  maxSelect: number;
  options: readonly { priceOre: Ore; isAvailable: boolean }[];
}

export interface ItemPriceRange {
  /** Lägsta pris en giltig rad kan få. */
  fromOre: Ore;
  /** Högsta pris en giltig rad kan få. Lika med `fromOre` när priset är fast. */
  toOre: Ore;
}

export function itemPriceRange(
  unitPriceOre: Ore,
  groups: readonly OptionGroupPricing[],
): ItemPriceRange {
  assertOre(unitPriceOre, "styckpris");

  let fromOre = unitPriceOre;
  let toOre = unitPriceOre;

  for (const group of groups) {
    // Slutsålda tillval kan inte väljas och ska varken höja eller sänka
    // intervallet. Servern avvisar dem ändå (`OPTION_UNAVAILABLE`).
    const prices = group.options
      .filter((option) => option.isAvailable)
      .map((option) => option.priceOre);

    for (const price of prices) assertOre(price, "tillvalspris");

    // En grupp kan kräva fler val än den har kvar i lager. Då gäller det som
    // faktiskt går att välja — annars skulle intervallet räkna med tillval
    // som inte finns.
    const required = Math.min(Math.max(0, group.minSelect), prices.length);
    const ceiling = Math.min(Math.max(group.maxSelect, required), prices.length);

    const cheapestFirst = [...prices].sort((a, b) => a - b);
    fromOre += sumOre(cheapestFirst.slice(0, required));

    const dearestFirst = [...prices].sort((a, b) => b - a);
    // De obligatoriska valen måste tas även när de sänker priset. Därutöver
    // tas bara det som höjer det — ingen gäst väljer frivilligt ett avdrag för
    // att nå maxpriset.
    let groupMax = sumOre(dearestFirst.slice(0, required));
    for (const price of dearestFirst.slice(required, ceiling)) {
      if (price <= 0) break;
      groupMax += price;
    }
    toOre += groupMax;
  }

  return { fromOre, toOre };
}

/**
 * Räknar Burps avgift.
 *
 * Underlaget är beslutat (öppen fråga 1, besvarad 2026-08-16): 3,4 % av
 * ordersumman inklusive moms och utan dricks, alltså `GROSS_ITEMS`.
 *
 * `base` är ändå ett argument och inte en konstant. Varje `fees`-rad i
 * databasen sparar bas, procentsats OCH belopp, så att en framtida ändring av
 * modellen inte skriver om historiken — en order från i fjol ska fortsätta
 * visa vad som faktiskt togs ut då. En hårdkodad bas hade gjort den garantin
 * omöjlig att hålla.
 *
 * Betalleverantörens kortavgift ingår INTE, och det är nu ett beslut och inte
 * en lucka: 3,4 % är Burps nettomarginal och restaurangen bär leverantörens
 * avgift ovanpå. Den registreras i `fees.provider_fee_ore` när en leverantör
 * valts (öppen fråga 5) — som restaurangens kostnad, inte som avdrag härifrån.
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
