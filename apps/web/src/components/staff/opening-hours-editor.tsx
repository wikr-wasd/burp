"use client";

import { useState, useTransition } from "react";
import {
  daySlots,
  crossesMidnight,
  describeDay,
  WEEKDAY_KEYS,
  type OpeningHours,
  type WeekdayKey,
} from "@burp/core";
import { saveOpeningHours } from "@/app/dashboard/installningar/actions";
import type { Dictionary } from "@/lib/i18n";

/**
 * Öppettidsredigeraren.
 *
 * Ändringar samlas lokalt och sparas med en knapp, till skillnad från
 * menyredigeraren där varje fält sparas när det lämnas. Skälet är att
 * öppettider valideras som en helhet — ett överlapp finns mellan två pass, inte
 * i ett av dem, och att spara halvvägs skulle avvisas utan att det syntes var.
 */
export function OpeningHoursEditor({
  initial,
  weekdayLabels,
  labels,
}: {
  initial: OpeningHours;
  /** Veckodagarna ur ordboken. Rena strängar — komponenten är klientkod. */
  weekdayLabels: Record<WeekdayKey, string>;
  /** Inställningarnas texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["settings"];
}) {
  const [hours, setHours] = useState<OpeningHours>(initial);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const dirty = JSON.stringify(hours) !== JSON.stringify(initial);

  function update(day: WeekdayKey, slots: OpeningHours[WeekdayKey]) {
    setHours((current) => ({ ...current, [day]: slots }));
    setFeedback(null);
  }

  function save() {
    startTransition(async () => {
      const result = await saveOpeningHours(hours);
      setFeedback({
        ok: result.ok,
        message: result.ok ? labels.hoursSaved : (result.message ?? labels.saveFailed),
      });
    });
  }

  return (
    <div className="mt-4">
      <ul className="card divide-y divide-[var(--rule)]">
        {WEEKDAY_KEYS.map((day) => (
          <li key={day} className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{weekdayLabels[day]}</p>
              <p className="text-sm opacity-60">{describeDay(daySlots(hours, day))}</p>
            </div>

            <div className="mt-2 space-y-2">
              {daySlots(hours, day).map((slot, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${weekdayLabels[day]} öppnar, pass ${index + 1}`}
                    value={slot.opens}
                    onChange={(event) =>
                      update(
                        day,
                        daySlots(hours, day).map((existing, i) =>
                          i === index ? { ...existing, opens: event.target.value } : existing,
                        ),
                      )
                    }
                    className="min-h-11 border border-[var(--rule)] bg-transparent px-3"
                  />
                  <span aria-hidden="true" className="opacity-60">
                    –
                  </span>
                  <input
                    type="time"
                    aria-label={`${weekdayLabels[day]} stänger, pass ${index + 1}`}
                    value={slot.closes}
                    onChange={(event) =>
                      update(
                        day,
                        daySlots(hours, day).map((existing, i) =>
                          i === index ? { ...existing, closes: event.target.value } : existing,
                        ),
                      )
                    }
                    className="min-h-11 border border-[var(--rule)] bg-transparent px-3"
                  />
                  {/* Ett nattpass ser ut som ett skrivfel tills någon säger att
                      det inte är det. Märkningen står bredvid sluttiden, där
                      tvivlet uppstår. */}
                  {crossesMidnight(slot) ? (
                    <span className="text-xs whitespace-nowrap opacity-60">{labels.nextDay}</span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Ta bort pass ${index + 1} på ${weekdayLabels[day]}`}
                    onClick={() =>
                      update(
                        day,
                        daySlots(hours, day).filter((_, i) => i !== index),
                      )
                    }
                    className="min-h-11 border border-[var(--rule)] px-3 text-sm"
                  >
                    {labels.remove}
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  update(day, [
                    ...daySlots(hours, day),
                    // Ett tomt pass utan tider hade sparats bort av parsern
                    // utan att någon förstod varför. Förifyllda tider gör att
                    // raden betyder något direkt.
                    daySlots(hours, day).length === 0
                      ? { opens: "11:00", closes: "22:00" }
                      : { opens: "17:00", closes: "22:00" },
                  ])
                }
                className="min-h-11 border border-[var(--rule)] px-4 text-sm"
              >
                {daySlots(hours, day).length === 0 ? labels.openThisDay : labels.addShift}
              </button>

              {daySlots(hours, day).length > 0 ? (
                <button
                  type="button"
                  onClick={() => update(day, [])}
                  className="ml-2 min-h-11 border border-[var(--rule)] px-4 text-sm"
                >
                  {labels.closedAllDay}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {feedback ? (
        <p
          role="alert"
          className={`mt-3 px-3 py-2 text-sm ${
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
        onClick={save}
        className="btn btn-primary mt-4"
      >
        {pending ? labels.saving : dirty ? labels.saveHours : labels.nothingToSave}
      </button>
    </div>
  );
}
