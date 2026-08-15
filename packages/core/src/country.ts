/**
 * Länder, valutor och momssatser.
 *
 * Burp startade som en svensk produkt och hade Sverige inbakat på ett dussin
 * ställen: SEK i prisformateringen, 12 och 25 procent moms, tio siffror i
 * organisationsnumret. Marknaden är nu Bosnien, Serbien och Kroatien, och de
 * har tre olika valutor och tre olika momssystem.
 *
 * Allt landsspecifikt samlas här. En restaurang bär sitt land, och landet
 * avgör resten — i stället för att varje formulär och beräkning bär sitt eget
 * antagande om var i världen den körs.
 */

export const COUNTRIES = ["BA", "HR", "RS", "SE"] as const;
export type CountryCode = (typeof COUNTRIES)[number];

export const CURRENCIES = ["BAM", "EUR", "RSD", "SEK"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  /**
   * Antal decimaler i presentationen.
   *
   * Lagringen sker ALLTID i hundradelar oavsett detta — en serbisk dinar
   * lagras som 100 enheter precis som en euro lagras som 100 cent. Skillnaden
   * är bara hur beloppet visas: para har i praktiken slutat användas, och
   * "1 234 RSD" är vad en gäst i Belgrad förväntar sig se, inte "1 234,00".
   */
  decimalDigits: number;
  symbol: string;
}

export const CURRENCY_INFO: Record<CurrencyCode, CurrencyInfo> = {
  BAM: { code: "BAM", decimalDigits: 2, symbol: "KM" },
  EUR: { code: "EUR", decimalDigits: 2, symbol: "€" },
  RSD: { code: "RSD", decimalDigits: 0, symbol: "дин." },
  SEK: { code: "SEK", decimalDigits: 2, symbol: "kr" },
};

export interface CountryInfo {
  code: CountryCode;
  /** Namn på engelska. Visningsnamn i gränssnittet översätts separat. */
  name: string;
  currency: CurrencyCode;
  /** IANA-tidszon. Alla fyra ligger i CET/CEST, men det ska inte antas. */
  timeZone: string;
  /** Locale för tal- och datumformatering. */
  locale: string;
  /**
   * Momssatser i baspunkter.
   *
   * `reduced` gäller mat och `standard` alkohol och allt annat. Bosnien har en
   * enda sats på 17 procent — därför är de två lika där, inte för att det är
   * ett misstag.
   */
  vat: { reduced: number; standard: number };
  /** Reguljäruttryck för organisationsnummer, utan formateringstecken. */
  orgNumberPattern: RegExp;
  /** Vad numret heter lokalt, så att formuläret kan säga rätt sak. */
  orgNumberLabel: string;
  postalCodePattern: RegExp;
  phonePrefix: string;
}

export const COUNTRY_INFO: Record<CountryCode, CountryInfo> = {
  BA: {
    code: "BA",
    name: "Bosnia and Herzegovina",
    currency: "BAM",
    timeZone: "Europe/Sarajevo",
    locale: "bs-BA",
    // En enda momssats på 17 procent. Ingen reducerad sats för livsmedel.
    vat: { reduced: 1700, standard: 1700 },
    orgNumberPattern: /^\d{13}$/,
    orgNumberLabel: "JIB",
    postalCodePattern: /^\d{5}$/,
    phonePrefix: "+387",
  },
  HR: {
    code: "HR",
    name: "Croatia",
    currency: "EUR",
    timeZone: "Europe/Zagreb",
    locale: "hr-HR",
    vat: { reduced: 1300, standard: 2500 },
    orgNumberPattern: /^\d{11}$/,
    orgNumberLabel: "OIB",
    postalCodePattern: /^\d{5}$/,
    phonePrefix: "+385",
  },
  RS: {
    code: "RS",
    name: "Serbia",
    currency: "RSD",
    timeZone: "Europe/Belgrade",
    locale: "sr-RS",
    vat: { reduced: 1000, standard: 2000 },
    orgNumberPattern: /^\d{9}$/,
    orgNumberLabel: "PIB",
    postalCodePattern: /^\d{5,6}$/,
    phonePrefix: "+381",
  },
  SE: {
    code: "SE",
    name: "Sweden",
    currency: "SEK",
    timeZone: "Europe/Stockholm",
    locale: "sv-SE",
    vat: { reduced: 1200, standard: 2500 },
    orgNumberPattern: /^\d{10}$/,
    orgNumberLabel: "Organisationsnummer",
    postalCodePattern: /^\d{5}$/,
    phonePrefix: "+46",
  },
};

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && (COUNTRIES as readonly string[]).includes(value);
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/**
 * Momssatser en restaurang i landet får välja mellan.
 *
 * Listan är kort med flit. Ett fritt fält gör en felskrivning till en
 * momsavvikelse, och den upptäcks först i bokföringen.
 */
export function allowedVatRates(country: CountryCode): number[] {
  const { reduced, standard } = COUNTRY_INFO[country].vat;
  return reduced === standard ? [reduced] : [reduced, standard];
}

export function isAllowedVatRate(country: CountryCode, bps: number): boolean {
  return allowedVatRates(country).includes(bps);
}

/**
 * Normaliserar ett organisationsnummer: tar bort mellanslag och bindestreck.
 * Returnerar null om det inte matchar landets format.
 */
export function normalizeOrgNumber(country: CountryCode, input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, "");
  return COUNTRY_INFO[country].orgNumberPattern.test(cleaned) ? cleaned : null;
}

export function normalizePostalCode(country: CountryCode, input: string): string | null {
  const cleaned = input.replace(/\s/g, "");
  return COUNTRY_INFO[country].postalCodePattern.test(cleaned) ? cleaned : null;
}
