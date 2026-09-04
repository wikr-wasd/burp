import { Store, MapPin, ReceiptText, Star } from "lucide-react";
import { fill, LOCALE_TAGS, type Dictionary, type Locale } from "@/lib/i18n";
import {
  MIN_ACTIVITY_ROWS,
  PULSE_THRESHOLDS,
  type PlatformPulse,
  type PulseEntry,
} from "@/lib/activity";

/**
 * Pulsen på startsidan: att det här är en marknadsplats i drift.
 *
 * Allt som står här är räknat ur databasen. Inget tal är påhittat, inget är
 * uppräknat, och ingen rad är en "exempelbeställning" — se `lib/activity.ts`
 * och migration 0073.
 *
 * ── Vad som händer när siffrorna är små ────────────────────────────────────
 *
 * Talet utelämnas. "1 beställning den här veckan" säger tvärtom att här är
 * tomt, och en påhittad siffra i dess ställe är genomskådad första gången
 * någon räknar restaurangerna i listan nedanför. Blir ingenting kvar att visa
 * ritas hela avsnittet inte alls — en tom ruta med en rubrik är sämre än
 * ingen ruta.
 *
 * Serverkomponent: siffrorna är samma för alla och behöver ingen webbläsare.
 */

export function PlatformPulseStrip({
  pulse,
  activity,
  openNow,
  labels,
  locale,
}: {
  pulse: PlatformPulse | null;
  activity: PulseEntry[];
  /** Räknas redan fram för listan nedanför — ingen extra fråga för den här. */
  openNow: number;
  labels: Dictionary["pulse"];
  /** Decimaltecknet i betyget följer läsarens språk, inte serverns. */
  locale: Locale;
}) {
  if (!pulse) return null;

  const stats: { icon: typeof Store; text: string }[] = [];

  if (pulse.restaurants >= PULSE_THRESHOLDS.restaurants) {
    stats.push({ icon: Store, text: fill(labels.restaurants, { n: pulse.restaurants }) });
  }

  if (pulse.cities >= PULSE_THRESHOLDS.cities) {
    stats.push({ icon: MapPin, text: fill(labels.cities, { n: pulse.cities }) });
  }

  /*
   * Öppet nu står med även när det är noll — men bara som en av flera rader.
   *
   * Klockan tre på natten ÄR allt stängt, och det är ett ärligt svar på en
   * fråga gästen faktiskt ställer. Noll döljs ändå: raden hade blivit den
   * enda som syns i en lista där resten är utelämnat, alltså den starkaste
   * signalen på sidan.
   */
  if (openNow > 0) {
    stats.push({ icon: Store, text: fill(labels.openNow, { n: openNow }) });
  }

  if (pulse.ordersWeek >= PULSE_THRESHOLDS.ordersWeek) {
    stats.push({ icon: ReceiptText, text: fill(labels.ordersWeek, { n: pulse.ordersWeek }) });
  }

  if (pulse.rating !== null && pulse.reviews >= PULSE_THRESHOLDS.reviews) {
    stats.push({
      icon: Star,
      text: fill(labels.rating, {
        rating: pulse.rating.toLocaleString(LOCALE_TAGS[locale], { minimumFractionDigits: 1 }),
        n: pulse.reviews,
      }),
    });
  }

  const rows = activity.slice(0, 5);
  const showActivity = rows.length >= MIN_ACTIVITY_ROWS;

  if (stats.length === 0 && !showActivity) return null;

  return (
    <section className="mt-8" aria-label={labels.title}>
      <div className="card grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="label-caps">{labels.title}</h2>

          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {stats.map((stat) => (
              <li key={stat.text} className="flex items-center gap-2 text-sm">
                <stat.icon size={16} aria-hidden="true" className="text-burp-600" />
                <span className="tabular-nums">{stat.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {showActivity ? (
          <ul className="space-y-1.5 lg:border-l lg:border-[var(--rule)] lg:pl-6">
            {rows.map((entry, index) => (
              <li
                key={`${entry.dish}-${entry.city}-${index}`}
                className="flex items-baseline gap-2 text-sm"
              >
                {/* Pricken är det enda på sidan som får se levande ut, och den
                    står bara här därför att raderna FAKTISKT är från det
                    senaste dygnet. */}
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-burp-600"
                />
                <span className="min-w-0 truncate">
                  {entry.dish}
                  <span className="text-[var(--muted)]"> · {entry.city}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs whitespace-nowrap text-[var(--muted)] tabular-nums">
                  {entry.minutesAgo < 1 ? labels.justNow : fill(labels.ago, { n: entry.minutesAgo })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
