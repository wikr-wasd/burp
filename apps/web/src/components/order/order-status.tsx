"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isTerminal, type OrderStatus } from "@burp/core";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Statusvyn gästen ser efter att ha beställt.
 *
 * Uppdaterar sig genom att be servern rendera om sidan var tionde sekund.
 * Supabase Realtime vore snyggare, men det kräver att en anonym gäst får
 * prenumerera på sin order — och den RLS-policyn finns inte, eftersom gästen
 * saknar auth.uid(). Polling mot en serverrenderad sida återanvänder
 * bordssessionens cookie och kringgår därmed problemet helt.
 *
 * Pollningen slutar när ordern nått ett slutläge. Ett kök som fått hundra
 * telefoner att fråga varje tionde sekund i evighet är en självförvållad
 * lastattack.
 */

const POLL_INTERVAL_MS = 10_000;

export function OrderStatusView({
  status,
  prepTimeMinutes,
  placedAt,
  labels,
}: {
  status: OrderStatus;
  prepTimeMinutes: number;
  placedAt: string | null;
  /** Texterna, färdigvalda av sidan. Klientkod slår inte upp språk själv. */
  labels: Dictionary["receipt"];
}) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (isTerminal(status)) return;

    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status, router]);

  // Klockan sätts först efter montering. Renderas den på servern skiljer sig
  // serverns och klientens tid åt och React klagar på hydreringsfel.
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const steps: OrderStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY"];
  const currentIndex = steps.indexOf(status);

  if (status === "CANCELLED" || status === "REFUNDED") {
    return (
      <div className="border border-[var(--rule)] p-6">
        <p className="text-lg font-semibold">{labels.status[status]}</p>
        <p className="mt-1 text-sm opacity-70">
          Prata med personalen om du har frågor om beställningen.
        </p>
      </div>
    );
  }

  const minutesLeft = estimateMinutesLeft(placedAt, prepTimeMinutes, now);

  return (
    <div className="border border-[var(--rule)] p-6">
      <p className="text-lg font-semibold">
        {status === "COMPLETED" ? labels.enjoy : labels.status[status]}
      </p>

      {status === "READY" ? (
        <p className="mt-1 text-sm opacity-70">{labels.onTheWay}</p>
      ) : minutesLeft !== null ? (
        <p className="mt-1 text-sm opacity-70">
          {minutesLeft > 0 ? fill(labels.minutesLeft, { n: minutesLeft }) : labels.almostReady}
        </p>
      ) : null}

      <ol className="mt-5 flex gap-1.5" aria-label={labels.progress}>
        {steps.map((step, index) => (
          <li
            key={step}
            className={`h-1.5 flex-1 ${
              index <= currentIndex || status === "COMPLETED"
                ? "bg-burp-600"
                : "bg-black/10 dark:bg-white/15"
            }`}
          >
            <span className="sr-only">
              {labels.status[step]}
              {index <= currentIndex ? " — klart" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Grov uppskattning: tillagningstiden minus det som redan gått.
 *
 * Avsiktligt trubbig. En exakt siffra som slår fel varje gång är sämre än en
 * ungefärlig som stämmer ungefär — och köket vet bättre än vi.
 */
function estimateMinutesLeft(
  placedAt: string | null,
  prepTimeMinutes: number,
  now: number | null,
): number | null {
  if (!placedAt || now === null) return null;

  const elapsedMinutes = (now - new Date(placedAt).getTime()) / 60_000;
  return Math.max(0, Math.round(prepTimeMinutes - elapsedMinutes));
}
