"use client";

import { useState, useTransition } from "react";
import type { ReservationPolicy } from "@burp/core";
import type { Dictionary } from "@/lib/i18n";
import { saveReservationPolicy } from "@/app/dashboard/installningar/actions";

/**
 * Bokningsreglerna.
 *
 * ── Varför av är standardläget ──────────────────────────────────────────────
 *
 * En restaurang som inte bett om bokning ska inte plötsligt ta emot den. Tomma
 * bord klockan sju för gäster som aldrig dök upp är ett dyrare misstag än en
 * knapp som saknas — och den som slår på det ska ha gjort det med avsikt.
 *
 * ── Varför fälten inte nekar ────────────────────────────────────────────────
 *
 * Värdena kläms av `parseReservationPolicy()` i @burp/core innan de sparas.
 * 500 minuters bordstid är inget någon MENAR, och ett felmeddelande om det
 * hjälper ingen — men 5000 ska inte kunna hamna i databasen.
 */
export function ReservationSettings({
  initial,
  labels,
}: {
  initial: ReservationPolicy;
  labels: Dictionary["staff"]["settings"];
}) {
  const [policy, setPolicy] = useState(initial);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ReservationPolicy>(key: K, value: ReservationPolicy[K]) {
    setPolicy((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveReservationPolicy({
        enabled: policy.enabled,
        durationMinutes: policy.durationMinutes,
        graceMinutes: policy.graceMinutes,
        leadMinutes: policy.leadMinutes,
        horizonDays: policy.horizonDays,
        maxPartySize: policy.maxPartySize,
      });

      setFeedback({
        ok: result.ok,
        message: result.ok ? labels.saved : (result.message ?? labels.saveFailed),
      });
    });
  }

  return (
    <div className="card mt-4 p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={policy.enabled}
          onChange={(event) => set("enabled", event.target.checked)}
          className="mt-1 accent-burp-600"
        />
        <span>
          <span className="block font-medium">{labels.reservationEnabled}</span>
          <span className="block text-sm text-[var(--muted)]">
            {labels.reservationEnabledHint}
          </span>
        </span>
      </label>

      {/* Reglerna visas bara när bokning är på. En restaurang som inte tar emot
          bokningar behöver inte fundera på hur länge ett bord hålls. */}
      {policy.enabled ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label={labels.reservationDuration}
            hint={labels.reservationDurationHint}
            value={policy.durationMinutes}
            min={30}
            max={360}
            onChange={(value) => set("durationMinutes", value)}
          />
          <Field
            label={labels.reservationGrace}
            hint={labels.reservationGraceHint}
            value={policy.graceMinutes}
            min={0}
            max={120}
            onChange={(value) => set("graceMinutes", value)}
          />
          <Field
            label={labels.reservationLead}
            hint={labels.reservationLeadHint}
            value={policy.leadMinutes}
            min={0}
            max={10080}
            onChange={(value) => set("leadMinutes", value)}
          />
          <Field
            label={labels.reservationHorizon}
            hint={labels.reservationHorizonHint}
            value={policy.horizonDays}
            min={1}
            max={365}
            onChange={(value) => set("horizonDays", value)}
          />
          <Field
            label={labels.reservationMaxParty}
            hint={labels.reservationMaxPartyHint}
            value={policy.maxPartySize}
            min={1}
            max={50}
            onChange={(value) => set("maxPartySize", value)}
          />
        </div>
      ) : null}

      {feedback ? (
        <p
          role="status"
          className={`mt-4 text-sm ${feedback.ok ? "text-green-700" : "text-burp-700 dark:text-burp-100"}`}
        >
          {feedback.message}
        </p>
      ) : null}

      <button type="button" onClick={save} disabled={pending} className="btn btn-secondary mt-5">
        {pending ? labels.saving : labels.save}
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="label-caps">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="field mt-1.5 w-28"
      />
      <span className="mt-1 block text-sm text-[var(--muted)]">{hint}</span>
    </label>
  );
}
