"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { submitTableReview } from "@/app/t/[token]/order/[orderId]/actions";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Omdömet, frågat vid bordet.
 *
 * Formuläret på `/konto` når bara inloggade gäster — alltså inte QR-gästen,
 * som är den som just ätit och har mest att säga. Det här är samma fråga,
 * ställd på kvittot i samma stund, och på gästens eget språk.
 *
 * Mat och service betygsätts separat. En långsam servering ska inte dra ned
 * betyget på maten, och restaurangen ska kunna se vilket av de två som är
 * problemet.
 *
 * Bara maten är obligatorisk. Ett formulär som kräver tre svar av någon som
 * håller på att gå får noll.
 */
export function TableReview({
  token,
  orderId,
  labels,
}: {
  token: string;
  orderId: string;
  labels: Dictionary["receipt"];
}) {
  const [open, setOpen] = useState(false);
  const [food, setFood] = useState(0);
  const [service, setService] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p role="status" className="mt-8 text-sm text-green-700 dark:text-green-400">
        {labels.reviewThanks}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary mt-8">
        <Star size={16} aria-hidden="true" />
        {labels.reviewOpen}
      </button>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitTableReview(token, orderId, {
        ratingFood: food,
        ratingService: service || null,
        comment,
      });

      if (result.ok) {
        setDone(true);
        return;
      }

      // Servern svarar med en kod och inte en mening: den vet inte vilket språk
      // gästen läser. Översättningen hör hemma här, där ordboken finns.
      setError(
        result.message === "REVIEW_ALREADY" ? labels.reviewAlready : labels.reviewFailed,
      );
    });
  }

  return (
    <section className="mt-8 border-t border-[var(--rule)] pt-6">
      <h2 className="font-display text-2xl">{labels.reviewPrompt}</h2>

      <p className="label-caps mt-4">{labels.reviewFood}</p>
      <Stars value={food} onChange={setFood} label={labels.reviewFood} starLabel={labels.reviewStar} />

      <p className="label-caps mt-4">
        {labels.reviewService}{" "}
        <span className="normal-case">({labels.reviewOptional})</span>
      </p>
      <Stars
        value={service}
        onChange={setService}
        label={labels.reviewService}
        starLabel={labels.reviewStar}
      />

      <label className="mt-4 block">
        <span className="label-caps">
          {labels.reviewComment} <span className="normal-case">({labels.reviewOptional})</span>
        </span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          maxLength={2000}
          className="field mt-1.5"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || food === 0}
          className="btn btn-primary flex-1"
        >
          {pending ? labels.reviewSending : labels.reviewSubmit}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">
          {labels.reviewCancel}
        </button>
      </div>
    </section>
  );
}

function Stars({
  value,
  onChange,
  label,
  starLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  /** "{n} av 5". Variabeln fylls med fill() — funktioner går inte över
      server/klient-gränsen och ger 500. */
  starLabel: string;
}) {
  return (
    <div className="mt-1.5 flex gap-1.5" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={fill(starLabel, { n: star })}
          aria-pressed={star === value}
          onClick={() => onChange(star)}
          // 44 px minst. Det här trycks med tummen, i en mörk lokal.
          className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
            star <= value
              ? "border-transparent bg-amber-400 text-white"
              : "border-[var(--rule)] text-[var(--muted)]"
          }`}
        >
          <Star size={20} aria-hidden="true" fill={star <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}
