/**
 * Tar bort det som är en NYCKEL ur adresser innan de lämnar servern.
 *
 * ── Varför den här modulen måste finnas före Sentry ─────────────────────────
 *
 * Burp lägger hemligheter i sökvägen. Det är medvetet och rätt på båda
 * ställena, men det gör felrapportering farlig:
 *
 *   /t/<token>            Bordets HMAC-signerade token. Den som har den kan
 *                         beställa vid bordet. Den trycks på en dekal och
 *                         byts aldrig — QR_TOKEN_SECRET rörs inte i produktion.
 *   /order/<orderId>      Kvittots åtkomst. Id:t ÄR nyckeln: en anonym
 *                         avhämtningsgäst bevisar åtkomst med ett slumpat
 *                         UUID. Se "Kvittots åtkomst går inte att återkalla"
 *                         i docs/TODO.md.
 *   /bokning/<id>         Samma modell för bordsbokningen.
 *   /personal/inbjudan/<token>   Inbjudan till personalkontot.
 *
 * En felrapport bär `request.url`. Utan den här skrubbningen hade varje
 * 500:a på en QR-sida skickat ett fungerande bordstoken till en tredje part —
 * och Sentry-fel går ofta vidare till en inkorg, en Slack-kanal och en
 * skärmdump. Det är inte ett teoretiskt läckage.
 *
 * ── Varför inte bara stänga av `sendDefaultPii` ────────────────────────────
 *
 * Det gör vi också, och det räcker inte. `sendDefaultPii: false` tar bort
 * cookies, IP och headers — men INTE adressen. Adressen är hela poängen med
 * en felrapport, och det är just den som bär nycklarna här.
 *
 * ── Ersätt, radera inte ────────────────────────────────────────────────────
 *
 * Segmentet byts mot `<dolt>` i stället för att tas bort. En rapport som
 * säger `/t/<dolt>` går fortfarande att gruppera på och läsa som "ett fel på
 * QR-sidan". En som säger `/t/` ser ut som en trasig rutt.
 */

/**
 * Rutter vars sista segment är en nyckel, och hur djupt nyckeln ligger.
 *
 * Prefixet matchas mot segmenten och inte mot strängen: `/t/` som
 * `startsWith` hade också träffat en framtida `/taxi/…`. `index` är vilket
 * segment som ska döljas, räknat från noll efter ett eventuellt språkprefix.
 */
const SECRET_PATHS: readonly { prefix: readonly string[]; index: number }[] = [
  // /t/<token> och /t/<token>/order/<orderId> — båda segmenten är nycklar.
  { prefix: ["t"], index: 1 },
  { prefix: ["order"], index: 1 },
  { prefix: ["bokning"], index: 1 },
  { prefix: ["personal", "inbjudan"], index: 2 },
];

/** Frågeparametrar som aldrig får följa med. */
const SECRET_PARAMS = new Set([
  "token",
  "code",
  "access_token",
  "refresh_token",
  "kod",
  "presentkort",
  "kupong",
]);

const HIDDEN = "<dolt>";

/**
 * Rensar en sökväg och dess frågesträng.
 *
 * Tar emot allt från en hel URL till en naken sökväg — felrapporter bär båda
 * formerna beroende på var i stacken de fångas. Värdnamnet behålls; det är
 * inte hemligt och gör rapporten läsbar.
 */
export function scrubUrl(input: string): string {
  if (!input) return input;

  let origin = "";
  let rest = input;

  const schemeEnd = input.indexOf("://");
  if (schemeEnd !== -1) {
    const pathStart = input.indexOf("/", schemeEnd + 3);
    if (pathStart === -1) return input;
    origin = input.slice(0, pathStart);
    rest = input.slice(pathStart);
  }

  const hashAt = rest.indexOf("#");
  const hash = hashAt === -1 ? "" : rest.slice(hashAt);
  if (hashAt !== -1) rest = rest.slice(0, hashAt);

  const queryAt = rest.indexOf("?");
  const path = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const query = queryAt === -1 ? "" : rest.slice(queryAt + 1);

  return origin + scrubPath(path) + scrubQuery(query) + hash;
}

/** Bara sökvägen. Exporterad för att kunna prövas ensam. */
export function scrubPath(path: string): string {
  const leading = path.startsWith("/");
  const segments = path.split("/").filter((segment) => segment !== "");

  /*
   * Språkprefixet hoppas över.
   *
   * `/sv/…` och `/t/…` ser likadana ut för en enkel matchning — båda börjar
   * med ett kort segment. Adresserna som bär nycklar ligger dock ALLTID
   * utanför språksegmentet (se `isCachedRoute` i lib/csp.ts för samma
   * uppdelning), så ett tvåbokstavigt första segment får hoppas över en gång.
   */
  const offset = segments[0] !== undefined && /^[a-z]{2}$/.test(segments[0]) ? 1 : 0;

  for (const rule of SECRET_PATHS) {
    const matches = rule.prefix.every((part, i) => segments[offset + i] === part);
    const target = offset + rule.index;

    if (matches && segments[target] !== undefined) {
      segments[target] = HIDDEN;
    }
  }

  /*
   * Bordets kvittosida: /t/<token>/order/<orderId>. Två nycklar i samma
   * adress, och regeln ovan döljer bara den första.
   */
  if (segments[offset] === "t" && segments[offset + 2] === "order" && segments[offset + 3]) {
    segments[offset + 3] = HIDDEN;
  }

  const joined = segments.join("/");
  return (leading ? "/" : "") + joined;
}

/** Frågesträngen, med de känsliga värdena utbytta. */
export function scrubQuery(query: string): string {
  if (!query) return "";

  const parts = query.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    if (eq === -1) return pair;

    const key = pair.slice(0, eq);
    return SECRET_PARAMS.has(key.toLowerCase()) ? `${key}=${HIDDEN}` : pair;
  });

  return "?" + parts.join("&");
}
