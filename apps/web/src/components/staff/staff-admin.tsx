"use client";

import { useState, useTransition } from "react";
import { Copy, Check, UserPlus } from "lucide-react";
import { type StaffRole } from "@burp/core";
import {
  changeStaffRole,
  inviteStaff,
  revokeInvitation,
  setStaffActive,
} from "@/app/dashboard/personal/actions";
import { fill, type Dictionary } from "@/lib/i18n";
import type { StaffInvitation, StaffMember } from "@/lib/staff-admin";

/**
 * Personallistan och inbjudningarna.
 *
 * Vilka roller som går att välja avgörs av den egna: en chef kan bjuda in
 * servitör och kock men inte en till chef, och kan därför inte höja sig själv
 * via en omväg. Samma regel står i databasen (`can_grant_role`, migration
 * 0046) och det är DEN som gäller — listan här finns för att inte visa val som
 * ändå kommer att nekas.
 */

const ALL_ROLES: readonly StaffRole[] = ["owner", "manager", "staff", "kitchen"];

function grantableBy(role: StaffRole): readonly StaffRole[] {
  if (role === "owner") return ALL_ROLES;
  if (role === "manager") return ["staff", "kitchen"];
  return [];
}

export function StaffAdmin({
  members,
  invitations,
  myRole,
  roleLabels,
  labels,
  dateTag,
}: {
  members: StaffMember[];
  invitations: StaffInvitation[];
  myRole: StaffRole;
  /** Rollernas namn ur ordboken. Rena strängar — komponenten är klientkod. */
  roleLabels: Record<StaffRole, string>;
  labels: Dictionary["staff"]["staffAdmin"];
  /** Läsarens datumformat, t.ex. "bs-BA". Inbjudans sista dag skrivs med det. */
  dateTag: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("staff");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const grantable = grantableBy(myRole);

  function run(fn: () => Promise<{ ok: boolean; message?: string; link?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? labels.actionFailed);
        return;
      }
      if (result.link) {
        setLink(result.link);
        setEmail("");
        setCopied(false);
      }
    });
  }

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-[var(--radius)] bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}

      <section className="card p-4">
        <h2 className="font-display text-xl">{labels.inviteTitle}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {labels.inviteHint}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1">
            <span className="label-caps">{labels.email}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              placeholder={labels.emailPlaceholder}
              className="field mt-1.5"
            />
          </label>

          <label className="min-w-40">
            <span className="label-caps">{labels.role}</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as StaffRole)}
              className="field mt-1.5"
            >
              {grantable.map((option) => (
                <option key={option} value={option}>
                  {roleLabels[option]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={pending || email.trim() === ""}
            onClick={() => run(() => inviteStaff(email, role))}
            className="btn btn-primary"
          >
            <UserPlus size={16} aria-hidden="true" />
            {labels.invite}
          </button>
        </div>

        {/*
          Länken visas även när brevet gått iväg.

          Utan verifierad avsändardomän skickas ingenting alls — brevet hamnar
          bara i loggen — och en restaurang ska kunna anställa någon ändå. Att
          kunna klistra in länken i ett sms är dessutom snabbare än att förklara
          varför mailet ligger i skräpposten.
        */}
        {link ? (
          <div className="mt-4 rounded-[var(--radius)] border border-[var(--rule)] p-3">
            <p className="text-sm font-medium">{labels.inviteCreated}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {labels.inviteSendYourself}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-[var(--background)] px-2 py-1 text-xs">
                {link}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
                className="btn btn-secondary min-h-9 text-sm"
              >
                {copied ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                {copied ? labels.copied : labels.copy}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {invitations.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">{labels.pendingTitle}</h2>
          <ul className="card mt-3 divide-y divide-[var(--rule)]">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{invitation.email}</p>
                  <p className="label-caps mt-0.5 normal-case">
                    {roleLabels[invitation.role]} ·{" "}
                    {fill(labels.validUntil, {
                      date: new Date(invitation.expiresAt).toLocaleDateString(dateTag),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => revokeInvitation(invitation.id))}
                  className="btn btn-secondary min-h-9 text-sm"
                >
                  {labels.revoke}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-2xl">{labels.membersTitle}</h2>
        <ul className="card mt-3 divide-y divide-[var(--rule)]">
          {members.map((member) => {
            // Bara roller inom räckhåll går att sätta, och den egna raden är
            // låst: ingen ska kunna stänga av sig själv av misstag mitt i ett
            // pass. Databasen stoppar det också, men ett fel är sämre än en
            // knapp som inte finns.
            const editable = grantable.includes(member.role) && !member.isMe;

            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {member.fullName ?? member.email}
                    {member.isMe ? (
                      <span className="ml-2 text-sm font-normal text-[var(--muted)]">{labels.you}</span>
                    ) : null}
                  </p>
                  <p className="label-caps mt-0.5 normal-case">
                    {member.fullName ? `${member.email} · ` : ""}
                    {roleLabels[member.role]}
                    {member.isActive ? "" : ` · ${labels.ended}`}
                  </p>
                </div>

                {editable ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={member.role}
                      disabled={pending || !member.isActive}
                      onChange={(event) =>
                        run(() => changeStaffRole(member.userId, event.target.value as StaffRole))
                      }
                      className="field min-h-9 w-auto py-1 text-sm"
                    >
                      {grantable.map((option) => (
                        <option key={option} value={option}>
                          {roleLabels[option]}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setStaffActive(member.userId, !member.isActive))}
                      className="btn btn-secondary min-h-9 text-sm"
                    >
                      {member.isActive ? labels.end : labels.resume}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-sm text-[var(--muted)]">
          En avslutad anställning tas aldrig bort, bara stängd av. Raden är det som kopplar en
          kvitterad nota till en människa — försvinner den tappar Händelser sitt svar på vem.
        </p>
      </section>
    </>
  );
}
