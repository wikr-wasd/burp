"use client";

import { useEffect, useState, useTransition } from "react";
import { fill, type Dictionary } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import {
  availableEditActions,
  type OrderPolicy,
  type OrderStatus,
} from "@burp/core";

/**
 * Vad gästen får göra med sin lagda order just nu (avsnitt 5.2).
 *
 * Knapparna visas efter restaurangens egna regler, med samma funktion som
 * servern använder för att avgöra om ändringen får göras. Att de stämmer
 * överens är en bekvämlighet, inte en garanti — servern avgör, och den som
 * anropar API:t direkt möter samma svar.
 *
 * Tidsfönstret räknas om varje sekund. En knapp som ligger kvar efter att
 * fönstret stängt är ett löfte som bryts när gästen trycker.
 */
export function OrderActions({
  orderId,
  status,
  placedAt,
  policy,
  items,
  labels,
}: {
  orderId: string;
  status: OrderStatus;
  placedAt: string | null;
  policy: OrderPolicy;
  items: readonly { id: string; name: string; quantity: number }[];
  labels: Dictionary["receipt"];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  /*
   * Klockan sätts först efter montering — annars skiljer sig serverns och
   * klientens tid åt och React klagar på hydreringsfel.
   *
   * Sekundupplösning behövs: ändringsfönstret är ofta två minuter, och en
   * nedräkning som hoppar i tiotalssekunder ser trasig ut.
   */
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) return null;

  const allowed = availableEditActions(policy, {
    status,
    placedAt: placedAt ? new Date(placedAt) : new Date(),
    now: new Date(now),
  });

  if (allowed.length === 0) return null;

  const canCancel = allowed.includes("CANCEL");
  const canRemove = allowed.includes("REMOVE_ITEM") && items.length > 1;

  function act(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const problem = await response.json().catch(() => null);
        setError(problem?.detail ?? labels.changeFailed);
        return;
      }

      router.refresh();
    });
  }

  const secondsLeft = secondsRemaining(policy, placedAt, now);

  return (
    <section className="mt-6 border border-[var(--rule)] p-4">
      <h2 className="font-semibold">{labels.editTitle}</h2>

      {secondsLeft !== null && allowed.some((action) => action !== "CANCEL") ? (
        <p className="mt-1 text-sm opacity-60">
          {secondsLeft > 0
            ? fill(labels.editWindow, { n: secondsLeft })
            : labels.editExpired}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {canRemove ? (
        <div className="mt-3">
          <p className="text-sm font-medium">{labels.removeItem}</p>
          <ul className="mt-2 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <span className="mr-auto text-sm">
                  {item.quantity}× {item.name}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act({ action: "REMOVE_ITEM", order_item_id: item.id })}
                  className="min-h-11 border border-[var(--rule)] px-4 text-sm disabled:opacity-50"
                >
                  {labels.remove}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canCancel ? (
        <div className="mt-4">
          {confirmCancel ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm opacity-70">{labels.cancelWarning}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => act({ action: "CANCEL" })}
                className="min-h-11 bg-red-600 px-4 font-medium text-white disabled:opacity-50"
              >
                Ja, avbryt
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="min-h-11 border border-[var(--rule)] px-4"
              >
                Behåll
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="min-h-11 border border-[var(--rule)] px-4"
            >
              {labels.cancelOrder}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function secondsRemaining(
  policy: OrderPolicy,
  placedAt: string | null,
  now: number,
): number | null {
  if (!placedAt) return null;
  const elapsed = (now - new Date(placedAt).getTime()) / 1000;
  return Math.max(0, Math.round(policy.editWindowSeconds - elapsed));
}
