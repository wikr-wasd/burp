"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

/**
 * Dela sidan.
 *
 * `navigator.share()` öppnar telefonens EGEN delningsruta, med WhatsApp,
 * Snapchat, Messenger, SMS och allt annat gästen har installerat. Där taggar
 * hon sina vänner själv, inne i appen.
 *
 * Det är den enda vägen som finns. Ingen plattform tillåter att en extern
 * webbplats taggar någons konto — att tagga är något bara användaren kan göra,
 * med sina egna kontakter. Ett SDK per plattform hade dessutom betytt
 * tredjepartsskript på en sida vars Content-Security-Policy ligger i
 * rapportläge just för att sådant inte är avgjort, plus appregistrering och
 * granskning hos Snapchat. Här behövs ingenting av det.
 *
 * På skrivbordet saknas `navigator.share` i bland annat Firefox. Då kopieras
 * länken i stället — samma handling, ett steg till.
 *
 * Delas gör bara PUBLIKA sidor: restaurangen och rätten. Ett kvitto bär vad
 * gästen åt och vad hon betalade och delas aldrig härifrån.
 */

export function ShareButton({
  title,
  label,
  copiedLabel,
}: {
  /** Sidans namn. Följer med i delningsrutan så mottagaren ser vad det gäller. */
  title: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Gästen avbröt, eller webbläsaren nekade. Båda är tysta fall — att
        // visa ett fel för någon som ändrade sig vore att skälla på henne.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Utan urklippsrättighet finns ingenting vettigt att göra. Adressfältet
      // står kvar med samma adress.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--muted)] transition-colors duration-[var(--speed)] hover:text-burp-600"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-green-700 dark:text-green-400" />
      ) : (
        <Share2 aria-hidden="true" className="size-4" />
      )}
      {copied ? copiedLabel : label}
    </button>
  );
}
