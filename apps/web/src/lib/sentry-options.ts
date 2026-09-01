import type { ErrorEvent, EventHint, Breadcrumb } from "@sentry/nextjs";
import { scrubUrl } from "./sentry-scrub";

/**
 * Det Sentry får se, och inget mer.
 *
 * En modul och inte två kopior i `instrumentation.ts` och
 * `instrumentation-client.ts`. Skrubbningen är en säkerhetsregel, och en
 * säkerhetsregel som står på två ställen glider isär på den rad någon glömmer
 * i den ena.
 *
 * Ren funktion utan `server-only`: klientsidan behöver exakt samma rensning,
 * och det är där adressen med bordets token faktiskt syns.
 */

/**
 * Byter ut nycklar i allt som bär en adress.
 *
 * `sendDefaultPii: false` tar bort cookies, IP och headers. Den tar INTE bort
 * sökvägen — och det är sökvägen som bär hemligheterna i Burp: bordets token
 * och kvittots order-id. Se `sentry-scrub.ts`.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  if (event.request?.url) {
    event.request.url = scrubUrl(event.request.url);
  }

  if (typeof event.request?.query_string === "string") {
    // Frågesträngen kommer utan sitt frågetecken. `scrubUrl` vill ha en
    // sökväg, så den matas som en och skalas av efteråt.
    event.request.query_string = scrubUrl(`/?${event.request.query_string}`).replace(/^\/\?/, "");
  }

  /*
   * Brödsmulorna är den som glöms.
   *
   * Sentry spelar in varje navigering och varje fetch som en brödsmula, med
   * adressen i klartext. En rensad `request.url` bredvid en osminkad
   * brödsmula har inte rensat någonting.
   */
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }

  return event;
}

/** Samma rensning, för smulan som just skapats. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  const data = crumb.data;
  if (!data) return crumb;

  const next = { ...data };
  let touched = false;

  for (const key of ["url", "from", "to"]) {
    const value = next[key];
    if (typeof value === "string" && value !== "") {
      next[key] = scrubUrl(value);
      touched = true;
    }
  }

  return touched ? { ...crumb, data: next } : crumb;
}

/**
 * Inställningar som gäller på båda sidor.
 *
 * `sendDefaultPii` står uttryckligen som `false` trots att det redan är
 * standard. Burp hanterar gästers adresser, order och e-post, och den raden
 * ska inte kunna försvinna i en uppgradering utan att någon märker det.
 *
 * `tracesSampleRate` är noll. Prestandaspårning kostar kvot och skickar varje
 * sidladdning — inte bara felen — och frågan här är "vad går sönder", inte
 * "hur snabbt går det". Slås den på ska det vara ett eget beslut.
 */
export const SHARED_SENTRY_OPTIONS = {
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
} as const;
