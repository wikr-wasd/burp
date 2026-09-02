"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ADJUST_MAX,
  ADJUST_MIN,
  DEFAULT_IMAGE_ADJUST,
  imageAdjustStyle,
  isDefaultAdjust,
  parseImageAdjust,
  type ImageAdjust,
} from "@burp/core";
import { saveImageAdjust } from "@/app/dashboard/meny/media-actions";
import type { Dictionary } from "@/lib/i18n";

/**
 * Bildjustering för restaurangens egen bild (migration 0063).
 *
 * Inte ett filter, med flit. Ett filter konkurrerar med maten, och femton
 * restauranger med var sitt gör startsidans rutnät spretigt — det rutnätet är
 * Burps yta. Det här är de fyra justeringar som gör en telefonbild rättvis:
 * vad som överlever beskärningen, och tre reglage inom ±15 %.
 *
 * Förhandsvisningen ritas med exakt samma funktion som gästens sida använder,
 * `imageAdjustStyle()` i @burp/core. Två uträkningar av samma sak hade glidit
 * isär, och då visar redigeraren en bild som gästen aldrig ser.
 */

const STEP = 5;

export function ImageAdjuster({
  mediaId,
  imageUrl,
  initial,
  ratio = "aspect-[4/3]",
  labels,
}: {
  mediaId: string;
  imageUrl: string;
  /** Kolumnvärdet rakt av. Tolkas här, som överallt annars. */
  initial: unknown;
  ratio?: string;
  labels: Dictionary["staff"]["image"];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adjust, setAdjust] = useState<ImageAdjust>(() => parseImageAdjust(initial));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const style = imageAdjustStyle(adjust);

  function set(part: Partial<ImageAdjust>) {
    setMessage(null);
    setAdjust((current) => ({ ...current, ...part }));
  }

  function setFocalFromEvent(event: React.MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;

    set({
      focalX: Math.round(((event.clientX - box.left) / box.width) * 100),
      focalY: Math.round(((event.clientY - box.top) / box.height) * 100),
    });
  }

  // Fokuspunkten ska gå att sätta utan mus. Piltangenterna flyttar den fem
  // procent i taget — en klickyta utan tangentbord hade varit en funktion som
  // bara finns för den som ser den.
  function nudge(event: React.KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, Partial<ImageAdjust>> = {
      ArrowLeft: { focalX: Math.max(0, adjust.focalX - STEP) },
      ArrowRight: { focalX: Math.min(100, adjust.focalX + STEP) },
      ArrowUp: { focalY: Math.max(0, adjust.focalY - STEP) },
      ArrowDown: { focalY: Math.min(100, adjust.focalY + STEP) },
    };

    const move = moves[event.key];
    if (!move) return;

    event.preventDefault();
    set(move);
  }

  function save() {
    startTransition(async () => {
      const result = await saveImageAdjust(mediaId, adjust);
      setMessage({
        ok: result.ok,
        text: result.ok ? labels.adjustSaved : (result.message ?? labels.adjustFailed),
      });
      if (result.ok) router.refresh();
    });
  }

  const sliders: { key: "brightness" | "contrast" | "saturation"; label: string }[] = [
    { key: "brightness", label: labels.brightness },
    { key: "contrast", label: labels.contrast },
    { key: "saturation", label: labels.saturation },
  ];

  return (
    <div className="mb-4">
      <p className="label-caps">{labels.adjustTitle}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{labels.adjustHint}</p>

      <button
        type="button"
        onClick={setFocalFromEvent}
        onKeyDown={nudge}
        aria-label={labels.adjustHint}
        className={`relative mt-3 block w-full max-w-sm overflow-hidden rounded-lg bg-[var(--surface)] ${ratio} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600`}
      >
        <img
          src={imageUrl}
          alt=""
          style={style}
          className="h-full w-full object-cover"
        />

        {/* Korset visar var fokuspunkten ligger. Utan det är klicket en
            gissning: bilden ändrar sig bara när beskärningen faktiskt biter. */}
        <span
          aria-hidden
          style={{ left: `${adjust.focalX}%`, top: `${adjust.focalY}%` }}
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
        />
      </button>

      <div className="mt-4 max-w-sm space-y-3">
        {sliders.map(({ key, label }) => (
          <label key={key} className="block">
            <span className="flex items-baseline justify-between text-sm">
              <span>{label}</span>
              <span className="text-[var(--muted)] tabular-nums">{adjust[key]} %</span>
            </span>
            <input
              type="range"
              min={ADJUST_MIN}
              max={ADJUST_MAX}
              step={1}
              value={adjust[key]}
              onChange={(event) => set({ [key]: Number(event.target.value) })}
              className="mt-1 w-full accent-burp-600"
            />
          </label>
        ))}
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">{labels.adjustNoReview}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn btn-primary">
          {pending ? labels.adjustSaving : labels.adjustSave}
        </button>

        <button
          type="button"
          onClick={() => set(DEFAULT_IMAGE_ADJUST)}
          disabled={pending || isDefaultAdjust(adjust)}
          className="btn btn-secondary"
        >
          {labels.adjustReset}
        </button>
      </div>

      {message ? (
        <p
          role="alert"
          className={`mt-3 text-sm ${message.ok ? "text-green-700 dark:text-green-300" : "text-burp-700 dark:text-burp-100"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
