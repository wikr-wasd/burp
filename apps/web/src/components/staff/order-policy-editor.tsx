"use client";

import { useState, useTransition } from "react";
import { type OrderPolicy, type OrderStatus } from "@burp/core";
import { saveOrderPolicy } from "@/app/dashboard/installningar/actions";
import type { Dictionary } from "@/lib/i18n";

/**
 * Orderreglerna (avsnitt 5.2).
 *
 * Reglerna körs på servern. Den här vyn skriver dem, men avgör ingenting —
 * en gäst som anropar API:t direkt möter exakt samma spärrar.
 */

/** Statusarna det är meningsfullt att sätta som gräns. */
const LIMIT_STATUSES: OrderStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY"];

export function OrderPolicyEditor({
  initial,
  statusLabels,
  labels,
}: {
  initial: OrderPolicy;
  /** Orderstatusarna ur ordboken. Rena strängar — komponenten är klientkod. */
  statusLabels: Record<OrderStatus, string>;
  /** Inställningarnas texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["settings"];
}) {
  const [policy, setPolicy] = useState<OrderPolicy>(initial);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const dirty = JSON.stringify(policy) !== JSON.stringify(initial);

  function set<K extends keyof OrderPolicy>(key: K, value: OrderPolicy[K]) {
    setPolicy((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  return (
    <div className="card mt-4 space-y-5 p-4">
      <Toggle
        label={labels.autoAccept}
        hint={labels.autoAcceptHint}
        checked={policy.autoAccept}
        onChange={(value) => set("autoAccept", value)}
      />

      <Number
        label={labels.prepTime}
        suffix={labels.prepTimeUnit}
        hint={labels.prepTimeHint}
        value={policy.prepTimeMinutes}
        min={1}
        max={240}
        onChange={(value) => set("prepTimeMinutes", value)}
      />

      <Number
        label={labels.editWindow}
        suffix={labels.editWindowUnit}
        hint={labels.editWindowHint}
        value={policy.editWindowSeconds}
        min={0}
        max={3600}
        onChange={(value) => set("editWindowSeconds", value)}
      />

      <StatusSelect
        label={labels.editUntil}
        hint={labels.editUntilHint}
        value={policy.editableUntilStatus}
        onChange={(value) => set("editableUntilStatus", value)}
        statusLabels={statusLabels}
      />

      <div className="space-y-3">
        <Toggle
          label={labels.mayAdd}
          checked={policy.allowAddItems}
          onChange={(value) => set("allowAddItems", value)}
        />
        <Toggle
          label={labels.mayRemove}
          checked={policy.allowRemoveItems}
          onChange={(value) => set("allowRemoveItems", value)}
        />
        <Toggle
          label={labels.mayChangeOptions}
          checked={policy.allowChangeOptions}
          onChange={(value) => set("allowChangeOptions", value)}
        />
      </div>

      <StatusSelect
        label={labels.cancelUntil}
        hint={labels.cancelUntilHint}
        value={policy.allowCancelUntilStatus}
        onChange={(value) => set("allowCancelUntilStatus", value)}
        statusLabels={statusLabels}
      />

      <Toggle
        label={labels.scheduled}
        hint={labels.scheduledHint}
        checked={policy.allowScheduledOrders}
        onChange={(value) => set("allowScheduledOrders", value)}
      />

      {feedback ? (
        <p
          role="alert"
          className={` px-3 py-2 text-sm ${
            feedback.ok
              ? "bg-green-600/10 text-green-700 dark:text-green-400"
              : "bg-red-600/10 text-red-700 dark:text-red-400"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <button
        type="button"
        disabled={pending || !dirty}
        onClick={() =>
          startTransition(async () => {
            const result = await saveOrderPolicy(policy);
            setFeedback({
              ok: result.ok,
              message: result.ok ? labels.policySaved : (result.message ?? labels.saveFailed),
            });
          })
        }
        className="min-h-12 bg-burp-600 px-5 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Sparar…" : dirty ? "Spara orderregler" : "Inget att spara"}
      </button>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-burp-600"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-sm opacity-60">{hint}</span> : null}
      </span>
    </label>
  );
}

function Number({
  label,
  suffix,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  suffix: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-sm opacity-60">{hint}</span> : null}
      <span className="mt-1 flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(globalThis.Number(event.target.value))}
          className="min-h-11 w-28 border border-[var(--rule)] bg-transparent px-3 tabular-nums"
        />
        <span className="text-sm opacity-60">{suffix}</span>
      </span>
    </label>
  );
}

function StatusSelect({
  label,
  hint,
  value,
  onChange,
  statusLabels,
}: {
  label: string;
  hint?: string;
  value: OrderStatus;
  onChange: (value: OrderStatus) => void;
  statusLabels: Record<OrderStatus, string>;
}) {
  return (
    <label className="block">
      <span className="font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-sm opacity-60">{hint}</span> : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as OrderStatus)}
        className="mt-1 min-h-11 border border-[var(--rule)] bg-transparent px-3"
      >
        {LIMIT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {statusLabels[status]}
          </option>
        ))}
      </select>
    </label>
  );
}
