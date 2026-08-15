import { CURRENCY_INFO, type CurrencyCode } from "./country";

/**
 * Pengar i Burp lagras och räknas ALLTID i heltal av valutans minsta enhet —
 * öre, cent, fening, para. Aldrig float.
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

/**
 * Tolkar ett pris som en människa skrivit in.
 *
 * Restaurangen skriver "149,50" i dashboarden — svenskt decimalkomma, ibland
 * med mellanslag som tusentalsavgränsare och ibland med "kr" efter. Att låta
 * `Number()` tolka det ger NaN på komma och tyst fel pris på "1 495".
 *
 * Returnerar null vid allt som inte otvetydigt är ett belopp. Anropande kod
 * ska visa ett fel, aldrig gissa — ett felgissat menypris debiteras gäster.
 */
export function parseKronor(input: string): Ore | null {
  if (typeof input !== "string") return null;

  const cleaned = input
    .trim()
    .replace(/\s| /g, "") // vanliga och hårda mellanslag
    .replace(/kr$/i, "")
    .replace(",", ".");

  if (cleaned === "" || !/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  return kronorToOre(Number(cleaned));
}

/** Formaterar öre som ett redigerbart tal utan valuta: 14950 → "149,50". */
export function formatKronorInput(ore: Ore): string {
  return oreToKronor(ore).toFixed(2).replace(".", ",");
}

/**
 * Formaterar ett belopp i sin valuta.
 *
 * Beloppet lagras alltid som heltal i valutans hundradelar — öre, cent,
 * fening, para. Det som skiljer valutorna åt är hur många decimaler som visas:
 * dinar visas utan, eftersom para i praktiken slutat användas.
 *
 * Valutan kommer från restaurangen, inte från gästens webbläsare. En gäst med
 * svensk telefon som beställer i Zagreb ska se euro, inte kronor.
 */
export function formatMoney(
  amount: Ore,
  currency: CurrencyCode,
  locale?: string,
): string {
  const info = CURRENCY_INFO[currency];

  return new Intl.NumberFormat(locale ?? "en-150", {
    style: "currency",
    currency,
    minimumFractionDigits: info.decimalDigits,
    maximumFractionDigits: info.decimalDigits,
  }).format(amount / 100);
}

/**
 * Formaterar i svenska kronor.
 *
 * Kvar för de ytor som ännu inte fått en valuta att formatera med. Nya anrop
 * ska använda `formatMoney` — den här försvinner när sista SEK-antagandet är
 * borta ur gränssnittet.
 *
 * @deprecated Använd formatMoney med restaurangens valuta.
 */
export function formatOre(ore: Ore, locale = "sv-SE"): string {
  return formatMoney(ore, "SEK", locale);
}
