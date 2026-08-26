"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, MapPin, Trash2 } from "lucide-react";
import { deleteRoute, moveStop, removeStop, renameRoute } from "@/app/konto/rutter/actions";
import type { RouteDetail } from "@/lib/routes";
import { fill, type Dictionary, type Locale } from "@/lib/i18n";

/**
 * Rutten: namn, stopp i ordning, och vägen mellan dem.
 *
 * ── Varför ordningen är gästens ─────────────────────────────────────────────
 *
 * Kortaste vägen mellan fem ställen är ett problem med en lösning; kvällen
 * gästen vill ha är det inte. Den som vill äta efterrätt sist ska få göra det
 * även när bageriet ligger närmast — därför pilar och ingen automatisk
 * sortering.
 *
 * ── Varför avståndet står som fågelväg ──────────────────────────────────────
 *
 * En gångväg kräver en ruttberäkningstjänst, ett avtal och en kostnad per
 * anrop. Fågelvägen mellan två ställen i Baščaršija är ändå rätt
 * storleksordning, och etiketten säger vad talet är i stället för att låtsas.
 */
export function RouteEditor({
  route,
  locale,
  labels,
}: {
  route: RouteDetail;
  locale: Locale;
  labels: Dictionary["routes"];
}) {
  const router = useRouter();

  const [name, setName] = useState(route.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? labels.failed);
    });
  }

  function saveName() {
    const trimmed = name.trim();
    if (trimmed === "" || trimmed === route.name) {
      setName(route.name);
      return;
    }
    run(() => renameRoute(route.id, trimmed));
  }

  function remove() {
    if (!window.confirm(labels.deleteConfirm)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteRoute(route.id);
      if (result.ok) router.push("/konto/rutter");
      else setError(result.message ?? labels.failed);
    });
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{labels.newRoute}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
            maxLength={120}
            className="font-display w-full border-b border-transparent bg-transparent text-4xl focus:border-[var(--rule-control)] focus:outline-none"
          />
        </label>

        <button type="button" onClick={remove} disabled={pending} className="btn btn-secondary">
          <Trash2 size={16} aria-hidden="true" />
          {labels.delete}
        </button>
      </div>

      {route.totalMeters !== null ? (
        <p className="mt-3 text-[var(--muted)]">
          {fill(labels.totalDistance, { distance: formatDistance(route.totalMeters) })}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-burp-700 dark:text-burp-100">
          {error}
        </p>
      ) : null}

      {route.stops.length === 0 ? (
        <p className="mt-10 text-[var(--muted)]">{labels.noStops}</p>
      ) : (
        <ol className="mt-8 space-y-3">
          {route.stops.map((stop, index) => (
            <li key={stop.id} className="card p-4">
              {/* Sträckan står MELLAN stoppen och inte på dem: den hör till
                  vägen dit, inte till stället. */}
              {stop.metersFromPrevious !== null ? (
                <p className="label-caps mb-3 flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden="true" />
                  {fill(labels.fromPrevious, {
                    distance: formatDistance(stop.metersFromPrevious),
                  })}
                </p>
              ) : null}

              <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                <span className="font-display text-2xl tabular-nums text-[var(--muted)]">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${locale}/r/${stop.citySlug}/${stop.slug}`}
                    className="font-display text-xl hover:text-burp-600"
                  >
                    {stop.name}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {[stop.cuisines.join(" · "), stop.city].filter(Boolean).join(" · ")}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveStop(route.id, stop.id, "up"))}
                    aria-label={fill(labels.moveUp, { name: stop.name })}
                    className="grid h-11 w-11 place-items-center border border-[var(--rule)] disabled:opacity-40"
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={pending || index === route.stops.length - 1}
                    onClick={() => run(() => moveStop(route.id, stop.id, "down"))}
                    aria-label={fill(labels.moveDown, { name: stop.name })}
                    className="grid h-11 w-11 place-items-center border border-[var(--rule)] disabled:opacity-40"
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => removeStop(route.id, stop.id))}
                    aria-label={fill(labels.removeStop, { name: stop.name })}
                    className="grid h-11 w-11 place-items-center border border-[var(--rule)]"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-8 text-sm text-[var(--muted)]">{labels.addHint}</p>
    </>
  );
}

/** Under en kilometer i meter, däröver med en decimal. */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
