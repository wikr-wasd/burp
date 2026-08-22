"use client";

import { useState, useTransition } from "react";
import { toggleFavorite } from "@/app/konto/actions";

/**
 * Spara eller ta bort en favorit.
 *
 * Optimistisk växling: knappen svarar direkt och rullas tillbaka om servern
 * säger nej. En favorit är billig att ångra, och att vänta på en rundtur för
 * ett hjärta känns trögt på en telefon med dålig täckning.
 */
export function FavoriteButton({
  restaurantId,
  isFavorite: initial,
  saveLabel,
  removeLabel,
  failedLabel,
}: {
  restaurantId: string;
  isFavorite: boolean;
  saveLabel: string;
  removeLabel: string;
  /** Reserv om servern svarar utan meddelande — hjärtat rullas ändå tillbaka. */
  failedLabel: string;
}) {
  const [isFavorite, setIsFavorite] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={pending}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? removeLabel : saveLabel}
        onClick={() => {
          const next = !isFavorite;
          setIsFavorite(next);
          setError(null);

          startTransition(async () => {
            const result = await toggleFavorite(restaurantId);
            if (!result.ok) {
              setIsFavorite(!next);
              setError(result.message ?? failedLabel);
            }
          });
        }}
        className={`h-11 w-11 border text-lg disabled:opacity-50 ${
          isFavorite
            ? "border-transparent bg-burp-600 text-white"
            : "border-[var(--rule)]"
        }`}
      >
        {isFavorite ? "♥" : "♡"}
      </button>

      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
