"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitReview, type ActionResult } from "@/app/konto/actions";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Omdömesformuläret (avsnitt 7).
 *
 * Mat och service betygsätts separat. En långsam servering ska inte dra ned
 * betyget på maten — och restaurangen ska kunna se vilket av de två som är
 * problemet.
 *
 * Orden lånas ur `receipt` och inte ur `account`. Bordskvittot har samma
 * formulär, och två uppsättningar hade glidit isär och gett samma gäst olika
 * ord för samma stjärnor beroende på var hon råkade trycka.
 */
export function ReviewForm({
  orderId,
  restaurantName,
  texts,
  reviewTexts,
}: {
  orderId: string;
  restaurantName: string;
  texts: Dictionary["account"];
  reviewTexts: Dictionary["receipt"];
}) {
  const [result, formAction] = useActionState<ActionResult | null, FormData>(submitReview, null);
  const [open, setOpen] = useState(false);
  const [food, setFood] = useState(0);
  const [service, setService] = useState(0);

  if (result?.ok) {
    return <p className="mt-3 text-sm text-green-700 dark:text-green-400">{result.message}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card mt-3 min-h-11  px-4 text-sm"
      >
        {reviewTexts.reviewOpen}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-4 border-t border-[var(--rule)] pt-4">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="rating_food" value={food} />
      <input type="hidden" name="rating_service" value={service || ""} />

      <p className="text-sm font-medium">
        {fill(texts.reviewPromptAt, { restaurant: restaurantName })}
      </p>
      <Stars value={food} onChange={setFood} label={reviewTexts.reviewFood} star={reviewTexts.reviewStar} />

      <p className="mt-3 text-sm font-medium">
        {reviewTexts.reviewService}{" "}
        <span className="normal-case whitespace-nowrap">{reviewTexts.reviewOptional}</span>
      </p>
      <Stars
        value={service}
        onChange={setService}
        label={reviewTexts.reviewService}
        star={reviewTexts.reviewStar}
      />

      <label className="mt-3 block">
        <span className="label-caps">
          {reviewTexts.reviewComment}{" "}
          <span className="normal-case whitespace-nowrap">{reviewTexts.reviewOptional}</span>
        </span>
        <textarea
          name="comment"
          rows={2}
          maxLength={2000}
          className="mt-1 w-full border border-[var(--rule-control)] bg-transparent px-3 py-2 text-sm"
        />
      </label>

      {result?.message && !result.ok ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {result.message}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Submit
          disabled={food === 0}
          sending={reviewTexts.reviewSending}
          needsFood={texts.reviewNeedsFood}
          submit={reviewTexts.reviewSubmit}
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="card min-h-11  px-4"
        >
          {reviewTexts.reviewCancel}
        </button>
      </div>
    </form>
  );
}

function Stars({
  value,
  onChange,
  label,
  star,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  /** "{n} av 5" — varje knapp säger vilket betyg den sätter. */
  star: string;
}) {
  return (
    <div className="mt-1 flex gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={fill(star, { n })}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          // 44 px minst — det här trycks med tummen på en telefon.
          className={`h-11 w-11 border text-lg ${
            n <= value
              ? "border-transparent bg-burp-600 text-white"
              : "border-[var(--rule)]"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Submit({
  disabled,
  sending,
  needsFood,
  submit,
}: {
  disabled: boolean;
  sending: string;
  needsFood: string;
  submit: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="min-h-11 flex-1 bg-burp-600 px-4 font-medium text-white disabled:opacity-50"
    >
      {pending ? sending : disabled ? needsFood : submit}
    </button>
  );
}
