import { stockholmNow } from "@burp/core";

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
 * Söndag först — `stockholmNow().dayIndex` räknar från söndag, inte måndag.
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
export function todaysHours(hours: OpeningHours | null, now: Date = new Date()): string | null {
  if (!hours) return null;

  const key = DAY_KEYS[stockholmNow(now).dayIndex];
  const spans = key ? hours[key] : undefined;

  if (!spans || spans.length === 0) return null;

  return spans.map((span) => `${span.opens}–${span.closes}`).join(", ");
}

/** Prisklass som kronsymboler: 2 → "kr kr". Null när restaurangen saknar klass. */
export function priceTierLabel(tier: number | null): string | null {
  if (tier === null || !Number.isFinite(tier) || tier < 1) return null;
  return Array.from({ length: Math.min(Math.floor(tier), 4) }, () => "kr").join(" ");
}
