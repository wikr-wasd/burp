import * as Sentry from "@sentry/nextjs";
import { SHARED_SENTRY_OPTIONS } from "@/lib/sentry-options";

/**
 * Felrapportering från webbläsaren.
 *
 * Egen fil därför att Next kör den i klienten; `instrumentation.ts` körs bara
 * på servern och edge. Inställningarna delas via `SHARED_SENTRY_OPTIONS` — det
 * är samma skrubbning på båda sidor, och den får inte finnas i två versioner.
 *
 * ── Det här är sidan där adressen med bordets token faktiskt syns ───────────
 *
 * En gäst står vid ett bord på `/t/<token>`. Går något sönder i webbläsaren
 * bär felrapporten adressen, och brödsmulorna bär varje navigering dit.
 * `scrubEvent` och `scrubBreadcrumb` byter ut segmentet innan något lämnar
 * telefonen. Se `lib/sentry-scrub.ts` för vilka rutter som räknas som
 * nycklar.
 *
 * ── replayIntegration är INTE påslagen ──────────────────────────────────────
 *
 * Sessionsinspelning är Sentrys mest lockande funktion och den sämsta idén i
 * just den här produkten: den spelar in skärmen medan gästen skriver in sitt
 * namn, sin adress och sitt kortfält. Att maskera bort det i efterhand är en
 * konfiguration som måste hållas rätt för alltid. Den slås inte på utan ett
 * eget beslut, och då med en genomgång av vad som maskeras.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    ...SHARED_SENTRY_OPTIONS,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

/**
 * Navigeringar i appen.
 *
 * Utan den saknar en felrapport vilken sida gästen kom ifrån, och alla fel i
 * en klientnavigering grupperas på den första sidan som laddades. Ofarlig utan
 * DSN — den gör ingenting när Sentry inte initierats.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
