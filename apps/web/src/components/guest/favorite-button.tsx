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
}: {
  restaurantId: string;
  isFavorite: boolean;
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
        aria-label={isFavorite ? "Ta bort från favoriter" : "Spara som favorit"}
        onClick={() => {
          const next = !isFavorite;
          setIsFavorite(next);
          setError(null);

          startTransition(async () => {
            const result = await toggleFavorite(restaurantId);
            if (!result.ok) {
              setIsFavorite(!next);
              setError(result.message ?? "Kunde inte spara.");
            }
          });
        }}
        className={`h-11 w-11 rounded-full border text-lg disabled:opacity-50 ${
          isFavorite
            ? "border-transparent bg-burp-600 text-white"
            : "border-black/15 dark:border-white/20"
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
