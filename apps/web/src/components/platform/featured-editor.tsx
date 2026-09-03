"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { addFeatured, removeFeatured } from "@/app/backoffice/actions";

/**
 * Burps utvalda i en stad.
 *
 * Urvalet gäller ett OMRÅDE och inte en restaurang: den som tittar i Mostar
 * ska kunna få andra ställen än den som tittar i Beograd, och samma restaurang
 * kan vara utvald i flera städer — ett ställe i Sarajevo är mycket väl värt en
 * resa för den som bor i Zenica.
 *
 * Listan är INTE en popularitetslista. Den visas för gästen under sin egen
 * rubrik, skild från "andra sparade också" som räknas ur riktiga favoriter.
 */

export interface FeaturedRow {
  id: string;
  restaurantId: string;
  name: string;
  city: string;
  note: string | null;
}

export interface Choice {
  id: string;
  name: string;
  city: string;
}

export function FeaturedEditor({
  citySlug,
  featured,
  choices,
  canWrite,
}: {
  citySlug: string;
  featured: FeaturedRow[];
  /** Restauranger som går att välja. Alla städer — ett urval får peka utanför. */
  choices: Choice[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const alreadyFeatured = new Set(featured.map((row) => row.restaurantId));
  const available = choices.filter((row) => !alreadyFeatured.has(row.id));

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setError(null);
        setChoice("");
        setNote("");
        router.refresh();
      } else {
        setError(result.message ?? "Åtgärden misslyckades.");
      }
    });
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {featured.length === 0 ? (
        <p className="mt-4 text-sm opacity-60">Inga utvalda i den här staden än.</p>
      ) : (
        <ul className="card mt-4 divide-y divide-[var(--rule)]">
          {featured.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block text-sm opacity-60">
                  {row.city}
                  {row.note ? ` · ${row.note}` : ""}
                </span>
              </span>

              {canWrite ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeFeatured(row.id))}
                  aria-label={`Ta bort ${row.name}`}
                  className="btn btn-secondary shrink-0"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <div className="mt-6 max-w-md space-y-3">
          <label className="block">
            <span className="label-caps">Lägg till</span>
            <select
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              disabled={pending}
              className="field mt-1.5"
            >
              <option value="">Välj restaurang…</option>
              {available.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} — {row.city}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label-caps">Varför</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Bästa ćevapi i gamla stan"
              maxLength={120}
              disabled={pending}
              className="field mt-1.5"
            />
            {/* Ett urval utan skäl blir en lista ingen vågar ändra i om ett
                halvår. Skälet syns bara här, aldrig för gästen. */}
            <span className="mt-1 block text-xs opacity-60">
              Syns bara i backoffice.
            </span>
          </label>

          <button
            type="button"
            disabled={pending || choice === ""}
            onClick={() => run(() => addFeatured(citySlug, choice, note))}
            className="btn btn-primary"
          >
            Lägg till i urvalet
          </button>
        </div>
      ) : null}
    </>
  );
}
