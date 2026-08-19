/**
 * Rate limiting för QR-endpoints och orderskapande (avsnitt 4.4, 12).
 *
 * ⚠️ DEN HÄR IMPLEMENTATIONEN RÄCKER INTE I PRODUKTION.
 *
 * Räknaren ligger i processminnet. På Vercel betyder det att varje
 * serverlös instans har sin egen räknare, och en angripare som får sina
 * anrop fördelade över tio instanser får tio gånger så många försök.
 * Den nollställs dessutom vid varje kallstart.
 *
 * Innan Fas 2 går live ska den bytas mot en delad räknare —
 * `@upstash/ratelimit` mot Redis är det som används i 123Connect och är det
 * enklaste bytet. Gränssnittet nedan är medvetet detsamma som Upstash
 * `limit()`, så bytet blir en ändring i den här filen och ingen annanstans.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix-millisekunder när fönstret nollställs. */
  reset: number;
}

export interface RateLimitOptions {
  /** Max antal anrop per fönster. */
  limit: number;
  /** Fönstrets längd i sekunder. */
  windowSeconds: number;
}

/** Gränser per skyddad yta. Samlade här så att de går att överblicka. */
export const RATE_LIMITS = {
  /** QR-uppslag. Generöst — en gäst laddar om sidan flera gånger under måltiden. */
  qrLookup: { limit: 30, windowSeconds: 60 },
  /** Orderskapande. Snävt — dubbeltryck fångas av idempotensnyckeln, inte av denna. */
  orderCreate: { limit: 10, windowSeconds: 60 },
  /** Inloggning. */
  auth: { limit: 10, windowSeconds: 60 },
  /**
   * Kupongkoder. Snävast av alla.
   *
   * Endpointen svarar på frågan "gäller den här koden" och är därför en
   * orakelmaskin: utan gräns går det att prova sig igenom kodrymden tills en
   * fungerar. Tio försök i minuten räcker gott för någon som skriver av en kod
   * från en skylt och slår fel ett par gånger.
   */
  couponPreview: { limit: 10, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitOptions>;

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    sweep(now);
    return { success: true, limit: options.limit, remaining: options.limit - 1, reset: now + windowMs };
  }

  existing.count += 1;

  return {
    success: existing.count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - existing.count),
    reset: existing.resetAt,
  };
}

/**
 * Läser klientens IP ur proxy-headers.
 *
 * Vercel sätter `x-forwarded-for` och kan inte förfalskas av klienten bakom
 * deras proxy. Kör appen någon annanstans måste headern valideras separat —
 * annars kan vem som helst sätta sin egen "IP" och kringgå gränsen.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}

/** Slänger utgångna hinkar så att kartan inte växer obegränsat. */
function sweep(now: number): void {
  if (buckets.size < 10_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
