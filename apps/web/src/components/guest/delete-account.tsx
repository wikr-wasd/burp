"use client";

import { useState, useTransition } from "react";
import { eraseMyAccount } from "@/app/konto/uppgifter/actions";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Radering av det egna kontot.
 *
 * Två steg, och bekräftelseordet måste skrivas. Det är den enda åtgärden i
 * produkten som inte går att ångra, och en ensam knapp hade räckt för att en
 * felklickning ska kosta någon hela sin historik.
 *
 * Ordet kontrolleras även på servern. En knapp som skickar samma anrop utan att
 * någon skrivit något är en klickning bort i devtools.
 *
 * Ordet självt översätts INTE. "RADERA" är ett lösenord och inte en mening —
 * ett översatt bekräftelseord hade betytt att servern och webbläsaren måste
 * komma överens om vilket språk gästen läste på, och den överenskommelsen är
 * precis det som går sönder när någon byter språk mitt i.
 */

const CONFIRMATION = "RADERA";

export function DeleteAccount({ texts }: { texts: Dictionary["account"] }) {
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
        {texts.deleteTitle}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-[var(--radius)] border border-red-600 p-4">
      <p className="font-medium">{texts.deleteConfirmTitle}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {/*
          Ordet står i <strong> mitt i meningen och kan därför inte fyllas i
          med `fill()` — den ger en sträng, inte tre noder. Mallen delas i
          stället vid platshållaren, vilket fungerar på alla fem språken
          eftersom ordet aldrig står först eller sist på något av dem.
        */}
        {splitAround(texts.deleteConfirmBody).map((part, index) =>
          part === null ? (
            <strong key={index}>{CONFIRMATION}</strong>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
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
        <span className="sr-only">
          {fill(texts.deleteConfirmLabel, { word: CONFIRMATION })}
        </span>
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
              if (!result?.ok) setError(result?.message ?? texts.errors.eraseFailed);
            });
          }}
          className="btn bg-red-600 text-white disabled:opacity-50"
        >
          {pending ? texts.deleting : texts.deleteForever}
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
          {texts.cancel}
        </button>
      </div>
    </div>
  );
}

/** "Skriv {word} för att…" → ["Skriv ", null, " för att…"]. `null` är ordet. */
function splitAround(template: string): (string | null)[] {
  const parts = template.split("{word}");
  return parts.flatMap((part, index) => (index === 0 ? [part] : [null, part]));
}
