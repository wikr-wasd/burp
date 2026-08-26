"use client";

import { useState, useTransition } from "react";
import { checkAccentColor } from "@burp/core";
import type { Dictionary } from "@/lib/i18n";
import { fill } from "@/lib/i18n";
import { saveAccentColor } from "@/app/dashboard/installningar/actions";
import { ImageUpload } from "@/components/staff/image-upload";

/**
 * Restaurangens eget märke: logotyp, banner och en accentfärg.
 *
 * ── Varför bara en färg ─────────────────────────────────────────────────────
 *
 * Burp följer 123Connect Design System och byggstenarna definieras EN gång i
 * globals.css. En restaurang som fick skriva egen CSS hade brutit det inom en
 * vecka. Färgen bär därför identitet — band, rubrikdetaljer, märken — och
 * aldrig funktion: primärknappen förblir handlingsröd.
 *
 * ── Varför kontrollen körs två gånger ───────────────────────────────────────
 *
 * `checkAccentColor()` anropas här för att visa besked medan ägaren skriver,
 * OCH i serveråtgärden som faktiskt sparar. Det är samma funktion ur
 * @burp/core, inte två uträkningar — och den som anropar åtgärden direkt möter
 * exakt samma bedömning som den som ser förhandsvisningen.
 */
export function IdentityEditor({
  restaurantId,
  initialAccent,
  logoUrl,
  bannerUrl,
  labels,
  errorLabels,
  imageLabels,
}: {
  restaurantId: string;
  initialAccent: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  labels: Dictionary["staff"]["settings"];
  /*
   * Beskeden när färgen inte duger.
   *
   * Ligger under `staff.errors` och inte under `staff.settings` därför att
   * serveråtgärden använder exakt samma tre strängar — och två uppsättningar
   * av samma besked hade glidit isär första gången någon skrev om den ena.
   */
  errorLabels: Dictionary["staff"]["errors"];
  imageLabels: Dictionary["staff"]["image"];
}) {
  const [accent, setAccent] = useState(initialAccent ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Tom sträng betyder "ingen egen färg" och är giltigt — inte ett fel.
  const check = accent.trim() === "" ? null : checkAccentColor(accent);

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveAccentColor(accent);
      setFeedback({
        ok: result.ok,
        message: result.ok ? labels.accentSaved : (result.message ?? labels.saveFailed),
      });
    });
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="card p-4">
        <p className="font-medium">{labels.accentTitle}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{labels.accentHint}</p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label-caps">{labels.accentColor}</span>
            <div className="mt-1.5 flex items-center gap-2">
              {/*
                Färgväljaren och textfältet skriver samma värde. Väljaren är
                snabbast för den som letar; fältet är det enda sättet att klistra
                in en färg ur en grafisk profil.
              */}
              <input
                type="color"
                value={check?.hex ?? "#dc2626"}
                onChange={(event) => setAccent(event.target.value)}
                aria-label={labels.accentColor}
                className="h-11 w-14 cursor-pointer border border-[var(--rule-control)] bg-transparent p-1"
              />
              <input
                type="text"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                placeholder="#dc2626"
                maxLength={7}
                className="field w-32 font-mono"
              />
            </div>
          </label>

          {check?.ok ? (
            <p
              className="rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium"
              style={{ backgroundColor: check.hex!, color: check.textOn! }}
            >
              {labels.accentPreview}
            </p>
          ) : null}
        </div>

        {check && !check.ok ? (
          <p className="mt-3 text-sm text-burp-700 dark:text-burp-100">
            {check.verdict === "INVALID"
              ? errorLabels.accentInvalid
              : check.verdict === "NO_READABLE_TEXT"
                ? errorLabels.accentUnreadable
                : errorLabels.accentInvisible}
          </p>
        ) : null}

        {check?.ok ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            {fill(labels.accentContrast, {
              text: String(check.textRatio),
              light: String(check.onLight),
              dark: String(check.onDark),
            })}
          </p>
        ) : null}

        {feedback ? (
          <p
            role="status"
            className={`mt-3 text-sm ${feedback.ok ? "text-green-700" : "text-burp-700 dark:text-burp-100"}`}
          >
            {feedback.message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={save}
          disabled={pending || (check !== null && !check.ok)}
          className="btn btn-secondary mt-4"
        >
          {pending ? labels.saving : labels.save}
        </button>
      </div>

      {/*
        Logotyp och banner går genom samma granskning som övriga bilder.

        En logotyp ligger på en indexerad sida. Att låta en restaurang publicera
        rakt ut hade gjort Burp till värd för vad som helst utan att någon sett
        det först — och granskningsflödet fanns redan (avsnitt 8.3).
      */}
      <div className="card p-4">
        <p className="font-medium">{labels.logoTitle}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{labels.logoHint}</p>
        <div className="mt-3">
          <ImageUpload
            restaurantId={restaurantId}
            purpose="LOGO"
            label={labels.logoUpload}
            labels={imageLabels}
            currentUrl={logoUrl}
          />
        </div>
      </div>

      <div className="card p-4">
        <p className="font-medium">{labels.bannerTitle}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{labels.bannerHint}</p>
        <div className="mt-3">
          <ImageUpload
            restaurantId={restaurantId}
            purpose="BANNER"
            label={labels.bannerUpload}
            labels={imageLabels}
            currentUrl={bannerUrl}
          />
        </div>
      </div>
    </div>
  );
}
