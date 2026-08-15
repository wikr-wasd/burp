"use client";

import { useState, useTransition } from "react";
import { ORDER_STATUS_LABELS, type OrderPolicy, type OrderStatus } from "@burp/core";
import { saveOrderPolicy } from "@/app/dashboard/installningar/actions";

/**
 * Orderreglerna (avsnitt 5.2).
 *
 * Reglerna körs på servern. Den här vyn skriver dem, men avgör ingenting —
 * en gäst som anropar API:t direkt möter exakt samma spärrar.
 */

/** Statusarna det är meningsfullt att sätta som gräns. */
const LIMIT_STATUSES: OrderStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY"];

export function OrderPolicyEditor({ initial }: { initial: OrderPolicy }) {
  const [policy, setPolicy] = useState<OrderPolicy>(initial);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const dirty = JSON.stringify(policy) !== JSON.stringify(initial);

  function set<K extends keyof OrderPolicy>(key: K, value: OrderPolicy[K]) {
    setPolicy((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  return (
    <div className="mt-4 space-y-5 border border-[var(--rule)] p-4">
      <Toggle
        label="Ta emot beställningar automatiskt"
        hint="Utan detta måste någon trycka Ta emot på varje order innan köket ser den."
        checked={policy.autoAccept}
        onChange={(value) => set("autoAccept", value)}
      />

      <Number
        label="Tillagningstid"
        suffix="minuter"
        hint="Används för att uppskatta väntetid åt gästen."
        value={policy.prepTimeMinutes}
        min={1}
        max={240}
        onChange={(value) => set("prepTimeMinutes", value)}
      />

      <Number
        label="Ändringsfönster"
        suffix="sekunder"
        hint="Hur länge efter beställning gästen får ändra innehållet. 0 stänger av ändringar helt."
        value={policy.editWindowSeconds}
        min={0}
        max={3600}
        onChange={(value) => set("editWindowSeconds", value)}
      />

      <StatusSelect
        label="Ändring tillåts till och med"
        hint="Efter den här statusen kan gästen inte längre ändra."
        value={policy.editableUntilStatus}
        onChange={(value) => set("editableUntilStatus", value)}
      />

      <div className="space-y-3">
        <Toggle
          label="Gästen får lägga till rätter"
          checked={policy.allowAddItems}
          onChange={(value) => set("allowAddItems", value)}
        />
        <Toggle
          label="Gästen får ta bort rätter"
          checked={policy.allowRemoveItems}
          onChange={(value) => set("allowRemoveItems", value)}
        />
        <Toggle
          label="Gästen får byta tillval"
          checked={policy.allowChangeOptions}
          onChange={(value) => set("allowChangeOptions", value)}
        />
      </div>

      <StatusSelect
        label="Avbokning tillåts till och med"
        hint="Avbokning styrs av status, inte av ändringsfönstret — en gäst ska kunna avboka så länge maten inte påbörjats."
        value={policy.allowCancelUntilStatus}
        onChange={(value) => set("allowCancelUntilStatus", value)}
      />

      <Toggle
        label="Ta emot förbeställningar"
        hint="Gästen väljer en tid i förväg. Ordern släpps till köket tillagningstiden innan."
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
              message: result.ok ? "Orderreglerna är sparade." : (result.message ?? "Kunde inte spara."),
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
}: {
  label: string;
  hint?: string;
  value: OrderStatus;
  onChange: (value: OrderStatus) => void;
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
            {ORDER_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </label>
  );
}
