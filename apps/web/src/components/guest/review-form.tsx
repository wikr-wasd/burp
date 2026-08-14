"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitReview, type ActionResult } from "@/app/konto/actions";

/**
 * Omdömesformuläret (avsnitt 7).
 *
 * Mat och service betygsätts separat. En långsam servering ska inte dra ned
 * betyget på maten — och restaurangen ska kunna se vilket av de två som är
 * problemet.
 */
export function ReviewForm({
  orderId,
  restaurantName,
}: {
  orderId: string;
  restaurantName: string;
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
        className="mt-3 min-h-11 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
      >
        Lämna omdöme
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-4 border-t border-black/10 pt-4 dark:border-white/15">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="rating_food" value={food} />
      <input type="hidden" name="rating_service" value={service || ""} />

      <p className="text-sm font-medium">Hur var maten på {restaurantName}?</p>
      <Stars value={food} onChange={setFood} label="Betyg på maten" />

      <p className="mt-3 text-sm font-medium">
        Service <span className="font-normal opacity-60">valfritt</span>
      </p>
      <Stars value={service} onChange={setService} label="Betyg på servicen" />

      <label className="mt-3 block">
        <span className="text-sm font-medium">
          Kommentar <span className="font-normal opacity-60">valfritt</span>
        </span>
        <textarea
          name="comment"
          rows={2}
          maxLength={2000}
          className="mt-1 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
        />
      </label>

      {result?.message && !result.ok ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {result.message}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Submit disabled={food === 0} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-md border border-black/15 px-4 dark:border-white/20"
        >
          Avbryt
        </button>
      </div>
    </form>
  );
}

function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="mt-1 flex gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} av 5`}
          aria-pressed={value === star}
          onClick={() => onChange(star)}
          // 44 px minst — det här trycks med tummen på en telefon.
          className={`h-11 w-11 rounded-md border text-lg ${
            star <= value
              ? "border-transparent bg-burp-600 text-white"
              : "border-black/15 dark:border-white/20"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="min-h-11 flex-1 rounded-md bg-burp-600 px-4 font-medium text-white disabled:opacity-50"
    >
      {pending ? "Skickar…" : disabled ? "Välj betyg på maten" : "Skicka omdöme"}
    </button>
  );
}
