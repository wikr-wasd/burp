"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleX, CookingPot, ReceiptText, Undo2, UtensilsCrossed } from "lucide-react";
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

/**
 * Stegen gästen går igenom, med varsin ikon.
 *
 * Etiketterna är ett ord långa ("Lagd", "Tillagas") och fyra sådana i rad
 * skiljer sig knappt åt på en telefon i ögonvrån. Formerna gör det: en gryta
 * och en gaffel går att skilja på håll, vilket "Tillagas" och "Klar" inte gör.
 *
 * Ikonen är ett tillägg till texten, aldrig ett byte. Ett kvitto som bara visar
 * en gryta säger inte vad som händer.
 */
const STEPS = [
  { status: "PLACED", Icon: ReceiptText },
  { status: "ACCEPTED", Icon: Check },
  { status: "PREPARING", Icon: CookingPot },
  { status: "READY", Icon: UtensilsCrossed },
] as const satisfies readonly { status: OrderStatus; Icon: typeof Check }[];

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

  const currentIndex = STEPS.findIndex((step) => step.status === status);

  if (status === "CANCELLED" || status === "REFUNDED") {
    const TerminalIcon = status === "CANCELLED" ? CircleX : Undo2;
    return (
      <div className="card flex items-start gap-3 p-6">
        <TerminalIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--muted)]" />
        <div>
          <p className="text-lg font-semibold">{labels.status[status]}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{labels.contactRestaurant}</p>
        </div>
      </div>
    );
  }

  const minutesLeft = estimateMinutesLeft(placedAt, prepTimeMinutes, now);

  return (
    <div className="card p-6">
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

      {/*
        Etiketterna stod tidigare i `sr-only`. Det var en halv lösning: den som
        såg skärmen fick fyra namnlösa streck och kunde bara gissa vad de betydde.
        Nu står namnen ut, och streckens enda uppgift är att visa hur långt det
        gått.
      */}
      <ol className="mt-5 flex gap-1.5" aria-label={labels.progress}>
        {STEPS.map(({ status: step, Icon }, index) => {
          const done = index <= currentIndex || status === "COMPLETED";
          const isCurrent = index === currentIndex && status !== "COMPLETED";

          return (
            <li
              key={step}
              aria-current={isCurrent ? "step" : undefined}
              className="flex flex-1 flex-col items-center gap-1.5"
            >
              <Icon
                size={16}
                aria-hidden="true"
                className={done ? "text-burp-600" : "text-[var(--muted)] opacity-50"}
              />
              <span
                aria-hidden="true"
                className={`h-1.5 w-full ${done ? "bg-burp-600" : "bg-black/10 dark:bg-white/15"}`}
              />
              <span
                className={`text-center text-xs ${
                  isCurrent ? "font-semibold" : done ? "" : "text-[var(--muted)]"
                }`}
              >
                {labels.status[step]}
              </span>
            </li>
          );
        })}
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
