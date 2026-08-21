"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { STAFF_ROLES, type StaffRole } from "@burp/core";
import {
  inviteStaff,
  setStaffActive,
  setStaffRole,
  type ActionResult,
} from "@/app/dashboard/installningar/actions";
import type { StaffMember } from "@/app/dashboard/installningar/page";

/**
 * Personal och roller.
 *
 * Bara ägaren når hit. Två spärrar finns i serveråtgärderna och speglas här:
 * ägaren kan varken degradera eller stänga av sig själv. Sista ägaren som blir
 * kock låser hela restaurangen ute från sina egna inställningar.
 */
export function StaffManager({
  members,
  roleLabels,
}: {
  members: StaffMember[];
  /** Rollernas namn ur ordboken. Rena strängar — komponenten är klientkod. */
  roleLabels: Record<StaffRole, string>;
}) {
  const [result, formAction] = useActionState<ActionResult | null, FormData>(inviteStaff, null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const outcome = await fn();
      if (!outcome.ok) setError(outcome.message ?? "Åtgärden misslyckades.");
    });
  }

  return (
    <div className="mt-4">
      {error ? (
        <p role="alert" className="mb-3 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <ul className="card divide-y divide-[var(--rule)]">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="mr-auto min-w-0">
              <p className="font-medium">
                {member.fullName ?? member.email ?? "Okänd användare"}
                {member.isSelf ? <span className="ml-2 text-sm opacity-60">(du)</span> : null}
              </p>
              {member.fullName && member.email ? (
                <p className="text-sm opacity-60">{member.email}</p>
              ) : null}
              {!member.isActive ? (
                <p className="text-sm text-red-700 dark:text-red-400">Avstängd</p>
              ) : null}
            </div>

            <label>
              <span className="sr-only">Roll för {member.email ?? "medarbetaren"}</span>
              <select
                value={member.role}
                disabled={pending || member.isSelf}
                onChange={(event) => run(() => setStaffRole(member.id, event.target.value as StaffRole))}
                className="min-h-11 border border-[var(--rule)] bg-transparent px-3 disabled:opacity-50"
              >
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </label>

            {member.isSelf ? null : member.isActive ? (
              confirmDeactivate === member.id ? (
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      run(() => setStaffActive(member.id, false));
                      setConfirmDeactivate(null);
                    }}
                    className="min-h-11 bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Stäng av
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeactivate(null)}
                    className="min-h-11 border border-[var(--rule)] px-4 text-sm"
                  >
                    Avbryt
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeactivate(member.id)}
                  className="min-h-11 border border-[var(--rule)] px-4 text-sm"
                >
                  Stäng av
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setStaffActive(member.id, true))}
                className="min-h-11 border border-[var(--rule)] px-4 text-sm disabled:opacity-50"
              >
                Aktivera igen
              </button>
            )}
          </li>
        ))}
      </ul>

      <form action={formAction} className="card mt-4 p-4">
        <h3 className="font-semibold">Bjud in en medarbetare</h3>
        <p className="mt-1 text-sm opacity-60">
          Har personen redan ett Burp-konto kopplas det direkt. Annars skickas en inbjudan.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex-1 basis-56">
            <span className="label-caps">E-post</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="off"
              className="field mt-1.5"
            />
          </label>

          <label>
            <span className="label-caps">Roll</span>
            <select
              name="role"
              defaultValue="staff"
              className="field mt-1.5"
            >
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>

          <InviteButton />
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
      </form>
    </div>
  );
}

function InviteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 bg-burp-600 px-5 font-medium text-white disabled:opacity-60"
    >
      {pending ? "Bjuder in…" : "Bjud in"}
    </button>
  );
}
