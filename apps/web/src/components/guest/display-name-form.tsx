"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/lib/i18n";
import { setDisplayName } from "@/app/konto/uppgifter/actions";

/**
 * Namnet gästen väljer att visa vid sina omdömen.
 *
 * Eget fält, aldrig hämtat ur `full_name`. Det är regeln i `lib/reviews.ts`
 * och skälet till att kolumnen finns: `full_name` är vad hon heter, det här är
 * vad hon valt att kalla sig offentligt.
 *
 * Sparaknapp och ingen automatisk sparning, till skillnad från kryssrutorna på
 * samma sida. Ett namn skrivs tecken för tecken, och att spara vid varje
 * tangenttryck hade skickat "A", "Am", "Ami" till servern — och publicerat
 * varje mellansteg på hennes omdömen.
 */

export function DisplayNameForm({
  initial,
  labels,
}: {
  initial: string | null;
  labels: Dictionary["account"];
}) {
  const router = useRouter();
  const [name, setName] = useState(initial ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);

    startTransition(async () => {
      const result = await setDisplayName(name);

      setMessage({
        ok: result.ok,
        text: result.ok ? labels.displayNameSaved : (result.message ?? labels.errors.saveFailed),
      });

      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="mt-4 max-w-sm">
      <label className="block">
        <span className="label-caps">{labels.displayNameLabel}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={labels.displayNamePlaceholder}
          maxLength={40}
          disabled={pending}
          className="field mt-1.5"
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={pending || name.trim() === (initial ?? "")}
        className="btn btn-secondary mt-3"
      >
        {labels.displayNameSave}
      </button>

      {message ? (
        <p
          role="status"
          className={`mt-2 text-sm ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
