"use client";

import { useState, useTransition } from "react";
import { saveGoogleReviewUrl } from "@/app/dashboard/installningar/actions";
import type { Dictionary } from "@/lib/i18n";

/**
 * Restaurangens länk till Googles recensionsformulär.
 *
 * ── Vad Burp inte gör ───────────────────────────────────────────────────────
 *
 * Skickar omdömen till Google. Det går inte — Google Business Profile har
 * ingen skriv-endpoint för recensioner — och att posta gästens text som
 * restaurangens egen hade brutit mot både deras policy och GDPR.
 *
 * Det som går är att fråga gästen som just skrivit ett omdöme hos oss om hon
 * vill säga samma sak där också. Länken visas för ALLA, oavsett betyg: att
 * bara visa den för nöjda gäster kallas review gating och är förbjudet av
 * Google och av EU:s konsumentregler. Därför finns här inget att ställa in
 * utöver adressen.
 */
export function GoogleReviewLink({
  initial,
  labels,
  errorLabels,
}: {
  initial: string | null;
  labels: Dictionary["staff"]["settings"];
  errorLabels: Dictionary["staff"]["errors"];
}) {
  const [url, setUrl] = useState(initial ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveGoogleReviewUrl(url);
      setFeedback({
        ok: result.ok,
        message: result.ok ? labels.saved : (result.message ?? errorLabels.googleUrlInvalid),
      });
    });
  }

  return (
    <div className="card mt-4 p-4">
      <label className="block">
        <span className="label-caps">{labels.googleUrl}</span>
        <input
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setFeedback(null);
          }}
          placeholder="https://g.page/r/…/review"
          className="field mt-1.5"
        />
        <span className="mt-1 block text-sm text-[var(--muted)]">{labels.googleUrlHint}</span>
      </label>

      {feedback ? (
        <p
          role="status"
          className={`mt-3 text-sm ${feedback.ok ? "text-green-700" : "text-burp-700 dark:text-burp-100"}`}
        >
          {feedback.message}
        </p>
      ) : null}

      <button type="button" onClick={save} disabled={pending} className="btn btn-secondary mt-4">
        {pending ? labels.saving : labels.save}
      </button>
    </div>
  );
}
