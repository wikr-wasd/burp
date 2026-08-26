/**
 * Restaurangens accentfärg, och frågan om den går att läsa.
 *
 * En restaurang får sätta EN färg. Den bär identitet — band, rubrikdetaljer,
 * märken — men aldrig funktion: handlingsrött är produktens handlingsfärg och
 * primärknappen byter aldrig färg för att någon valt turkos. Se docs/DESIGN.md.
 *
 * Kontrasten räknas här och inte i webbläsaren. `getComputedStyle` svarar
 * `oklch()` i den här kodbasen, och en regex som läser det som RGB ger
 * nonsens — 1,45:1 för vit text på nästan svart. Ur en hexsträng finns ingen
 * sådan tvetydighet, och beräkningen kan testas utan en DOM.
 *
 * **Färgen prövas som BAKGRUND, inte som text.** Det är inte en förenkling
 * utan det enda som går att kräva: 4,5:1 mot vitt kräver en mörk färg, 4,5:1
 * mot mörka lägets yta kräver en ljus, och ingen färg kan vara båda. Ett band
 * i restaurangens färg med automatiskt vald textfärg fungerar i båda lägena
 * och är dessutom hur färgen faktiskt används.
 */

/** Ljusa lägets yta. `--surface` i globals.css. */
export const SURFACE_LIGHT = "#ffffff";

/** Mörka lägets yta. `--surface` under prefers-color-scheme: dark. */
export const SURFACE_DARK = "#1f2937";

/** De två textfärgerna som får ligga PÅ accentfärgen. `--foreground` i båda lägena. */
export const TEXT_ON_ACCENT_LIGHT = "#ffffff";
export const TEXT_ON_ACCENT_DARK = "#111827";

/**
 * WCAG AA för brödtext. Märkestext sätts i löpande storlek, alltså 4,5 och
 * inte 3,0.
 */
export const CONTRAST_AA = 4.5;

/**
 * Minsta skillnad mot ytan under bandet.
 *
 * Ett nästan vitt band försvinner i ljust läge och ett nästan svart i mörkt.
 * Kravet är lågt med flit — det här handlar om att bandet ska SYNAS, inte om
 * att något ska läsas mot ytan.
 */
export const CONTRAST_VISIBLE = 1.5;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Läser `#rrggbb` eller `#rgb` och returnerar en normaliserad sexsiffrig hex i
 * gemener. Returnerar null för allt annat — ett fält som tar emot skräp ska
 * neka, inte gissa.
 */
export function normalizeHex(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(trimmed);
  if (!match) return null;

  const digits = match[1]!;
  if (digits.length === 3) {
    return `#${digits[0]!}${digits[0]!}${digits[1]!}${digits[1]!}${digits[2]!}${digits[2]!}`;
  }
  return `#${digits}`;
}

/** Hex till kanaler 0–255. Kastar hellre än att returnera svart på skräp. */
export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new RangeError(`Ogiltig färg: ${hex}`);

  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

/**
 * Relativ luminans enligt WCAG 2.1.
 *
 * Kanalerna gammakorrigeras var för sig innan de viktas — ögat är känsligast
 * för grönt och nästan blint för blått, och det är därför gult ser ljust ut
 * medan mättat blått ser mörkt ut trots samma "styrka" i en färgväljare.
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);

  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Kontrastkvot mellan två färger, 1 (identiska) till 21 (svart mot vitt). */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}

/** Varför en färg inte duger. `OK` betyder att den gör det. */
export type AccentVerdict = "OK" | "INVALID" | "NO_READABLE_TEXT" | "INVISIBLE";

export interface AccentCheck {
  ok: boolean;
  verdict: AccentVerdict;
  /** Normaliserad färg när strängen gick att läsa, annars null. */
  hex: string | null;
  /** Textfärgen som ska ligga på accenten. Null när ingen av de två duger. */
  textOn: string | null;
  /** Kontrasten den valda textfärgen får mot accenten. */
  textRatio: number;
  /** Hur väl bandet syns mot ljus respektive mörk yta. */
  onLight: number;
  onDark: number;
}

/**
 * Duger färgen som accent?
 *
 * Två krav, båda nödvändiga:
 *
 * 1. **Text på färgen går att läsa.** Vitt eller nästan svart — det som ger
 *    bäst kontrast väljs automatiskt, och når inget av dem 4,5:1 faller
 *    färgen. Det drabbar mellantoner: en medelgrå eller dammig blå bär varken
 *    vit eller svart text, och lösningen är att välja en aning mörkare eller
 *    ljusare, vilket är ett besked en restaurang kan agera på.
 * 2. **Bandet syns mot båda ytorna.** Nästan vitt försvinner i ljust läge,
 *    nästan svart i mörkt.
 *
 * Alla fyra talen returneras även när svaret är ja, så att den som får nej får
 * veta vilket krav som föll och inte bara att färgen "inte gick".
 */
export function checkAccentColor(input: string): AccentCheck {
  const hex = normalizeHex(input);
  if (!hex) {
    return {
      ok: false,
      verdict: "INVALID",
      hex: null,
      textOn: null,
      textRatio: 0,
      onLight: 0,
      onDark: 0,
    };
  }

  const withLightText = contrastRatio(hex, TEXT_ON_ACCENT_LIGHT);
  const withDarkText = contrastRatio(hex, TEXT_ON_ACCENT_DARK);

  const useLightText = withLightText >= withDarkText;
  const textRatio = round1(useLightText ? withLightText : withDarkText);
  const textOn = useLightText ? TEXT_ON_ACCENT_LIGHT : TEXT_ON_ACCENT_DARK;

  const onLight = round1(contrastRatio(hex, SURFACE_LIGHT));
  const onDark = round1(contrastRatio(hex, SURFACE_DARK));

  const readable = textRatio >= CONTRAST_AA;
  const visible = onLight >= CONTRAST_VISIBLE && onDark >= CONTRAST_VISIBLE;

  const verdict: AccentVerdict = !readable
    ? "NO_READABLE_TEXT"
    : !visible
      ? "INVISIBLE"
      : "OK";

  return {
    ok: verdict === "OK",
    verdict,
    hex,
    textOn: readable ? textOn : null,
    textRatio,
    onLight,
    onDark,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
