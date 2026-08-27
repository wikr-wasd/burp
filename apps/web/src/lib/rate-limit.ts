/**
 * Rate limiting för QR-endpoints och orderskapande (avsnitt 4.4, 12).
 *
 * Räknaren är DELAD och ligger i databasen (migration 0034). Det är hela
 * poängen: på Vercel har varje serverlös instans sitt eget minne, så en
 * räknare i processen betyder att en angripare vars anrop fördelas över tio
 * instanser får tio gånger så många försök — och att gränsen nollställs vid
 * varje kallstart. Gränsen fanns alltså på papperet.
 *
 * Planen var Upstash Redis. Postgres gör samma sak och finns redan: ingen ny
 * leverantör, ingen ny hemlighet, och det går att testa nu.
 *
 * `memoryRateLimit` nedan är kvar som reserv. Svarar databasen inte ska ett
 * QR-uppslag inte falla — men gränsen ska inte heller försvinna, och en räknare
 * per instans är bättre än ingen alls.
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
  /**
   * Presentkortskoder. Samma skäl som kupongerna, fast ett värdepapper.
   *
   * Kodrymden är 2^60 och gör gissning meningslös redan i sig, men en gräns
   * kostar ingenting och gör frågan omöjlig att ställa i skala.
   */
  giftCardPreview: { limit: 10, windowSeconds: 60 },
  /**
   * Bordsbokning.
   *
   * Snävare än orderskapandet. En order kostar gästen pengar och begränsar sig
   * själv; en bokning kostar ingenting och kan därför användas för att lägga
   * beslag på en hel kväll. Fem i minuten räcker för den som bokar åt en
   * familj och provar två tider.
   */
  reservationCreate: { limit: 5, windowSeconds: 60 },
  /** Lediga tider. Generöst — sidan frågar om nytt datum vid varje klick. */
  reservationSlots: { limit: 60, windowSeconds: 60 },
  /**
   * Sökförslag medan man skriver.
   *
   * Generöst med flit: en gäst som skriver "punjene paprike" hinner utlösa
   * flera anrop även med fördröjning i fältet, och en gräns som slår till mitt
   * i ett ord ser ut som att sökningen hänger sig. Endpointen läser bara det
   * som redan står publikt på sidorna.
   */
  searchSuggest: { limit: 90, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitOptions>;

/**
 * Räknar ett anrop mot den delade räknaren.
 *
 * Räkningen sker atomärt i databasen. En läsning följd av en skrivning härifrån
 * hade tappat anrop som kommer samtidigt — vilket är precis de anrop en gräns
 * finns till för.
 *
 * Service role av samma skäl som webhooken: det finns inget användarsammanhang,
 * och räknaren ska inte gå att läsa eller nollställa av den som räknas.
 */
export async function rateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  try {
    /*
     * Importeras här och inte överst.
     *
     * `supabase/admin` bär `import "server-only"`, som kastar utanför en
     * serverkörning. Med en toppimport hade den här modulen — och därmed
     * `memoryRateLimit`, som är reserven — blivit omöjlig att enhetstesta.
     */
    const { createAdminClient } = await import("./supabase/admin");

    const { data, error } = await createAdminClient()
      .rpc("rate_limit_hit", {
        p_key: key,
        p_limit: options.limit,
        p_window_seconds: options.windowSeconds,
      })
      .maybeSingle();

    if (error || !data) throw error ?? new Error("rate_limit_hit gav inget svar");

    const row = data as { allowed: boolean; remaining: number; reset_at: string };

    return {
      success: row.allowed,
      limit: options.limit,
      remaining: row.remaining,
      reset: new Date(row.reset_at).getTime(),
    };
  } catch {
    /*
     * Databasen svarade inte.
     *
     * Att släppa igenom allt vore att stänga av skyddet just när något är fel,
     * och att neka allt vore att låta en databasstörning stänga QR-flödet.
     * Räknaren i processminnet är sämre än den delade men bättre än båda.
     */
    return memoryRateLimit(key, options);
  }
}

/**
 * Räknaren i processminnet.
 *
 * Exporterad därför att den testas för sig: den är reserven, och en reserv som
 * ingen provat är ingen reserv. Den delade räknaren kräver en databas och täcks
 * av `verify-schema.sh` i stället.
 */
export function memoryRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
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
