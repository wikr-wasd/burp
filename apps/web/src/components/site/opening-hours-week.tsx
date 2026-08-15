import type { DayKey, OpeningHours } from "@/lib/discovery-format";
import { dictionary, type Locale } from "@/lib/i18n";

/**
 * Veckans öppettider, alla sju dagar.
 *
 * Restaurangsidan visade bara dagens tider. Det räcker för en gäst som står
 * utanför dörren, men inte för den som planerar — och planerande gäster är
 * hela poängen med att restaurangen har en egen sida. En stängd dag skrivs ut
 * som "Stängt" i stället för att utelämnas: en rad som saknas läser som att
 * någon glömt fylla i, inte som att det är stängt.
 */

/** Måndag först — så läser man ett veckoschema, oavsett vad Postgres tycker. */
const DAYS: readonly DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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

  return DAYS.flatMap((key) =>
    (hours[key] ?? []).map((span) => ({
      dayOfWeek: SCHEMA_DAY[key],
      opens: span.opens,
      closes: span.closes,
    })),
  );
}

export function OpeningHoursWeek({
  locale,
  hours,
  /** Dagens nyckel, så att raden går att markera. Utelämnas på cachade sidor. */
  today,
}: {
  locale: Locale;
  hours: OpeningHours | null;
  today?: DayKey;
}) {
  const t = dictionary(locale);

  if (!hours) {
    return <p className="text-[var(--muted)]">{t.restaurant.noOpeningHours}</p>;
  }

  return (
    <dl className="divide-y divide-[var(--rule)]">
      {DAYS.map((key) => {
        const spans = hours[key] ?? [];
        const isToday = key === today;

        return (
          <div
            key={key}
            className={`flex justify-between gap-4 py-2.5 ${isToday ? "text-burp-600" : ""}`}
          >
            <dt className={isToday ? "font-medium" : ""}>{t.weekday[key]}</dt>
            <dd className={`tabular-nums ${isToday ? "" : "text-[var(--muted)]"}`}>
              {spans.length === 0
                ? t.restaurant.closed
                : spans.map((span) => `${span.opens}–${span.closes}`).join(", ")}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
