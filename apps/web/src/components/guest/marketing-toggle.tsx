"use client";

import { useState, useTransition } from "react";
import { setMarketingOptIn } from "@/app/konto/uppgifter/actions";

/**
 * Samtycke till utskick.
 *
 * Sparar direkt när rutan ändras, utan sparaknapp. Skälet är juridiskt och
 * inte estetiskt: GDPR kräver att ett samtycke går att ta tillbaka lika enkelt
 * som det lämnades, och en kryssruta som kräver ett andra klick på rätt knapp
 * för att gälla är inte lika enkelt. Krysset ÄR handlingen.
 *
 * Rutan visar sitt nya läge omedelbart och rullas tillbaka om servern säger
 * nej — annars ser den ur som om valet gick igenom.
 */

export function MarketingToggle({
  initial,
  label,
  savedLabel,
}: {
  initial: boolean;
  label: string;
  savedLabel: string;
}) {
  const [optIn, setOptIn] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    const previous = optIn;
    setOptIn(next);
    setMessage(null);

    startTransition(async () => {
      const result = await setMarketingOptIn(next);

      if (result.ok) {
        setMessage({ ok: true, text: savedLabel });
      } else {
        setOptIn(previous);
        setMessage({ ok: false, text: result.message ?? "" });
      }
    });
  }

  return (
    <div className="mt-4">
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={optIn}
          disabled={pending}
          onChange={(event) => change(event.target.checked)}
          className="size-5 accent-burp-600"
        />
        <span>{label}</span>
      </label>

      {message ? (
        <p
          role="status"
          className={`mt-2 text-sm ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
