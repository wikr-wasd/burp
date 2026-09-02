import { CURRENCY_INFO, type CurrencyCode } from "@burp/core";

/**
 * CSV som både Sheets och Excel läser rätt.
 *
 * Byggd här och inte i @burp/core: det här är ett filformat för webbens
 * nedladdningar, inte en affärsregel. Pengarnas form är däremot en affärsregel,
 * och den läses ur `CURRENCY_INFO` — serbiska dinarer har noll decimaler, och
 * en hårdkodad division med 100 hade gjort 1 200 dinarer till 12.
 *
 * Tre val som ser små ut och inte är det:
 *
 * 1. **BOM först.** Utan den läser Excel filen som Windows-1252, och varje
 *    å, ä och ö i en restaurangs meny blir tecknen "Ã¥". Sheets klarar sig
 *    utan, Excel gör det inte, och det är Excel restaurangerna har.
 *
 * 2. **CRLF som radbrytning.** RFC 4180, och det som äldre Excel förväntar sig.
 *
 * 3. **Formler avväpnas.** En cell som börjar med =, +, - eller @ tolkas som
 *    en formel när filen öppnas. En rätt som heter "=SUMMA" är osannolik, men
 *    en cell är restaurangens egen text och ska aldrig kunna köras hos den som
 *    öppnar filen. Talkolumner rörs inte — de skrivs som tal, inte som text.
 */

const RISKY_FIRST_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  const first = value.charAt(0);
  const text = RISKY_FIRST_CHARS.has(first) ? `'${value}` : value;

  const mustQuote =
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    text !== text.trim();

  return mustQuote ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Belopp i valutans minsta enhet → ett tal kalkylarket kan summera. */
export function csvAmount(minorUnits: number, currency: CurrencyCode): string {
  const digits = CURRENCY_INFO[currency].decimalDigits;
  if (digits === 0) return String(minorUnits);

  const factor = 10 ** digits;
  return (minorUnits / factor).toFixed(digits);
}

export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  // Escapen och inte tecknet självt: en osynlig BOM mitt i en källfil går
  // inte att se i en diff, och linten stoppar den med rätta.
  return `\uFEFF${body}\r\n`;
}

/**
 * Ett filnamn som går att hitta igen i nedladdningsmappen.
 *
 * Restaurangens namn kan bära å, mellanslag och citattecken; ett filnamn ska
 * inte bära något av det.
 */
export function csvFilename(parts: readonly string[]): string {
  const slug = parts
    .join("-")
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${slug || "burp"}.csv`;
}

/** Rubriken en nedladdning behöver för att bli en fil och inte en sida text. */
export function csvHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    // En export är alltid färsk. Cachad hade den visat förra veckans siffror.
    "Cache-Control": "no-store",
  };
}
