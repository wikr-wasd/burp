"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moderateAvatar } from "@/app/backoffice/actions";

/**
 * Gästbilder som väntar på granskning.
 *
 * Kön visar en bild och ingenting annat — ingen e-post, inget namn, ingen
 * telefon. Granskaren ska bedöma om ansiktet kan ligga på en indexerad sida
 * under Burps domän, och till det behövs inte veta vem personen är.
 *
 * En avvisad bild raderas inte. Den slutar bara vara publik och ligger kvar som
 * gästens privata bild — hon har inte gjort något fel genom att ha ett foto.
 */

export interface PendingAvatar {
  userId: string;
  url: string;
  since: string;
}

export function AvatarQueue({
  avatars,
  canWrite,
}: {
  avatars: PendingAvatar[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(userId: string, approve: boolean) {
    startTransition(async () => {
      const result = await moderateAvatar(userId, approve);
      if (result.ok) {
        setError(null);
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

      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {avatars.map((avatar) => (
          <li key={avatar.userId} className="card flex items-center gap-4 p-4">
            <img
              src={avatar.url}
              alt=""
              className="size-20 shrink-0 rounded-full border border-[var(--rule)] object-cover"
            />

            <div className="min-w-0 flex-1">
              <p className="text-sm opacity-60">
                {new Date(avatar.since).toLocaleDateString("sv-SE")}
              </p>

              {canWrite ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(avatar.userId, true)}
                    className="btn btn-primary"
                  >
                    Godkänn
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(avatar.userId, false)}
                    className="btn btn-secondary"
                  >
                    Avvisa
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
