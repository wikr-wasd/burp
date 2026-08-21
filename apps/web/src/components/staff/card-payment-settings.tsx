"use client";

import { useState, useTransition } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import type { CurrencyCode } from "@burp/core";
import { fill, type Dictionary } from "@/lib/i18n";
import {
  disableCardPayments,
  startCardOnboarding,
} from "@/app/dashboard/installningar/actions";

/**
 * Kortbetalning i personalytan.
 *
 * Ytan säger tre saker och inget mer: om restaurangen kan ta kort, vad som
 * saknas om den inte kan det, och hur man kopplar sitt konto. Allt annat —
 * utbetalningar, avgifter, tvister — hör hemma hos leverantören, som har en
 * egen portal för det. Att bygga en halv kopia av den här vore ett skal.
 */

export type AccountStatus = "PENDING" | "ACTIVE" | "DISABLED";

export interface PaymentAccountView {
  provider: string;
  status: AccountStatus;
  currency: CurrencyCode;
}

const PROVIDER_NAMES: Record<string, string> = {
  STRIPE: "Stripe",
  MONRI: "Monri",
};

export function CardPaymentSettings({
  account,
  connectable,
  currency,
  isOwner,
  labels,
}: {
  account: PaymentAccountView | null;
  /** Leverantörer som går att koppla i restaurangens valuta. Tom = ingen. */
  connectable: readonly string[];
  currency: CurrencyCode;
  isOwner: boolean;
  /** Inställningarnas texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["settings"];
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function connect() {
    setFeedback(null);
    startTransition(async () => {
      const result = await startCardOnboarding();
      if (!result.ok || !result.url) {
        setFeedback({ ok: false, message: result.message ?? labels.somethingWrong });
        return;
      }
      // Leverantörens formulär ligger hos dem. Att öppna det i samma flik är
      // rätt: det är ett formulär man går igenom och kommer tillbaka från,
      // inte en sida man växlar till.
      window.location.href = result.url;
    });
  }

  function disable() {
    if (!window.confirm(labels.cardTurnOffConfirm)) return;

    setFeedback(null);
    startTransition(async () => {
      const result = await disableCardPayments();
      setFeedback({
        ok: result.ok,
        message: result.ok ? labels.cardTurnedOff : (result.message ?? labels.somethingWrong),
      });
    });
  }

  // Alltid en sträng: varje ställe som skriver ut den ligger inuti en gren
  // som redan kräver ett konto, och `fill()` tar inte emot null.
  const providerName = account ? (PROVIDER_NAMES[account.provider] ?? account.provider) : "";

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-start gap-3">
        <CreditCard size={20} aria-hidden="true" className="mt-0.5 text-[var(--muted)]" />
        <div className="flex-1">
          {account?.status === "ACTIVE" ? (
            <>
              <p className="font-medium text-green-700 dark:text-green-400">
                {labels.cardOnTitle}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {fill(labels.cardOnBody, { provider: providerName })}
              </p>
            </>
          ) : account?.status === "PENDING" ? (
            <>
              <p className="font-medium">{fill(labels.cardPendingTitle, { provider: providerName })}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {fill(labels.cardPendingBody, { provider: providerName })}
              </p>
            </>
          ) : account?.status === "DISABLED" ? (
            <>
              <p className="font-medium">{labels.cardDisabledTitle}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {fill(labels.cardDisabledBody, { provider: providerName })}
              </p>
            </>
          ) : connectable.length > 0 ? (
            <>
              <p className="font-medium">{labels.cardConnectTitle}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {labels.cardConnectBody}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">{labels.cardUnavailableTitle}</p>
              {/*
                Bosnien och Serbien ligger utanför EU/EES, och de internationella
                leverantörerna finns inte där. Det är ett besked och inte ett fel —
                kontantflödet fungerar hela vägen, och kassavyn kvitterar notan.
              */}
              <p className="mt-1 text-sm text-[var(--muted)]">
                {fill(labels.cardUnavailableBody, { currency })}
              </p>
            </>
          )}

          {feedback ? (
            <p
              role="status"
              className={`mt-3 text-sm ${feedback.ok ? "text-green-700 dark:text-green-400" : "text-burp-700 dark:text-burp-300"}`}
            >
              {feedback.message}
            </p>
          ) : null}

          {isOwner && connectable.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={connect}
                disabled={pending}
                className="btn btn-primary"
              >
                {pending ? (
                  <Loader2 size={16} aria-hidden="true" className="animate-spin" />
                ) : (
                  <ExternalLink size={16} aria-hidden="true" />
                )}
                {account ? labels.cardContinue : labels.cardConnect}
              </button>

              {account?.status === "ACTIVE" ? (
                <button
                  type="button"
                  onClick={disable}
                  disabled={pending}
                  className="btn btn-secondary"
                >
                  {labels.cardTurnOff}
                </button>
              ) : null}
            </div>
          ) : null}

          {!isOwner && connectable.length > 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              {labels.cardOwnerOnly}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
