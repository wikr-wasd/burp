"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { deleteAddress, saveAddress, type ActionResult } from "@/app/konto/actions";
import type { GuestAddress } from "@/app/konto/adresser/page";

export function AddressList({ addresses }: { addresses: GuestAddress[] }) {
  const [result, formAction] = useActionState<ActionResult | null, FormData>(saveAddress, null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function remove(addressId: string) {
    setError(null);
    startTransition(async () => {
      const outcome = await deleteAddress(addressId);
      if (!outcome.ok) setError(outcome.message ?? "Kunde inte ta bort adressen.");
      setConfirmDelete(null);
    });
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mt-4 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {addresses.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-wrap items-start gap-3 border border-[var(--rule)] p-4"
            >
              <div className="mr-auto min-w-0">
                {address.label ? <p className="font-medium">{address.label}</p> : null}
                <p>{address.streetAddress}</p>
                <p className="text-sm opacity-60">
                  {address.postalCode} {address.city}
                  {address.doorCode ? ` · portkod ${address.doorCode}` : ""}
                </p>
              </div>

              {confirmDelete === address.id ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(address.id)}
                    className="min-h-11 bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Ta bort
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="min-h-11 border border-[var(--rule)] px-4 text-sm"
                  >
                    Avbryt
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(address.id)}
                  className="min-h-11 border border-[var(--rule)] px-4 text-sm"
                >
                  Ta bort
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 opacity-60">Inga sparade adresser.</p>
      )}

      <form
        action={formAction}
        className="mt-8 border border-[var(--rule)] p-4"
      >
        <h2 className="font-semibold">Ny adress</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field name="label" label="Namn" hint="valfritt" placeholder="Hem, Jobb…" />
          <Field name="street_address" label="Gatuadress" required />
          <Field name="postal_code" label="Postnummer" required inputMode="numeric" placeholder="21422" />
          <Field name="city" label="Ort" required />
          <Field name="door_code" label="Portkod" hint="valfritt" />
        </div>

        {result?.message ? (
          <p
            role="alert"
            className={`mt-3 text-sm ${
              result.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
            }`}
          >
            {result.message}
          </p>
        ) : null}

        <SubmitButton />
      </form>
    </>
  );
}

function Field({
  name,
  label,
  hint,
  required,
  placeholder,
  inputMode,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="block">
      <span className="label-caps">
        {label}
        {hint ? <span className="ml-1 font-normal opacity-60">{hint}</span> : null}
      </span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={240}
        className="mt-1 min-h-11 w-full border border-[var(--rule)] bg-transparent px-3"
      />
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 min-h-11 bg-burp-600 px-5 font-medium text-white disabled:opacity-60"
    >
      {pending ? "Sparar…" : "Spara adress"}
    </button>
  );
}
