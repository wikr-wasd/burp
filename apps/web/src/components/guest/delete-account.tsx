"use client";

import { useState, useTransition } from "react";
import { eraseMyAccount } from "@/app/konto/uppgifter/actions";

/**
 * Radering av det egna kontot.
 *
 * Två steg, och bekräftelseordet måste skrivas. Det är den enda åtgärden i
 * produkten som inte går att ångra, och en ensam knapp hade räckt för att en
 * felklickning ska kosta någon hela sin historik.
 *
 * Ordet kontrolleras även på servern. En knapp som skickar samma anrop utan att
 * någon skrivit något är en klickning bort i devtools.
 */

const CONFIRMATION = "RADERA";

export function DeleteAccount() {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn mt-4 border border-red-600 bg-transparent text-red-700 dark:text-red-400"
      >
        Radera mitt konto
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-[var(--radius)] border border-red-600 p-4">
      <p className="font-medium">Är du säker?</p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Skriv <strong>{CONFIRMATION}</strong> för att bekräfta. Hämta gärna en kopia av dina
        uppgifter först — efteråt går det inte.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius)] bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}

      <label className="mt-3 block">
        <span className="sr-only">Skriv {CONFIRMATION} för att bekräfta</span>
        <input
          value={word}
          onChange={(event) => setWord(event.target.value)}
          // Inga hjälpsamma förslag i ett fält som ska vara medvetet att fylla i.
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={CONFIRMATION}
          className="field w-full"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || word.trim().toUpperCase() !== CONFIRMATION}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await eraseMyAccount(word);
              // Lyckas den omdirigerar servern och vi kommer aldrig hit.
              if (!result?.ok) setError(result?.message ?? "Kontot kunde inte raderas.");
            });
          }}
          className="btn bg-red-600 text-white disabled:opacity-50"
        >
          {pending ? "Raderar…" : "Radera för alltid"}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setWord("");
            setError(null);
          }}
          className="btn btn-secondary"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}
