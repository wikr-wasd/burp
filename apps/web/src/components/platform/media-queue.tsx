"use client";

import { useState, useTransition } from "react";
import { moderateMedia } from "@/app/backoffice/actions";
import { imageAdjustStyle, parseImageAdjust } from "@burp/core";
import type { ModeratedMedia } from "@/app/backoffice/media/page";

/**
 * Granskningskön för media.
 *
 * Avvisande kräver en anledning. Restaurangen ska få veta varför bilden inte
 * dög — ett tyst nej leder till att samma bild laddas upp igen och att kön
 * växer med samma ärende.
 */
export function MediaQueue({
  media,
  canWrite,
}: {
  media: ModeratedMedia[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

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
        <p role="alert" className="mt-4 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {media.map((item) => (
          <li key={item.id} className="card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">{item.restaurantName}</p>
              <span className="shrink-0 text-xs uppercase tracking-wide opacity-60">
                {item.kind === "VIDEO" ? "Video" : "Bild"}
              </span>
            </div>

            <p className="text-sm opacity-60">
              {item.itemName ?? "Restaurangbild"} ·{" "}
              {new Date(item.createdAt).toLocaleDateString("sv-SE")}
            </p>

            <MediaPreview item={item} />

            {item.altText ? (
              <p className="mt-2 text-sm opacity-70">Alt-text: {item.altText}</p>
            ) : (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                Saknar alt-text — bilden blir otillgänglig för skärmläsare.
              </p>
            )}

            {item.rejectionReason ? (
              <p className="mt-2 text-sm text-red-700 dark:text-red-400">
                Avvisad: {item.rejectionReason}
              </p>
            ) : null}

            {canWrite && item.status === "PENDING" ? (
              rejecting === item.id ? (
                <div className="mt-4 space-y-2">
                  <label className="block">
                    <span className="text-sm font-medium">Varför avvisas den?</span>
                    <input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      maxLength={200}
                      autoFocus
                      placeholder="För mörk, visar inte rätten, upphovsrätt…"
                      className="mt-1 w-full border border-[var(--rule)] bg-transparent px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending || reason.trim() === ""}
                      onClick={() => {
                        run(() => moderateMedia(item.id, false, reason));
                        setRejecting(null);
                        setReason("");
                      }}
                      className="min-h-11 flex-1 bg-red-600 font-medium text-white disabled:opacity-50"
                    >
                      Avvisa
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejecting(null);
                        setReason("");
                      }}
                      className="min-h-11 border border-[var(--rule)] px-4"
                    >
                      Avbryt
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => moderateMedia(item.id, true))}
                    className="min-h-11 flex-1 bg-burp-600 font-medium text-white disabled:opacity-50"
                  >
                    Godkänn
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejecting(item.id)}
                    className="min-h-11 border border-[var(--rule)] px-4"
                  >
                    Avvisa
                  </button>
                </div>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function MediaPreview({ item }: { item: ModeratedMedia }) {
  const url = item.kind === "VIDEO" ? (item.posterUrl ?? item.playbackUrl) : item.previewUrl;

  if (!url) {
    return (
      <p className="mt-3 bg-[var(--surface)] px-3 py-6 text-center text-sm opacity-60">
        Ingen förhandsvisning tillgänglig
      </p>
    );
  }

  // Vanlig <img> och inte next/image: URL:en kommer från restaurangens egen
  // uppladdning och kan peka på en värd som inte står i next.config.js. En
  // bild som inte visas i granskningskön är värre än en ooptimerad bild.
  return (
    <img
      src={url}
      alt={item.altText ?? "Media som väntar på granskning"}
      style={imageAdjustStyle(parseImageAdjust(item.adjust))}
      className="mt-3 aspect-video w-full object-cover"
      loading="lazy"
    />
  );
}
