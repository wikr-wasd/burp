"use client";

import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { CreditCard, Loader2, X } from "lucide-react";

/**
 * Betalrutan vid bordet.
 *
 * Kortuppgifterna skrivs i leverantörens egen iframe och rör aldrig Burps kod
 * — det är hela poängen med Payment Element och det som gör att vi slipper
 * PCI DSS-kraven som följer med att se ett kortnummer.
 *
 * Apple Pay och Google Pay dyker upp här av sig själva på de enheter som har
 * dem. De är inte egna integrationer utan plånböcker ovanpå kortet, och de
 * lyfter konverteringen vid bordet mer än något annat: gästen behöver inte
 * fiska upp ett kort i en mörk lokal.
 *
 * Betalningen bekräftas INTE här. `confirmPayment` säger bara att gästens
 * enhet skickat iväg den; det som gör ordern verklig är leverantörens webhook
 * mot servern. Klienten kan stängas mitt i, och ordern ska bli rätt ändå.
 */

export interface CardPaymentLabels {
  title: string;
  pay: string;
  paying: string;
  cancel: string;
  failed: string;
}

interface Props {
  publishableKey: string;
  /** Betalningen ligger på restaurangens konto, inte på Burps. */
  stripeAccount: string;
  clientSecret: string;
  /** Dit gästen skickas när betalningen krävt en omdirigering. */
  returnUrl: string;
  labels: CardPaymentLabels;
  /** Gästen tryckte ur rutan innan betalningen gjordes. */
  onCancel: () => void;
  /** Betalningen är iväg. Kvittosidan tar över och väntar på webhooken. */
  onPaid: () => void;
}

/**
 * Stripe-instansen cachas per konto.
 *
 * `loadStripe` hämtar ett skript från leverantören. Anropas den om vid varje
 * omrendering laddas skriptet igen och Payment Element nollställs mitt i att
 * gästen skriver sitt kortnummer.
 */
const cache = new Map<string, Promise<Stripe | null>>();

function stripeFor(publishableKey: string, stripeAccount: string) {
  const key = `${publishableKey}:${stripeAccount}`;
  let instance = cache.get(key);
  if (!instance) {
    instance = loadStripe(publishableKey, { stripeAccount });
    cache.set(key, instance);
  }
  return instance;
}

export function CardPayment({
  publishableKey,
  stripeAccount,
  clientSecret,
  returnUrl,
  labels,
  onCancel,
  onPaid,
}: Props) {
  const stripe = useMemo(
    () => stripeFor(publishableKey, stripeAccount),
    [publishableKey, stripeAccount],
  );

  // Rutan är modal. Bakgrunden ska inte gå att scrolla bort under fingret
  // medan ett kortnummer skrivs in.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
    >
      <div className="theme-table max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-5 shadow-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CreditCard size={18} aria-hidden="true" />
            {labels.title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={labels.cancel}
            className="min-h-11 min-w-11 rounded-lg text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <Elements stripe={stripe} options={{ clientSecret }}>
          <Form labels={labels} returnUrl={returnUrl} onPaid={onPaid} />
        </Elements>
      </div>
    </div>
  );
}

function Form({
  labels,
  returnUrl,
  onPaid,
}: {
  labels: CardPaymentLabels;
  returnUrl: string;
  onPaid: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setBusy(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      // Kort som kräver 3DS skickas vidare; Apple Pay och Google Pay klarar
      // sig utan omdirigering och ska då stanna kvar i rutan.
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message ?? labels.failed);
      setBusy(false);
      return;
    }

    // Betalningen är iväg. Vad som gäller avgörs av webhooken, inte här —
    // därför skickas gästen till kvittot, som lyssnar på statusen.
    onPaid();
  }

  return (
    <form onSubmit={submit}>
      <PaymentElement />

      {error ? (
        <p role="alert" className="mt-3 border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={!stripe || busy} className="btn btn-primary mt-4 w-full">
        {busy ? (
          <>
            <Loader2 size={16} aria-hidden="true" className="animate-spin" />
            {labels.paying}
          </>
        ) : (
          labels.pay
        )}
      </button>
    </form>
  );
}
