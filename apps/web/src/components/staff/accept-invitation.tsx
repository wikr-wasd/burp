"use client";

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
export function AcceptInvitation({ token }: { token: string }) {
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
            if (!result?.ok) setError(result?.message ?? "Inbjudan kunde inte lösas in.");
          });
        }}
        className="btn btn-primary w-full"
      >
        {pending ? "Ansluter…" : "Gå med"}
      </button>
    </div>
  );
}
