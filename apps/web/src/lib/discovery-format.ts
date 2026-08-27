import { CURRENCY_INFO, zonedNow, type CurrencyCode } from "@burp/core";

/**
 * De rena delarna av upptäcktsytan: formatering och indatasanering.
 *
 * Ligger skilt från `discovery.ts` därför att den filen drar in
 * Supabase-klienten och `next/headers`. Här finns inget som rör en databas
 * eller en request, och därför går det att testa utan att starta något.
 */

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type OpeningHours = Partial<Record<DayKey, { opens: string; closes: string }[]>>;

/**
 * Söndag först — `zonedNow().dayIndex` räknar från söndag, inte måndag.
 * Med måndag först hamnar varje dag ett steg fel och sidan visar gårdagens
 * tider hela veckan.
 */
const DAY_KEYS: readonly DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * PostgREST tolkar `,` och `)` som syntax inuti `or(...)`. En sökning på
 * "kött, fisk)" skulle annars bli ett trasigt filter i stället för en träfflös
 * sökning, och `%` gör varje sökning till en jokertecken-sökning.
 *
 * Tecknen tas bort i stället för att escapas — de bär ingen betydelse i en
 * fritextsökning, och en gäst som skriver dem menar inget med dem.
 */
export function sanitizeQuery(raw: string): string {
  return raw.replace(/[,()\\%]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Dagens öppettider som text, t.ex. "11:00–14:00, 17:00–22:00".
 *
 * Det här är presentation, inte regeln. Om restaurangen tar emot order just nu
 * avgörs av `is_restaurant_open()` i databasen (migration 0004) — den frågan
 * ska aldrig besvaras här, eftersom två svar på samma fråga garanterat glider
 * isär. Här visas bara vad som står i schemat för dagen.
 */
export function todaysHours(
  hours: OpeningHours | null,
  timeZone: string,
  now: Date = new Date(),
): string | null {
  if (!hours) return null;

  const key = DAY_KEYS[zonedNow(now, timeZone).dayIndex];
  const spans = key ? hours[key] : undefined;

  if (!spans || spans.length === 0) return null;

  return spans.map((span) => `${span.opens}–${span.closes}`).join(", ");
}

/** Prisklassens skala. Fyra steg, som i resten av branschen. */
const PRICE_TIERS = 4;

/**
 * Prisklass som valutasymbol plus en skala: 2 i Sarajevo → "KM ●●○○".
 *
 * Symbolen kommer från restaurangens valuta, inte från koden. En restaurang i
 * Sarajevo visade "kr kr" en gång — vilket ser ut som ett fel för gästen och
 * ÄR ett fel, eftersom det antyder att notan kommer i kronor.
 *
 * ── Varför inte upprepad symbol ─────────────────────────────────────────────
 *
 * Det var den första formen, och den fungerar bara för symboler på ett tecken.
 * Serbiska dinarens symbol är "дин." — fyra tecken — och prisklass tre blev
 * "дин. дин. дин.", som i versaler på ett kort läser som ett renderingsfel.
 * Bosniska "KM KM" var inte mycket bättre.
 *
 * Skalan säger dessutom något upprepningen inte gör: att tre är tre AV FYRA.
 * Två fyllda cirklar utan tomma bredvid sig kan lika gärna vara toppklassen.
 *
 * Null när restaurangen saknar prisklass. Då visas ingenting alls, hellre än
 * en gissad klass.
 */
export function priceTierLabel(tier: number | null, currency: CurrencyCode): string | null {
  if (tier === null || !Number.isFinite(tier) || tier < 1) return null;

  const level = Math.min(Math.floor(tier), PRICE_TIERS);
  const { symbol } = CURRENCY_INFO[currency];

  return `${symbol} ${"●".repeat(level)}${"○".repeat(PRICE_TIERS - level)}`;
}
