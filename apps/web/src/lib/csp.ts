/**
 * Content-Security-Policy.
 *
 * En CSP är inte skydd mot XSS — den är skadebegränsningen NÄR en finns. Utan
 * den blir varje injicerad rad JavaScript fullt beväpnad: den kan läsa sidan,
 * ringa vart som helst och skicka vidare. Med `strict-dynamic` och en nonce kan
 * den knappt göra något alls.
 *
 * Burp renderar restaurangernas EGEN text — namn, beskrivningar, omdömen — på
 * publika sidor. Det är precis den ytan en policy finns för.
 *
 * ── Rapportläge först ──────────────────────────────────────────────────────
 *
 * Policyn skickas som `Content-Security-Policy-Report-Only` (se `proxy.ts`).
 * Den blockerar alltså ingenting; den berättar bara vad den skulle ha
 * blockerat. Skälet är att en för snäv CSP inte ger ett felmeddelande utan en
 * sida där något tyst slutar fungera — en karta som inte laddar, en
 * kortbetalning som aldrig öppnar. Listan över ursprung nedan är läst ur
 * koden, men läst är inte samma sak som bevisad.
 *
 * ── Varför två policyer ────────────────────────────────────────────────────
 *
 * En nonce måste vara ny för varje request. Tre rutter är ISR-cachade med
 * `revalidate = 3600` — stadssidan, kökssidan och restaurangsidan — och deras
 * HTML återanvänds i en timme. En nonce i den HTML:en är gammal från andra
 * besökaren och framåt, och skulle blockera Next egna skript.
 *
 * De tre får därför en policy utan nonce. Den är svagare, och det är värt att
 * säga rakt ut: `'unsafe-inline'` betyder att ett injicerat inline-skript får
 * köra. Att just de sidorna bär mest text från restaurangerna gör avvägningen
 * obekväm, och den ska lösas innan policyn slås på på riktigt — antingen
 * genom att sidorna blir dynamiska eller genom hashade skript.
 *
 * Se docs/TODO.md.
 */

/**
 * Rutter under `[locale]` som är `force-dynamic` trots att de ser ut som en
 * stadssida. Utan undantaget hade `/sv/anslut` fått den svagare policyn.
 */
const DYNAMIC_LOCALE_ROUTES = new Set(["anslut", "upptack"]);

/**
 * Är sökvägen en av de tre ISR-cachade sidorna?
 *
 * Matchas på FORM och inte mot en lista, eftersom städerna, köken och
 * restaurangerna kommer ur databasen och tillkommer efter hand:
 *
 *   /sv/sarajevo              stadssidan          revalidate 3600
 *   /sv/sarajevo/grill        stad + kök          revalidate 3600
 *   /sv/r/sarajevo/zeljo      restaurangsidan     revalidate 3600
 *
 * Allt annat renderas per request och kan bära en nonce.
 */
export function isCachedRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const [locale, second] = segments;

  // Språksegmentet är alltid två bokstäver. `/dashboard` och `/t/…` faller här.
  if (!locale || !/^[a-z]{2}$/.test(locale)) return false;
  if (!second) return false;

  if (second === "r") return segments.length === 4;
  if (DYNAMIC_LOCALE_ROUTES.has(second)) return false;

  return segments.length === 2 || segments.length === 3;
}

export interface CspOptions {
  /** Null för de cachade rutterna. Se modulens kommentar. */
  nonce: string | null;
  isDevelopment: boolean;
  /** `NEXT_PUBLIC_SUPABASE_URL`. Bygger både HTTP- och WebSocket-ursprunget. */
  supabaseUrl: string;
  /** `NEXT_PUBLIC_MAP_TILE_URL`. Kartrutorna hämtas därifrån. */
  mapTileUrl: string;
}

/** WebSocket-ursprunget för Supabase Realtime — köksskärmens larm går där. */
function websocketOrigin(httpUrl: string): string {
  try {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.origin;
  } catch {
    return "";
  }
}

/** Bara ursprunget ur en URL med mallvariabler som `{z}/{x}/{y}.png`. */
function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function buildCsp({ nonce, isDevelopment, supabaseUrl, mapTileUrl }: CspOptions): string {
  const supabaseOrigin = originOf(supabaseUrl);
  const supabaseSocket = websocketOrigin(supabaseUrl);
  const tileOrigin = originOf(mapTileUrl);

  /*
   * `'unsafe-eval'` bara i utveckling.
   *
   * React använder eval för att bygga upp serverns felstackar i webbläsaren,
   * och Next bygger om moduler vid varje sparning. Ingetdera sker i
   * produktion, så direktivet hör inte hemma där.
   */
  const script = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`
    : `'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`;

  const directives: string[] = [
    `default-src 'self'`,
    `script-src ${script}`,

    /*
     * Stilar tillåts inline.
     *
     * Next skriver kritisk CSS i dokumentet och Leaflet sätter stilar direkt
     * på kartans element. Att nonce:a dem hade krävt att varje bibliotek
     * kände till vår nonce. En injicerad stil kan störa utseendet men inte
     * exfiltrera — `style-src` är den minst värdefulla stramningen.
     */
    `style-src 'self' 'unsafe-inline'`,

    // Menybilder ur Supabase Storage, kartrutor, och de gradienter
    // platshållaren ritar som data-URI:er.
    `img-src 'self' data: blob: ${supabaseOrigin} https://*.supabase.co ${tileOrigin}`.trim(),

    `font-src 'self' data:`,

    // Supabase REST och Realtime, samt Stripes eget API från kortfältet.
    `connect-src 'self' ${supabaseOrigin} ${supabaseSocket} https://api.stripe.com`.trim(),

    /*
     * Bara Stripes betalfält.
     *
     * `https://www.openstreetmap.org` stod här fram till 2026-08-23, för den
     * inbäddade kartan på restaurangsidan. Kartan ritas numera av Leaflet i
     * vår egen kod och hämtar bara rutor, som täcks av `img-src`. Ett
     * ursprung som ingenting längre använder ska inte stå kvar i en policy —
     * då är policyn en beskrivning av vad appen råkade göra en gång, inte av
     * vad den får göra.
     */
    `frame-src https://js.stripe.com https://hooks.stripe.com`,

    // Samma löfte som `X-Frame-Options: DENY`, men i den moderna formen.
    `frame-ancestors 'none'`,

    `base-uri 'self'`,

    // Formulär får bara posta till oss. Utan den kan en injicerad <form>
    // skicka det gästen skriver till en annan värd.
    `form-action 'self'`,

    `object-src 'none'`,
  ];

  // Ingen uppgradering lokalt — utvecklingsservern kör http och skulle annars
  // få varje egen resurs omskriven till https.
  if (!isDevelopment) directives.push("upgrade-insecure-requests");

  return directives
    .map((directive) => directive.replace(/\s{2,}/g, " ").trim())
    .join("; ");
}
