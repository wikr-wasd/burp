/**
 * QR-token för bordsbeställning (avsnitt 4.1).
 *
 * Ett bord får en STATISK kod som trycks på en dekal och aldrig byts:
 *
 *     https://burp.se/t/R7K2M9X4TB
 *
 * Tokenet består av två delar:
 *   - 6 slumpade tecken  — bordets publika id, slås upp i `tables.qr_token`
 *   - 4 signaturtecken   — HMAC-SHA256 över de sex första, trunkerad
 *
 * URL:en innehåller varken restaurang-id eller bordsnummer. Ingen kan räkna ut
 * grannbordets kod eller en annan restaurangs koder.
 *
 * Signaturen gör att servern kan avvisa påhittade koder UTAN databasslagning.
 * Det är skillnaden mellan att en bot kostar oss en CPU-cykel och att den
 * kostar oss en databasfråga per försök.
 *
 * Implementationen använder Web Crypto (`globalThis.crypto.subtle`) så att den
 * fungerar likadant i Node, i Edge-runtime och i React Native.
 */

/**
 * Crockford Base32 utan I, L, O och U.
 *
 * Tecknen är borta för att koden ska kunna läsas upp i telefon och skrivas in
 * för hand när kameran krånglar: I/1, O/0 och L/1 förväxlas, och U undviks för
 * att inte råka bilda olämpliga ord.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const PUBLIC_ID_LENGTH = 6;
export const SIGNATURE_LENGTH = 4;
export const TOKEN_LENGTH = PUBLIC_ID_LENGTH + SIGNATURE_LENGTH;

/**
 * 32^6 ≈ 1,07 miljarder kombinationer. Med signaturen ovanpå (32^4 ≈ 1 miljon)
 * krävs i snitt ~500 000 gissningar per giltig kod — och rate limit på
 * /t/[token] gör den kostnaden ohållbar.
 */
export const PUBLIC_ID_KEYSPACE = ALPHABET.length ** PUBLIC_ID_LENGTH;

export interface ParsedToken {
  publicId: string;
  signature: string;
}

/** Slumpar ett nytt publikt bords-id. Kryptografiskt säker källa. */
export function generatePublicId(): string {
  const bytes = new Uint8Array(PUBLIC_ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);

  let id = "";
  for (const byte of bytes) {
    // Modulo över 256 mot 32 tecken är exakt jämnt delbart (256 = 8 × 32),
    // så det uppstår ingen snedfördelning.
    id += ALPHABET[byte % ALPHABET.length];
  }
  return id;
}

/** Skapar ett komplett, signerat token för ett nytt bord. */
export async function generateTableToken(secret: string): Promise<string> {
  return signTableToken(generatePublicId(), secret);
}

/**
 * Signerar ett BEFINTLIGT publikt bords-id.
 *
 * Behövs varje gång en QR-kod ska skrivas ut igen: signaturen lagras aldrig i
 * databasen utan räknas fram ur nyckeln vid behov. Det är också därför ett
 * byte av QR_TOKEN_SECRET tar alla utskrivna dekaler med sig.
 */
export async function signTableToken(publicId: string, secret: string): Promise<string> {
  const normalized = publicId.toUpperCase();

  if (normalized.length !== PUBLIC_ID_LENGTH) {
    throw new RangeError(
      `Publikt bords-id ska vara ${PUBLIC_ID_LENGTH} tecken, fick ${normalized.length}.`,
    );
  }
  for (const char of normalized) {
    if (!ALPHABET.includes(char)) {
      throw new RangeError(`Ogiltigt tecken i publikt bords-id: ${char}`);
    }
  }

  return normalized + (await sign(normalized, secret));
}

/** Delar upp ett token i sina två delar. Returnerar null vid fel form. */
export function parseToken(token: string): ParsedToken | null {
  if (typeof token !== "string" || token.length !== TOKEN_LENGTH) return null;

  const normalized = token.toUpperCase();
  for (const char of normalized) {
    if (!ALPHABET.includes(char)) return null;
  }

  return {
    publicId: normalized.slice(0, PUBLIC_ID_LENGTH),
    signature: normalized.slice(PUBLIC_ID_LENGTH),
  };
}

/**
 * Verifierar ett token och returnerar bordets publika id.
 *
 * Ett `null`-svar betyder "slå inte upp det här i databasen". Anropa alltid
 * denna funktion INNAN någon databasfråga görs.
 */
export async function verifyTableToken(token: string, secret: string): Promise<string | null> {
  const parsed = parseToken(token);
  if (!parsed) return null;

  const expected = await sign(parsed.publicId, secret);
  return timingSafeEqual(expected, parsed.signature) ? parsed.publicId : null;
}

/** Bygger den fullständiga QR-URL:en som trycks på dekalen. */
export function tableQrUrl(token: string, siteUrl: string): string {
  return new URL(`/t/${token}`, siteUrl).toString();
}

async function sign(publicId: string, secret: string): Promise<string> {
  if (!secret) {
    throw new Error(
      "QR_TOKEN_SECRET saknas. Utan den kan bordstokens varken skapas eller verifieras.",
    );
  }

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const mac = new Uint8Array(
    await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(publicId)),
  );

  let signature = "";
  for (let i = 0; i < SIGNATURE_LENGTH; i++) {
    signature += ALPHABET[mac[i]! % ALPHABET.length];
  }
  return signature;
}

/**
 * Jämförelse i konstant tid.
 *
 * En vanlig `===` avbryter vid första felaktiga tecknet. Skillnaden i svarstid
 * är mätbar och låter en angripare gissa signaturen tecken för tecken i stället
 * för att behöva träffa hela på en gång.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
