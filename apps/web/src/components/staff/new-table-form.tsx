"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createTable, type ActionResult } from "@/app/dashboard/bord/actions";

/** Formulär för att lägga till ett bord. */
export function NewTableForm() {
  const [result, formAction] = useActionState<ActionResult | null, FormData>(createTable, null);

  return (
    <form
      action={formAction}
      className="mt-6 border border-[var(--rule)] p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 basis-32">
          <span className="text-sm font-medium">Bordsnummer</span>
          <input
            name="table_number"
            required
            maxLength={20}
            className="mt-1 w-full border border-[var(--rule-control)] bg-transparent px-3 py-2"
          />
        </label>

        <label className="flex-1 basis-40">
          <span className="text-sm font-medium">
            Zon <span className="font-normal opacity-60">valfritt</span>
          </span>
          <input
            name="zone"
            maxLength={60}
            placeholder="Uteservering"
            className="mt-1 w-full border border-[var(--rule-control)] bg-transparent px-3 py-2"
          />
        </label>

        <label className="basis-28">
          <span className="text-sm font-medium">
            Platser <span className="font-normal opacity-60">valfritt</span>
          </span>
          <input
            name="capacity"
            type="number"
            min={1}
            max={100}
            className="mt-1 w-full border border-[var(--rule-control)] bg-transparent px-3 py-2"
          />
        </label>

        <SubmitButton />
      </div>

      {result?.message ? (
        <p
          role="alert"
          className={`mt-3 px-3 py-2 text-sm ${
            result.ok
              ? "bg-green-600/10 text-green-700 dark:text-green-400"
              : "bg-red-600/10 text-red-700 dark:text-red-400"
          }`}
        >
          {result.message}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton() {
  // useFormStatus måste ligga i en komponent INUTI formuläret — den läser
  // status från närmaste form ovanför sig i trädet.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary"
    >
      {pending ? "Lägger till…" : "Lägg till bord"}
    </button>
  );
}
