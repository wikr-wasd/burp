"use client";

import { useState, useTransition } from "react";
import { AlarmClock, Check, UserX, X } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { fill } from "@/lib/i18n";
import { setReservationStatus } from "@/app/dashboard/bokningar/actions";

/**
 * Dagens bokningar.
 *
 * ── Varför "kom" är den viktigaste knappen ──────────────────────────────────
 *
 * Karensen släpper bordet när bokningens tid passerat utan att någon satt sig
 * (migration 0054). Utan den här knappen släpps alltså bord 6 klockan 19:15
 * trots att sällskapet sitter vid det — och nästa gäst kan boka det mitt under
 * deras måltid. Raden markeras därför tydligt när karensen börjar närma sig.
 *
 * ── Varför inte en automatisk NO_SHOW ───────────────────────────────────────
 *
 * Raden står kvar som BOOKED tills en människa säger något annat. Ett bord som
 * släpps är en fråga om kapacitet just nu; att någon UTEBLEV är ett påstående
 * om en gäst, och det ska en människa göra.
 */

export interface BookingRow {
  id: string;
  startsAt: string;
  tableNumber: string;
  zone: string | null;
  partySize: number;
  guestName: string;
  guestPhone: string | null;
  note: string | null;
  /**
   * Gästens egna ord, när `note` är en översättning av dem.
   *
   * En svensk gäst som bokar bord i Sarajevo skriver "vi är två i rullstol"
   * på svenska. Det är just den text restaurangen behöver förstå INNAN gästen
   * kommer. Null när ingenting översattes; se `lib/translate-notes.ts`.
   */
  noteOriginal: string | null;
  status: string;
  /** Sant när karensen gått och bordet inte längre hålls. */
  released: boolean;
}

export function BookingBoard({
  rows,
  translationLabels,
  timeZone,
  localeTag,
  labels,
  statusLabels,
}: {
  rows: BookingRow[];
  timeZone: string;
  localeTag: string;
  labels: Dictionary["staff"]["bookings"];
  /** Etiketten under en översatt anteckning. Samma två ord som köksskärmens. */
  translationLabels: Dictionary["staff"]["translation"];
  statusLabels: Dictionary["booking"]["status"];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const clock = new Intl.DateTimeFormat(localeTag, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });

  const day = new Intl.DateTimeFormat(localeTag, { timeZone, weekday: "short", day: "numeric", month: "short" });

  function change(id: string, status: "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW") {
    // Avbokning och utebliven ankomst går inte att ångra. Bekräftelse först.
    if (status !== "SEATED" && !window.confirm(labels.confirm)) return;

    setError(null);
    startTransition(async () => {
      const result = await setReservationStatus(id, status);
      if (!result.ok) setError(result.message ?? labels.failed);
    });
  }

  if (rows.length === 0) {
    return <p className="mt-6 text-[var(--muted)]">{labels.empty}</p>;
  }

  return (
    <div className="mt-6">
      {error ? (
        <p role="alert" className="mb-4 text-sm text-burp-700 dark:text-burp-100">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="card p-4">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="min-w-0">
                <p className="text-2xl font-semibold tabular-nums">
                  {clock.format(new Date(row.startsAt))}
                </p>
                <p className="label-caps mt-0.5">{day.format(new Date(row.startsAt))}</p>
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {row.guestName} · {fill(labels.party, { n: String(row.partySize) })}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {fill(labels.table, { number: row.tableNumber })}
                  {row.zone ? ` · ${row.zone}` : ""}
                  {row.guestPhone ? ` · ${row.guestPhone}` : ""}
                </p>
                {row.note ? (
                  <>
                    <p className="mt-1 text-sm italic">{row.note}</p>
                    {row.noteOriginal ? (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {row.noteOriginal} · {translationLabels.auto}
                      </p>
                    ) : null}
                  </>
                ) : null}

                {/* Karensen har gått: bordet är bokningsbart igen, och den som
                    står i lokalen behöver veta det innan hen jagar bort någon. */}
                {row.released && row.status === "BOOKED" ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                    <AlarmClock size={14} aria-hidden="true" />
                    {labels.released}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {row.status === "BOOKED" ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => change(row.id, "SEATED")}
                      className="btn btn-primary"
                    >
                      <Check size={16} aria-hidden="true" />
                      {labels.seat}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => change(row.id, "NO_SHOW")}
                      className="btn btn-secondary"
                    >
                      <UserX size={16} aria-hidden="true" />
                      {labels.noShow}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => change(row.id, "CANCELLED")}
                      className="btn btn-secondary"
                    >
                      <X size={16} aria-hidden="true" />
                      {labels.cancel}
                    </button>
                  </>
                ) : row.status === "SEATED" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => change(row.id, "COMPLETED")}
                    className="btn btn-secondary"
                  >
                    {labels.complete}
                  </button>
                ) : (
                  <span className="label-caps self-center">
                    {statusLabels[row.status as keyof typeof statusLabels] ?? row.status}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
