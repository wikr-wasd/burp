"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DEFAULT_FEE_BPS } from "@burp/core";
import { setRestaurantFee, setRestaurantStatus } from "@/app/backoffice/actions";
import type { PlatformRestaurant } from "@/app/backoffice/restauranger/page";

/**
 * Restauranglistan i backoffice.
 *
 * Avstängning kräver bekräftelse. Det är den enda åtgärden här som omedelbart
 * stoppar någon annans intäkt, och den ska inte gå att utlösa med ett felklick.
 */
export function RestaurantList({
  restaurants,
  canWrite,
}: {
  restaurants: PlatformRestaurant[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.message ?? "Åtgärden misslyckades.");
    });
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {!canWrite ? (
        <p className="mt-4 rounded-md bg-black/5 px-3 py-2 text-sm opacity-70 dark:bg-white/10">
          Du är inloggad som support och kan läsa men inte ändra.
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {restaurants.map((restaurant) => (
          <li
            key={restaurant.id}
            className="rounded-xl border border-black/10 p-4 dark:border-white/15"
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="mr-auto min-w-0">
                <p className="font-semibold">{restaurant.name}</p>
                <p className="text-sm opacity-60">
                  {restaurant.city} · org.nr {restaurant.orgNumber} · {restaurant.staffCount}{" "}
                  {restaurant.staffCount === 1 ? "anställd" : "anställda"}
                </p>
                {restaurant.ratingCount > 0 && restaurant.ratingAverage !== null ? (
                  <p className="text-sm opacity-60">
                    {restaurant.ratingAverage.toFixed(1).replace(".", ",")} av 5 ·{" "}
                    {restaurant.ratingCount} omdömen
                  </p>
                ) : null}
              </div>

              <StatusBadge status={restaurant.status} />

              {restaurant.status === "ACTIVE" ? (
                <Link
                  href={`/r/${restaurant.citySlug}/${restaurant.slug}`}
                  className="text-sm underline underline-offset-4 opacity-60 hover:opacity-100"
                >
                  Visa publikt
                </Link>
              ) : null}
            </div>

            {canWrite ? (
              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-black/10 pt-4 dark:border-white/15">
                {restaurant.status === "PENDING" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setRestaurantStatus(restaurant.id, "ACTIVE"))}
                    className="min-h-11 rounded-md bg-burp-600 px-4 font-medium text-white disabled:opacity-50"
                  >
                    Godkänn restaurangen
                  </button>
                ) : null}

                {restaurant.status === "SUSPENDED" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setRestaurantStatus(restaurant.id, "ACTIVE"))}
                    className="min-h-11 rounded-md border border-black/15 px-4 disabled:opacity-50 dark:border-white/20"
                  >
                    Häv avstängningen
                  </button>
                ) : null}

                {restaurant.status === "ACTIVE" || restaurant.status === "PAUSED" ? (
                  confirmSuspend === restaurant.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm opacity-70">
                        Stänger av {restaurant.name}. Gästerna kan inte längre beställa.
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          run(() => setRestaurantStatus(restaurant.id, "SUSPENDED"));
                          setConfirmSuspend(null);
                        }}
                        className="min-h-11 rounded-md bg-red-600 px-4 font-medium text-white disabled:opacity-50"
                      >
                        Bekräfta
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmSuspend(null)}
                        className="min-h-11 rounded-md border border-black/15 px-4 dark:border-white/20"
                      >
                        Avbryt
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmSuspend(restaurant.id)}
                      className="min-h-11 rounded-md border border-black/15 px-4 dark:border-white/20"
                    >
                      Stäng av
                    </button>
                  )
                ) : null}

                <FeeField restaurant={restaurant} pending={pending} onSave={run} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function FeeField({
  restaurant,
  pending,
  onSave,
}: {
  restaurant: PlatformRestaurant;
  pending: boolean;
  onSave: (fn: () => Promise<{ ok: boolean; message?: string }>) => void;
}) {
  const current =
    restaurant.feeOverrideBps === null
      ? ""
      : (restaurant.feeOverrideBps / 100).toFixed(2).replace(".", ",");

  const [draft, setDraft] = useState(current);

  return (
    <label className="ml-auto">
      <span className="text-sm font-medium">Avgift %</span>
      <input
        value={draft}
        inputMode="decimal"
        // Tomt fält = Burps standard. Platshållaren visar vilken den är, så att
        // "tomt" inte läses som "ingen avgift".
        placeholder={(DEFAULT_FEE_BPS / 100).toFixed(2).replace(".", ",")}
        disabled={pending}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== current) onSave(() => setRestaurantFee(restaurant.id, draft));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(current);
            event.currentTarget.blur();
          }
        }}
        className="mt-1 block w-24 rounded-md border border-black/15 bg-transparent px-3 py-2 text-right tabular-nums dark:border-white/20"
      />
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-green-600/15 text-green-700 dark:text-green-400",
    PENDING: "bg-amber-600/20 text-amber-700 dark:text-amber-400",
    PAUSED: "bg-black/10 opacity-70 dark:bg-white/15",
    SUSPENDED: "bg-red-600/15 text-red-700 dark:text-red-400",
  };

  const labels: Record<string, string> = {
    ACTIVE: "Aktiv",
    PENDING: "Väntar på godkännande",
    PAUSED: "Pausad av restaurangen",
    SUSPENDED: "Avstängd av Burp",
  };

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? ""}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
