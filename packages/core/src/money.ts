/**
 * Pengar i Burp lagras och räknas ALLTID i heltal öre. Aldrig float.
 *
 * 149,50 kr → 14950. Anledningen är att flyttal inte kan representera
 * decimaltal exakt: 0.1 + 0.2 !== 0.3. På en avgift som räknas per order
 * och summeras per utbetalning blir det verkliga kronor i differens.
 *
 * Konvertera till kronor först vid presentation, aldrig i mellanled.
 */

/** Ett belopp i öre. Alltid heltal, kan vara negativt (rabatt, återbetalning). */
export type Ore = number;

export const ORE_PER_KRONA = 100;

export function isValidOre(value: unknown): value is Ore {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Kastar om beloppet inte är ett giltigt heltal öre. */
export function assertOre(value: unknown, label = "belopp"): asserts value is Ore {
  if (!isValidOre(value)) {
    throw new TypeError(`${label} måste vara ett heltal i öre, fick: ${String(value)}`);
  }
}

export function kronorToOre(kronor: number): Ore {
  return Math.round(kronor * ORE_PER_KRONA);
}

export function oreToKronor(ore: Ore): number {
  return ore / ORE_PER_KRONA;
}

/**
 * Bankers rounding (round-half-to-even).
 *
 * Vanlig avrundning (round-half-up) drar systematiskt uppåt. På momsberäkning
 * över tiotusentals orderrader blir det en märkbar skevhet i restaurangens
 * favör eller nackdel. Half-to-even fördelar felet jämnt.
 */
export function roundHalfEven(value: number): Ore {
  const floor = Math.floor(value);
  const diff = value - floor;

  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  // Exakt .5 → runda till jämnt tal
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Summerar en lista belopp. Tom lista ger 0. */
export function sumOre(amounts: readonly Ore[]): Ore {
  let total = 0;
  for (const amount of amounts) {
    assertOre(amount, "delbelopp");
    total += amount;
  }
  return total;
}

/**
 * Andel av ett belopp uttryckt i baspunkter (1 bps = 0,01 %).
 * 340 bps = 3,40 %. Baspunkter används för att slippa decimaler i konfiguration.
 */
export function applyBasisPoints(amount: Ore, bps: number): Ore {
  assertOre(amount, "underlag");
  if (!Number.isInteger(bps) || bps < 0) {
    throw new RangeError(`baspunkter måste vara ett icke-negativt heltal, fick: ${bps}`);
  }
  return roundHalfEven((amount * bps) / 10_000);
}

/** Formaterar öre som svensk valutasträng, t.ex. "149,50 kr". */
export function formatOre(ore: Ore, locale = "sv-SE"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: 2,
  }).format(oreToKronor(ore));
}
