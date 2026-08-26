"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { addStop, createRoute } from "@/app/konto/rutter/actions";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * "Lägg till {restaurang} i en rutt."
 *
 * ── Varför den här ligger på kontosidan och inte på restaurangsidan ─────────
 *
 * Restaurangsidan är cachad en timme för SEO:ns skull. Vilka rutter EN viss
 * gäst har går därför inte att rendera där — den första besökarens rutter hade
 * blivit allas. Knappen på restaurangsidan är i stället en länk hit, med
 * restaurangens id i adressen, och valet görs på en yta som ändå är personlig.
 *
 * Det är samma resonemang som gör att kvitton och kontoytor läser
 * `Accept-Language` i stället för att ha språket i URL:en: cachade ytor och
 * personliga ytor är olika saker, och att blanda dem är hur en gäst får se
 * någon annans data.
 */
export function AddToRoute({
  restaurantId,
  restaurantName,
  routes,
  labels,
}: {
  restaurantId: string;
  restaurantName: string;
  routes: { id: string; name: string }[];
  labels: Dictionary["routes"];
}) {
  const router = useRouter();

  const [added, setAdded] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(routeId: string) {
    setError(null);
    startTransition(async () => {
      const result = await addStop(routeId, restaurantId);
      if (result.ok) setAdded(routeId);
      else setError(result.message ?? labels.failed);
    });
  }

  function addToNew(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const created = await createRoute(newName);

      if (!created.ok || !created.routeId) {
        setError(created.message ?? labels.failed);
        return;
      }

      const result = await addStop(created.routeId, restaurantId);

      if (!result.ok) {
        setError(result.message ?? labels.failed);
        return;
      }

      router.push(`/konto/rutter/${created.routeId}`);
    });
  }

  return (
    <section className="card mt-6 p-4">
      <p className="font-medium">{fill(labels.addTo, { name: restaurantName })}</p>

      {routes.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {routes.map((route) => (
            <li key={route.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => add(route.id)}
                className={`chip ${added === route.id ? "chip-active" : ""}`}
              >
                {added === route.id ? (
                  <Check size={14} aria-hidden="true" className="mr-1 inline" />
                ) : null}
                {route.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={addToNew} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex-1 basis-52">
          <span className="label-caps">{labels.newRoute}</span>
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
            maxLength={120}
            placeholder={labels.newRoutePlaceholder}
            className="field mt-1.5"
          />
        </label>

        <button
          type="submit"
          disabled={pending || newName.trim() === ""}
          className="btn btn-secondary"
        >
          <Plus size={16} aria-hidden="true" />
          {labels.create}
        </button>
      </form>

      {added ? (
        <p role="status" className="mt-3 text-sm text-green-700">
          {labels.added}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-burp-700 dark:text-burp-100">
          {error}
        </p>
      ) : null}
    </section>
  );
}
