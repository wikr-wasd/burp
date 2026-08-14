/**
 * Skydd mot öppen vidarebefordran.
 *
 * Inloggningssidan tar emot `?next=` och skickar användaren dit efteråt.
 * Släpps en absolut URL igenom blir /logga-in en öppen redirect — en länk som
 * ser trovärdig ut just för att den ligger på burp.se, men landar hos någon
 * annan. Klassiskt nätfiskeupplägg, och lätt att återinföra av misstag.
 *
 * Ligger i en egen fil för att gå att testa. Regeln är för lätt att luckra upp
 * för att bo inne i en sidkomponent utan täckning.
 */

/**
 * Returnerar `next` om det är en säker intern sökväg, annars undefined.
 *
 * Bara sökvägar som börjar med ett enda snedstreck accepteras. Allt annat —
 * absoluta URL:er, protokollrelativa `//`, backslash-varianter och kodade
 * former — avvisas.
 */
export function safeNext(next: string | undefined | null): string | undefined {
  if (typeof next !== "string" || next.length === 0) return undefined;

  // Kodade tecken först: `%2f%2fevil.com` blir `//evil.com` efter avkodning,
  // och webbläsaren avkodar innan den navigerar.
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return undefined; // Trasig procentkodning — avvisa hellre än att gissa.
  }

  // Backslash behandlas som snedstreck av flera webbläsare, så `/\evil.com`
  // fungerar som `//evil.com`.
  const normalized = decoded.replace(/\\/g, "/");

  if (!normalized.startsWith("/")) return undefined;
  if (normalized.startsWith("//")) return undefined;

  // Kontrollerar också att strängen inte innehåller ett schema någonstans
  // före första snedstrecket i övrigt — t.ex. "/\thttps://evil.com" efter att
  // whitespace strippats av webbläsaren.
  if (/^\/[\s]*[a-z][a-z0-9+.-]*:/i.test(normalized)) return undefined;

  return normalized;
}
