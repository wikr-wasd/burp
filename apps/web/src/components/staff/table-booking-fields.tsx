"use client";

import { useState, useTransition } from "react";
import type { CurrencyCode } from "@burp/core";
import { formatAmountInput } from "@burp/core";
import { saveTableBooking, TABLE_ATTRIBUTES } from "@/app/dashboard/bord/actions";
import type { Dictionary } from "@/lib/i18n";

/**
 * Vad bordet är, och vad det kostar extra att boka.
 *
 * Egenskaperna kommer ur en fast lista (migration 0054) och inte som fritext,
 * eftersom de ÖVERSÄTTS för gästen — till skillnad från restaurangens egna
 * texter, som står kvar som de skrivits. Etiketterna här och i
 * bokningsformuläret kommer ur samma avsnitt i ordboken, så en gäst och en
 * ägare aldrig ser olika ord för samma bord.
 *
 * Tillägget hamnar på notan i restaurangen. Burp tar aldrig emot det och det
 * ingår inte i avgiftsunderlaget — texten under fältet säger det, eftersom en
 * ägare annars rimligen antar motsatsen.
 */
export function TableBookingFields({
  tableId,
  attributes,
  surchargeOre,
  currency,
  labels,
  attributeLabels,
}: {
  tableId: string;
  attributes: string[];
  surchargeOre: number;
  currency: CurrencyCode;
  labels: Dictionary["staff"]["tables"];
  attributeLabels: Dictionary["booking"]["attribute"];
}) {
  const [chosen, setChosen] = useState<string[]>(attributes);
  const [surcharge, setSurcharge] = useState(
    surchargeOre > 0 ? formatAmountInput(surchargeOre, currency) : "",
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(attribute: string) {
    setChosen((current) =>
      current.includes(attribute)
        ? current.filter((value) => value !== attribute)
        : [...current, attribute],
    );
    setFeedback(null);
  }

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveTableBooking(tableId, { attributes: chosen, surcharge });
      setFeedback({
        ok: result.ok,
        message: result.ok ? labels.bookingSaved : (result.message ?? labels.statusFailed),
      });
    });
  }

  return (
    <div className="mt-4 border-t border-[var(--rule)] pt-3 print:hidden">
      <p className="label-caps">{labels.bookingTitle}</p>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {TABLE_ATTRIBUTES.map((attribute) => (
          <li key={attribute}>
            <button
              type="button"
              onClick={() => toggle(attribute)}
              aria-pressed={chosen.includes(attribute)}
              className={`px-2.5 py-1 text-sm ${
                chosen.includes(attribute)
                  ? "border border-transparent bg-burp-600 text-white"
                  : "border border-[var(--rule)]"
              }`}
            >
              {attributeLabels[attribute]}
            </button>
          </li>
        ))}
      </ul>

      <label className="mt-3 block">
        <span className="label-caps">{labels.surcharge}</span>
        <input
          type="text"
          value={surcharge}
          onChange={(event) => {
            setSurcharge(event.target.value);
            setFeedback(null);
          }}
          inputMode="decimal"
          placeholder={formatAmountInput(0, currency)}
          className="field mt-1.5 w-28"
        />
        <span className="mt-1 block text-sm text-[var(--muted)]">{labels.surchargeHint}</span>
      </label>

      {feedback ? (
        <p
          role="status"
          className={`mt-2 text-sm ${feedback.ok ? "text-green-700" : "text-burp-700 dark:text-burp-100"}`}
        >
          {feedback.message}
        </p>
      ) : null}

      <button type="button" onClick={save} disabled={pending} className="btn btn-secondary mt-3">
        {pending ? labels.saving : labels.save}
      </button>
    </div>
  );
}
