import type { DayKey, OpeningHours } from "@/lib/discovery-format";

/**
 * Veckans öppettider, alla sju dagar.
 *
 * Restaurangsidan visade bara dagens tider. Det räcker för en gäst som står
 * utanför dörren, men inte för den som planerar — och planerande gäster är
 * hela poängen med att restaurangen har en egen sida. En stängd dag skrivs ut
 * som "Stängt" i stället för att utelämnas: en rad som saknas läser som att
 * någon glömt fylla i, inte som att det är stängt.
 */

const DAYS: readonly { key: DayKey; label: string }[] = [
  { key: "mon", label: "Måndag" },
  { key: "tue", label: "Tisdag" },
  { key: "wed", label: "Onsdag" },
  { key: "thu", label: "Torsdag" },
  { key: "fri", label: "Fredag" },
  { key: "sat", label: "Lördag" },
  { key: "sun", label: "Söndag" },
];

/** Namn enligt schema.org, för `openingHoursSpecification`. */
export const SCHEMA_DAY: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * Plattar ut öppettiderna till schema.org:s form.
 *
 * Låg tidigare som en tom lista i markupen med en TODO bredvid. Google visar
 * öppettider direkt i sökträffen när de finns — att lämna dem tomma är att
 * tacka nej till den ytan.
 */
export function toSchemaOpeningHours(
  hours: OpeningHours | null,
): { dayOfWeek: string; opens: string; closes: string }[] {
  if (!hours) return [];

  return DAYS.flatMap(({ key }) =>
    (hours[key] ?? []).map((span) => ({
      dayOfWeek: SCHEMA_DAY[key],
      opens: span.opens,
      closes: span.closes,
    })),
  );
}

export function OpeningHoursWeek({
  hours,
  /** Dagens nyckel, så att raden går att markera. Utelämnas på cachade sidor. */
  today,
}: {
  hours: OpeningHours | null;
  today?: DayKey;
}) {
  if (!hours) {
    return <p className="text-[var(--muted)]">Öppettider saknas.</p>;
  }

  return (
    <dl className="divide-y divide-[var(--rule)]">
      {DAYS.map(({ key, label }) => {
        const spans = hours[key] ?? [];
        const isToday = key === today;

        return (
          <div
            key={key}
            className={`flex justify-between gap-4 py-2.5 ${isToday ? "text-burp-600" : ""}`}
          >
            <dt className={isToday ? "font-medium" : ""}>{label}</dt>
            <dd className={`tabular-nums ${isToday ? "" : "text-[var(--muted)]"}`}>
              {spans.length === 0
                ? "Stängt"
                : spans.map((span) => `${span.opens}–${span.closes}`).join(", ")}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
