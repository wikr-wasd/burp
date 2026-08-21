"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/lib/i18n";
import { useFormStatus } from "react-dom";
import { createTable, type ActionResult } from "@/app/dashboard/bord/actions";

/** Formulär för att lägga till ett bord. */
export function NewTableForm({ labels }: {
  /** Bordsytans texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["tables"];
}) {
  const [result, formAction] = useActionState<ActionResult | null, FormData>(createTable, null);

  return (
    <form
      action={formAction}
      className="card mt-6 p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 basis-32">
          <span className="label-caps">{labels.tableNumber}</span>
          <input
            name="table_number"
            required
            maxLength={20}
            className="field mt-1.5"
          />
        </label>

        <label className="flex-1 basis-40">
          <span className="label-caps">
            {labels.zone}{" "}
            <span className="normal-case whitespace-nowrap">{labels.optional}</span>
          </span>
          <input
            name="zone"
            maxLength={60}
            placeholder={labels.zonePlaceholder}
            className="field mt-1.5"
          />
        </label>

        <label className="basis-28">
          <span className="label-caps">
            {labels.seats}{" "}
            <span className="normal-case whitespace-nowrap">{labels.optional}</span>
          </span>
          <input
            name="capacity"
            type="number"
            min={1}
            max={100}
            className="field mt-1.5"
          />
        </label>

        <SubmitButton labels={labels} />
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

function SubmitButton({ labels }: {
  /** Bordsytans texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["tables"];
}) {
  // useFormStatus måste ligga i en komponent INUTI formuläret — den läser
  // status från närmaste form ovanför sig i trädet.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary"
    >
      {pending ? labels.adding : labels.addTable}
    </button>
  );
}
