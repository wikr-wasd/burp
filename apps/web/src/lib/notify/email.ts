import "server-only";

import { serverEnv } from "@/lib/env";
import type { EmailMessage } from "./messages";

/**
 * Utskick av e-post.
 *
 * Går mot Resends HTTP-API med `fetch` i stället för en SDK. Ett brev är en
 * POST med fyra fält; ett paket till hade betytt en till sak att hålla
 * uppdaterad och en till sak i bundlen för samma resultat.
 *
 * Två regler bär hela modulen:
 *
 *   1. **Ett utskick får aldrig fälla det som utlöste det.** Funktionen kastar
 *      inte. Den svarar med ett utfall, och den som anropar loggar. En order
 *      som gick igenom ska inte se ut att ha misslyckats för att en inkorg
 *      låg nere.
 *   2. **Utan nyckel skickas ingenting.** Utvecklingsmiljön ska inte kräva ett
 *      konto hos en leverantör. Brevet skrivs i loggen i stället, så att det
 *      går att läsa vad som skulle ha skickats.
 */

export type EmailOutcome =
  | { delivered: true; id: string }
  | {
      delivered: false;
      reason: "NOT_CONFIGURED" | "NO_RECIPIENTS" | "PROVIDER_ERROR";
      detail?: string;
    };

/**
 * Tiden ett utskick får ta.
 *
 * `after()` håller funktionen vid liv tills brevet är skickat, och en
 * leverantör som hänger skulle annars hålla den vid liv tills plattformens
 * maxtid slår till. Åtta sekunder är gott om tid för ett API-anrop.
 */
const TIMEOUT_MS = 8_000;

export async function sendEmail(
  to: readonly string[],
  message: EmailMessage,
): Promise<EmailOutcome> {
  const recipients = [...new Set(to.map((address) => address.trim()).filter(Boolean))];

  if (recipients.length === 0) {
    return { delivered: false, reason: "NO_RECIPIENTS" };
  }

  const env = serverEnv();

  if (!env.RESEND_API_KEY) {
    console.info(
      `[notis] Ingen RESEND_API_KEY satt — brevet skickades inte.\n` +
        `  Till:   ${recipients.join(", ")}\n` +
        `  Ämne:   ${message.subject}\n` +
        `${message.text.replace(/^/gm, "  | ")}`,
    );
    return { delivered: false, reason: "NOT_CONFIGURED" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.NOTIFY_FROM,
        to: recipients,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // Leverantörens svarstext bär skälet — verifierad domän saknas, ogiltig
      // nyckel, avvisad mottagare. Utan den står det bara "500" i loggen.
      const detail = await response.text().catch(() => "");
      return {
        delivered: false,
        reason: "PROVIDER_ERROR",
        detail: `${response.status} ${detail.slice(0, 300)}`,
      };
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { delivered: true, id: body?.id ?? "" };
  } catch (error) {
    return {
      delivered: false,
      reason: "PROVIDER_ERROR",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
