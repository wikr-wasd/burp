"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createRoute } from "@/app/konto/rutter/actions";
import type { Dictionary } from "@/lib/i18n";

/**
 * Skapar en rutt och går direkt in i den.
 *
 * Att stanna kvar i listan efter att ha tryckt "Ny rutt" hade betytt att man
 * skapar något tomt och sedan måste hitta det. Nästa steg är alltid att lägga
 * till ett ställe.
 */
export function RouteCreator({ labels }: { labels: Dictionary["routes"] }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createRoute(name);

      if (!result.ok || !result.routeId) {
        setError(result.message ?? labels.failed);
        return;
      }

      setName("");
      router.push(`/konto/rutter/${result.routeId}`);
    });
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-wrap items-end gap-3">
      <label className="flex-1 basis-52">
        <span className="label-caps">{labels.newRoute}</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
          placeholder={labels.newRoutePlaceholder}
          className="field mt-1.5"
        />
      </label>

      <button type="submit" disabled={pending || name.trim() === ""} className="btn btn-primary">
        <Plus size={16} aria-hidden="true" />
        {pending ? labels.creating : labels.create}
      </button>

      {error ? (
        <p role="alert" className="basis-full text-sm text-burp-700 dark:text-burp-100">
          {error}
        </p>
      ) : null}
    </form>
  );
}
