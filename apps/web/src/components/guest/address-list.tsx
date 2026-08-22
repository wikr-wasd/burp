"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteAddress, saveAddress, type ActionResult } from "@/app/konto/actions";
import type { GuestAddress } from "@/app/konto/adresser/page";
import { fill, type Dictionary } from "@/lib/i18n";

export function AddressList({
  addresses,
  texts,
}: {
  addresses: GuestAddress[];
  texts: Dictionary["account"];
}) {
  const [result, formAction] = useActionState<ActionResult | null, FormData>(saveAddress, null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function remove(addressId: string) {
    setError(null);
    startTransition(async () => {
      const outcome = await deleteAddress(addressId);
      if (!outcome.ok) setError(outcome.message ?? texts.errors.addressRemoveFailed);
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
              className="card flex flex-wrap items-start gap-3  p-4"
            >
              <div className="mr-auto min-w-0">
                {address.label ? <p className="font-medium">{address.label}</p> : null}
                <p>{address.streetAddress}</p>
                <p className="text-sm opacity-60">
                  {address.postalCode} {address.city}
                  {address.doorCode
                    ? ` · ${fill(texts.doorCodeShort, { code: address.doorCode })}`
                    : ""}
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
                    {texts.remove}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="card min-h-11  px-4 text-sm"
                  >
                    {texts.cancel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(address.id)}
                  className="card min-h-11  px-4 text-sm"
                >
                  {texts.remove}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={MapPin}
            title={texts.addressesEmptyTitle}
            body={texts.addressesEmptyBody}
          />
        </div>
      )}

      <form
        action={formAction}
        className="card mt-8  p-4"
      >
        <h2 className="font-semibold">{texts.newAddress}</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            name="label"
            label={texts.addressLabel}
            hint={texts.optional}
            placeholder={texts.addressLabelPlaceholder}
          />
          <Field name="street_address" label={texts.street} required />
          {/*
            Inget exempelpostnummer i platshållaren.

            Där stod "21422", vilket är Malmö. Ett svenskt postnummer som
            exempel i Sarajevo säger antingen ingenting eller fel sak, och
            fältet behöver ingen förklaring — rubriken är hela instruktionen.
          */}
          <Field name="postal_code" label={texts.postalCode} required inputMode="numeric" />
          <Field name="city" label={texts.city} required />
          <Field name="door_code" label={texts.doorCode} hint={texts.optional} />
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

        <SubmitButton saving={texts.saving} save={texts.saveAddress} />
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
        className="mt-1 min-h-11 w-full border border-[var(--rule-control)] bg-transparent px-3"
      />
    </label>
  );
}

function SubmitButton({ saving, save }: { saving: string; save: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 min-h-11 bg-burp-600 px-5 font-medium text-white disabled:opacity-60"
    >
      {pending ? saving : save}
    </button>
  );
}
