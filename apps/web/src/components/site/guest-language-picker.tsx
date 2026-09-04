"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setGuestLocale } from "@/app/locale-actions";
import { LOCALE_LABELS, LOCALES, type Locale } from "@/lib/i18n/config";

/**
 * Gästens språkväljare på ytorna utan språk i adressen.
 *
 * QR-sidan, kvittot och `/konto` är noindex och har därför ingen `/de/…`-adress
 * att länka till. Foten på marknadsplatsen byter språk med fem länkar — de är
 * samtidigt hreflang-signaler till Google — men här finns ingen sådan andra
 * uppgift och ingen adress att gå till. Valet skrivs i kakan i stället, och
 * gäller sedan hela plattformen: menyn, notan, kvittot och kontot.
 *
 * Språknamnen står på sitt eget språk och översätts aldrig. Den som letar
 * efter tyska letar efter "Deutsch", inte efter "Tyska" — en meny skriven på
 * ett språk hon inte läser är precis den situation hon försöker ta sig ur.
 *
 * En `<select>` och inte fem knappar: den ska rymmas bredvid restaurangens
 * namn på en telefon, och webbläsarens egen lista är den största träffytan en
 * tumme kan få utan att vi bygger något eget.
 */
export function GuestLanguagePicker({
  current,
  label,
  className = "",
}: {
  current: Locale;
  label: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Globe size={14} aria-hidden="true" className="text-[var(--muted)]" />

      <label className="sr-only" htmlFor="guest-language">
        {label}
      </label>

      <select
        id="guest-language"
        value={current}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          if (next === current) return;
          // Sidan ritas om av `revalidatePath` i åtgärden. Går det inte igenom
          // står väljaren kvar på det gamla språket, vilket är sanningen om
          // vad som sparats.
          startTransition(() => setGuestLocale(next));
        }}
        className="min-h-11 rounded-lg border border-[var(--rule)] bg-[var(--surface)] px-2 text-sm disabled:opacity-60"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}
