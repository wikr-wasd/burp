import { CURRENCY_INFO, CURRENCY_LOCALE, type CurrencyCode } from "./country";

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
 * Tolkar ett pris som en restaurangägare skrivit in, i sin egen valuta.
 *
 * Samma jobb som `parseKronor`, men antalet decimaler följer valutan. En
 * serbisk dinar har inga i praktiken: "1200" i ett prisfält i Belgrad betyder
 * 1200 dinarer, alltså 120000 lagrade enheter — inte 12 dinarer. Med den
 * svenska tolkningen hade varje serbiskt menypris blivit hundra gånger för
 * lågt, och felet hade synts först i restaurangens redovisning.
 *
 * Returnerar null vid allt som inte otvetydigt är ett belopp i valutan.
 * Anropande kod ska visa ett fel, aldrig gissa.
 */
export function parseAmount(input: string, currency: CurrencyCode): Ore | null {
  if (typeof input !== "string") return null;

  const { decimalDigits, symbol } = CURRENCY_INFO[currency];

  const cleaned = input
    .trim()
    .replace(/\s| /g, "") // vanliga och hårda mellanslag
    // Symbolen får stå efter beloppet: "12,00 KM", "1.200 дин.".
    .replace(new RegExp(`${escapeRegExp(symbol)}$`, "i"), "")
    .replace(",", ".");

  const pattern =
    decimalDigits > 0
      ? new RegExp(`^-?\\d+(\\.\\d{1,${decimalDigits}})?$`)
      : /^-?\d+$/;

  if (cleaned === "" || !pattern.test(cleaned)) return null;

  return Math.round(Number(cleaned) * ORE_PER_KRONA);
}

/**
 * Formaterar ett belopp som ett redigerbart tal UTAN valutasymbol.
 *
 * Symbolen hör hemma bredvid fältet, inte i det: ett fält som innehåller
 * "12,00 KM" tvingar den som redigerar att markera runt symbolen för att byta
 * siffra.
 */
export function formatAmountInput(amount: Ore, currency: CurrencyCode): string {
  const { decimalDigits } = CURRENCY_INFO[currency];
  return (amount / ORE_PER_KRONA).toFixed(decimalDigits).replace(".", ",");
}

/**
 * Översätter Burps interna belopp till leverantörens minsta enhet.
 *
 * Burp lagrar alltid hundradelar — öre, cent, fening, para — oavsett valuta.
 * Betalleverantörer räknar i stället i valutans FAKTISKA minsta enhet, och för
 * en nolldecimalsvaluta som serbiska dinarer är den hela dinaren. Skickas 1200
 * rakt av till en leverantör som väntar dinarer debiteras gästen 1200 dinarer
 * för en nota på 12.
 *
 * Går beloppet inte jämnt upp kastar funktionen i stället för att avrunda. Ett
 * avrundat belopp är pengar som försvinner tyst mellan notan och debiteringen,
 * och det ska synas som ett fel — inte som en differens i bokföringen tre
 * månader senare.
 */
export function toMinorUnits(amount: Ore, currency: CurrencyCode): number {
  assertOre(amount, "belopp");

  const divisor = 10 ** (2 - CURRENCY_INFO[currency].decimalDigits);
  if (divisor === 1) return amount;

  if (amount % divisor !== 0) {
    throw new RangeError(
      `${amount} går inte att uttrycka i ${currency}:s minsta enhet utan avrundning`,
    );
  }
  return amount / divisor;
}

/** Motsatsen till `toMinorUnits`. Används på svar och webhookar. */
export function fromMinorUnits(value: number, currency: CurrencyCode): Ore {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`beloppet från leverantören måste vara ett heltal, fick: ${String(value)}`);
  }
  return value * 10 ** (2 - CURRENCY_INFO[currency].decimalDigits);
}

/** Escapar reguljäruttryckstecken i en valutasymbol, t.ex. punkten i "дин.". */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
 *
 * Symbolen sätts av oss, inte av `style: "currency"`.
 *
 * Intl:s valutadata skiljer sig mellan körtider: Chrome skrev "BAM 12.00" där
 * Node skrev "12,00 KM" för samma anrop. Med `style: "decimal"` och vår egen
 * symbol blir resultatet identiskt på servern och i webbläsaren — vilket både
 * ger gästen rätt utseende och håller React:s hydrering tyst.
 *
 * Alla fyra valutorna skrivs med symbolen efter beloppet: "12,00 KM",
 * "12,00 €", "1.200 RSD", "149,00 kr".
 */
export function formatMoney(
  amount: Ore,
  currency: CurrencyCode,
  locale?: string,
): string {
  const info = CURRENCY_INFO[currency];

  const number = new Intl.NumberFormat(locale ?? CURRENCY_LOCALE[currency], {
    minimumFractionDigits: info.decimalDigits,
    maximumFractionDigits: info.decimalDigits,
  }).format(amount / ORE_PER_KRONA);

  return `${number} ${info.symbol}`;
}

