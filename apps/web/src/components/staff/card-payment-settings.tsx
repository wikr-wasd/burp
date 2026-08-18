"use client";

import { useState, useTransition } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import type { CurrencyCode } from "@burp/core";
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
}: {
  account: PaymentAccountView | null;
  /** Leverantörer som går att koppla i restaurangens valuta. Tom = ingen. */
  connectable: readonly string[];
  currency: CurrencyCode;
  isOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function connect() {
    setFeedback(null);
    startTransition(async () => {
      const result = await startCardOnboarding();
      if (!result.ok || !result.url) {
        setFeedback({ ok: false, message: result.message ?? "Något gick fel." });
        return;
      }
      // Leverantörens formulär ligger hos dem. Att öppna det i samma flik är
      // rätt: det är ett formulär man går igenom och kommer tillbaka från,
      // inte en sida man växlar till.
      window.location.href = result.url;
    });
  }

  function disable() {
    if (!window.confirm("Stäng av kortbetalning? Gäster kan då bara betala på plats.")) return;

    setFeedback(null);
    startTransition(async () => {
      const result = await disableCardPayments();
      setFeedback({
        ok: result.ok,
        message: result.ok ? "Kortbetalning avstängd." : (result.message ?? "Något gick fel."),
      });
    });
  }

  const providerName = account ? (PROVIDER_NAMES[account.provider] ?? account.provider) : null;

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-start gap-3">
        <CreditCard size={20} aria-hidden="true" className="mt-0.5 text-[var(--muted)]" />
        <div className="flex-1">
          {account?.status === "ACTIVE" ? (
            <>
              <p className="font-medium text-green-700 dark:text-green-400">
                Kortbetalning är på
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Gäster kan betala med kort, Apple Pay och Google Pay direkt i menyn. Pengarna
                går till ert eget konto hos {providerName} — Burp tar aldrig emot dem. Vår
                avgift dras ur betalningen.
              </p>
            </>
          ) : account?.status === "PENDING" ? (
            <>
              <p className="font-medium">Väntar på {providerName}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Kontot är skapat men {providerName} har inte godkänt det ännu. Det är därför
                kortknappen inte syns för gästerna. Saknas något underlag ligger det i deras
                formulär.
              </p>
            </>
          ) : account?.status === "DISABLED" ? (
            <>
              <p className="font-medium">Kortbetalning är avstängd</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Gäster betalar på plats. Kontot hos {providerName} finns kvar och går att slå
                på igen.
              </p>
            </>
          ) : connectable.length > 0 ? (
            <>
              <p className="font-medium">Ta emot kort i menyn</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Gästen betalar i sin egen telefon vid bordet, med kort, Apple Pay eller Google
                Pay. Ni tecknar avtalet direkt med leverantören och pengarna går rakt in på
                ert konto — Burp håller aldrig gästens pengar.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Kortbetalning är inte tillgänglig än</p>
              {/*
                Bosnien och Serbien ligger utanför EU/EES, och de internationella
                leverantörerna finns inte där. Det är ett besked och inte ett fel —
                kontantflödet fungerar hela vägen, och kassavyn kvitterar notan.
              */}
              <p className="mt-1 text-sm text-[var(--muted)]">
                Ingen leverantör är kopplad för {currency} ännu. Gästen beställer som vanligt
                och betalar på plats; ni kvitterar summan i Kassan.
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
                {account ? "Fortsätt hos leverantören" : "Koppla konto"}
              </button>

              {account?.status === "ACTIVE" ? (
                <button
                  type="button"
                  onClick={disable}
                  disabled={pending}
                  className="btn btn-secondary"
                >
                  Stäng av
                </button>
              ) : null}
            </div>
          ) : null}

          {!isOwner && connectable.length > 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Bara ägaren kan koppla ett betalkonto.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
