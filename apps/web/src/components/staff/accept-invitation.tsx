"use client";

import type { Dictionary } from "@/lib/i18n";

import { useState, useTransition } from "react";
import { acceptInvitation } from "@/app/personal/inbjudan/[token]/actions";

/**
 * Knappen som löser in inbjudan.
 *
 * Ett tryck och inte ett automatiskt anrop vid sidladdning. Att gå med i en
 * arbetsplats är ett beslut, och en länk som utför något bara för att den
 * öppnades går inte att ångra — inte heller när den öppnades av en
 * mailklient som förhandshämtar länkar.
 */
export function AcceptInvitation({
  token,
  labels,
}: {
  token: string;
  /** Inbjudningssidans texter ur ordboken. Rena strängar — klientkod. */
  labels: Dictionary["staff"]["invitation"];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-8">
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-[var(--radius)] bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acceptInvitation(token);
            // Lyckas den omdirigerar servern och vi kommer aldrig hit.
            if (!result?.ok) setError(result?.message ?? labels.joinFailed);
          });
        }}
        className="btn btn-primary w-full"
      >
        {pending ? labels.joining : labels.join}
      </button>
    </div>
  );
}
