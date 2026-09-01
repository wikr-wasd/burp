import * as Sentry from "@sentry/nextjs";
import { SHARED_SENTRY_OPTIONS } from "@/lib/sentry-options";

/**
 * Felrapportering från servern och edge-körningen.
 *
 * ── Varför den finns ────────────────────────────────────────────────────────
 *
 * Fram till 2026-09-01 rapporterade ingenting fel från produktion. Ett fel i
 * en route handler syntes i Vercels logg om någon råkade titta, och aldrig
 * annars. Det är hela skälet — inte att ha ett verktyg.
 *
 * ── Avstängd utan DSN, och det är ett läge och inte en lucka ────────────────
 *
 * Ingen DSN betyder ingen init, alltså ingen nätverkstrafik och ingen
 * påverkan. Lokalt är det rätt: en utvecklares stackspår hör inte hemma i en
 * gemensam inkorg. Backoffice systemstatus visar att raden är avstängd, så
 * skillnaden mellan "avstängt" och "trasigt" syns på en yta i stället för att
 * gissas.
 *
 * ── DSN:en är publik, och det är inte ett misstag ───────────────────────────
 *
 * `NEXT_PUBLIC_SENTRY_DSN` och inte en hemlighet. En DSN ligger i
 * klientbunten hos varje sajt som använder Sentry — den är en adress att
 * skicka till, inte en nyckel att skydda. Att ha två variabler för samma
 * värde hade bara gett ett ställe att glömma.
 *
 * ⚠️ Organisationen ligger på EU-regionen (`de.sentry.io`). DSN:en bär
 * regionen, så använd den från det projektet — annars lämnar felrapporter,
 * som kan bära restaurang- och ordersammanhang, EU utan att någon beslutat
 * det.
 */

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      ...SHARED_SENTRY_OPTIONS,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
  }
}

/**
 * Next lämnar över serverfel hit.
 *
 * Utan den fångas ett fel i en server component aldrig — `register()` sätter
 * bara upp klienten. Anropet är ofarligt utan DSN: `captureRequestError` gör
 * ingenting när Sentry inte initierats.
 */
export const onRequestError = Sentry.captureRequestError;
