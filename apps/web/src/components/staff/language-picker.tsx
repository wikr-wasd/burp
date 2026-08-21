"use client";

import { useState, useTransition } from "react";
import { Globe } from "lucide-react";
import { setStaffLocale } from "@/app/dashboard/sprak-actions";
import { LOCALE_LABELS, LOCALES, type Locale } from "@/lib/i18n/config";

/**
 * Personalens språkväljare.
 *
 * En `<select>` och inte fem länkar. Gästens fot har fem språk på en rad
 * därför att den raden också är hreflang-signaler till Google; här finns
 * ingen sådan andra uppgift, och fem ord i en sidomeny som redan bär tolv
 * navigeringspunkter blir en vägg.
 *
 * Språknamnen står på sitt eget språk och översätts aldrig. Den som letar
 * efter tyska letar efter "Deutsch", inte efter "Tyska" — en meny skriven på
 * ett språk hon inte läser är precis den situation hon försöker ta sig ur.
 *
 * Valet sparas på personen och inte i webbläsaren. En surfplatta på en disk
 * delas av flera, och den som ställt in sitt språk ska hitta det kvar nästa
 * pass oavsett vilken skärm hon står framför.
 */
export function LanguagePicker({
  current,
  label,
  savingLabel,
  errorLabel,
}: {
  current: Locale;
  label: string;
  savingLabel: string;
  errorLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function choose(next: string) {
    if (next === current) return;

    setFailed(false);
    startTransition(async () => {
      const result = await setStaffLocale(next);
      // Går det igenom renderas sidan om av `revalidatePath` och `current`
      // kommer tillbaka som det nya språket. Går det inte igenom står
      // väljaren kvar på det gamla, vilket är sanningen om vad som sparats.
      if (!result.ok) setFailed(true);
    });
  }

  return (
    <div className="px-2 py-2">
      <label className="label-caps flex items-center gap-2" htmlFor="staff-language">
        <Globe size={14} aria-hidden="true" />
        {label}
      </label>

      <select
        id="staff-language"
        value={current}
        disabled={pending}
        onChange={(event) => choose(event.target.value)}
        className="field mt-1.5 w-full text-sm disabled:opacity-60"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>

      {/* `aria-live` därför att bytet inte flyttar fokus någonstans: utan den
          får en skärmläsare aldrig veta att något hände. */}
      <p aria-live="polite" className="mt-1 text-xs text-[var(--muted)]">
        {pending ? savingLabel : failed ? errorLabel : ""}
      </p>
    </div>
  );
}
