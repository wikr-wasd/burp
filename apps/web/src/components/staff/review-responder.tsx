"use client";

import { useState, useTransition } from "react";
import { removeResponse, respondToReview } from "@/app/dashboard/omdomen/actions";
import { LOW_RATING_THRESHOLD } from "@burp/core";
import type { StaffReview } from "@/lib/reviews";

/**
 * Ett omdöme med möjlighet att svara.
 *
 * Svaret publiceras direkt på restaurangsidan. Det står i knappen, eftersom
 * skillnaden mellan en intern anteckning och något varje framtida gäst läser
 * är värd att vara tydlig med innan man trycker.
 */
export function ReviewResponder({ review }: { review: StaffReview }) {
  const [draft, setDraft] = useState(review.response ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isLow = review.ratingFood <= LOW_RATING_THRESHOLD;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) setEditing(false);
      else setError(result.message ?? "Kunde inte spara svaret.");
    });
  }

  return (
    <li
      className={`rounded-xl border p-4 ${
        isLow ? "border-red-600/40" : "border-black/10 dark:border-white/15"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium" aria-label={`Betyg på maten: ${review.ratingFood} av 5`}>
          <span aria-hidden="true" className="text-burp-600">
            {"★".repeat(review.ratingFood)}
          </span>
          <span aria-hidden="true" className="opacity-25">
            {"★".repeat(5 - review.ratingFood)}
          </span>
        </span>

        <span className="text-sm opacity-60">
          {review.authorName ?? "Gäst"} ·{" "}
          {new Date(review.createdAt).toLocaleDateString("sv-SE")}
        </span>

        {review.ratingService !== null ? (
          <span className="text-sm opacity-60">Service {review.ratingService}/5</span>
        ) : null}

        {!review.isPublished ? (
          <span className="rounded-full bg-black/10 px-2.5 py-1 text-xs dark:bg-white/15">
            Dold av Burp
          </span>
        ) : null}
      </div>

      {review.comment ? <p className="mt-2">{review.comment}</p> : (
        <p className="mt-2 text-sm opacity-50">Gästen lämnade bara betyg, ingen text.</p>
      )}

      {error ? (
        <p role="alert" className="mt-3 rounded-md bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {review.response && !editing ? (
        <div className="mt-3 rounded-lg bg-black/5 p-3 dark:bg-white/10">
          <p className="text-sm font-medium">Ert svar</p>
          <p className="mt-1 text-sm">{review.response}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-11 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
            >
              Ändra svaret
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeResponse(review.id))}
              className="min-h-11 rounded-md border border-black/15 px-4 text-sm disabled:opacity-50 dark:border-white/20"
            >
              Ta bort svaret
            </button>
          </div>
        </div>
      ) : editing || !review.response ? (
        <div className="mt-3">
          <label className="block">
            <span className="text-sm font-medium">
              {review.response ? "Ändra svaret" : "Svara publikt"}
            </span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={
                isLow
                  ? "Ett sakligt svar på ett lågt betyg gör mer nytta än inget svar alls."
                  : "Tack för att du beställde…"
              }
              className="mt-1 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            />
          </label>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending || draft.trim() === ""}
              onClick={() => run(() => respondToReview(review.id, draft))}
              className="min-h-11 rounded-md bg-burp-600 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Publicerar…" : "Publicera svaret"}
            </button>

            {editing ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(review.response ?? "");
                  setEditing(false);
                }}
                className="min-h-11 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
              >
                Avbryt
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
