"use client";

import { useState, useTransition } from "react";
import { Stamp } from "lucide-react";
import { formatAmountInput, type CurrencyCode } from "@burp/core";
import { savePunchCard } from "@/app/dashboard/installningar/actions";

/**
 * Klippkortet.
 *
 * Räknar BESÖK, inte kronor — det är skillnaden mot lojalitetspoängen, och den
 * skillnaden är hela poängen. Poäng belönar den som äter dyrt; ett klippkort
 * belönar den som kommer tillbaka.
 *
 * Fungerar bara för inloggade gäster. Det står i vyn, eftersom en restaurang
 * som slår på funktionen annars undrar varför bordsgästerna inte får något.
 */
export function PunchCardEditor({
  initialSize,
  initialMaxRewardOre,
  currency,
}: {
  initialSize: number | null;
  initialMaxRewardOre: number | null;
  currency: CurrencyCode;
}) {
  const [enabled, setEnabled] = useState(initialSize !== null);
  const [size, setSize] = useState(String(initialSize ?? 10));
  const [maxReward, setMaxReward] = useState(
    initialMaxRewardOre === null ? "" : formatAmountInput(initialMaxRewardOre, currency),
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const result = await savePunchCard({
        size: enabled ? size : "",
        maxReward: enabled ? maxReward : "",
      });

      setFeedback({
        ok: result.ok,
        message: result.ok ? "Sparat." : (result.message ?? "Något gick fel."),
      });
    });
  }

  return (
    <div className="card mt-4 p-4">
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setFeedback(null);
          }}
          className="h-5 w-5 accent-[var(--burp-600,#dc2626)]"
        />
        <span className="flex items-center gap-2 font-medium">
          <Stamp size={18} aria-hidden="true" className="text-[var(--muted)]" />
          Klippkort
        </span>
      </label>

      <p className="mt-1 text-sm text-[var(--muted)]">
        Efter ett visst antal besök bjuder ni på måltiden. Räknar besök och inte belopp — en
        kaffe räknas lika mycket som en trerätters, vilket är vad som får folk att komma
        tillbaka.
      </p>

      {enabled ? (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="w-40">
              <span className="label-caps">Antal besök</span>
              <input
                type="text"
                inputMode="numeric"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className="field mt-1.5 tabular-nums"
              />
            </label>

            <label className="w-40">
              <span className="label-caps">Tak</span>
              <input
                type="text"
                inputMode="decimal"
                value={maxReward}
                onChange={(event) => setMaxReward(event.target.value)}
                placeholder="hela notan"
                className="field mt-1.5 tabular-nums"
              />
              {/* Utan tak bjuder ni på hela ordern. Ett sällskap som beställer
                  för kvällen på det tionde besöket blir dyrt. */}
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Max att bjuda på, i {currency}. Tomt = hela notan.
              </span>
            </label>
          </div>

          <p className="mt-3 text-sm text-[var(--muted)]">
            Gäller bara inloggade gäster. En bordsgäst som beställer anonymt går inte att
            räkna besök på — och ska inte gå att räkna besök på.
          </p>
        </>
      ) : null}

      {feedback ? (
        <p
          role="status"
          className={`mt-3 text-sm ${feedback.ok ? "text-green-700 dark:text-green-400" : "text-burp-700 dark:text-burp-300"}`}
        >
          {feedback.message}
        </p>
      ) : null}

      <button type="button" onClick={submit} disabled={pending} className="btn btn-primary mt-4">
        {pending ? "Sparar…" : "Spara"}
      </button>
    </div>
  );
}
