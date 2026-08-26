"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginDestination } from "@/app/logga-in/actions";
import { createClient } from "@/lib/supabase/client";

/**
 * Engångskoden.
 *
 * `challengeAndVerify()` gör två anrop i ett: begär en utmaning för faktorn och
 * skickar in koden. Lyckas den byts sessionen upp till aal2 — samma cookie,
 * ny token — och först då släpper RLS igenom personalens rader.
 *
 * Faktorn hämtas med `listFactors()` i stället för att skickas hit som en prop.
 * Sidan bakom är en serverkomponent som redan vet att det FINNS en faktor, men
 * inte vilken: id:t ligger i Supabase auth och inte i något av våra scheman.
 */
export function ChallengeForm({ next }: { next?: string }) {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();

    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();

    // `totp` innehåller bara verifierade faktorer. En påbörjad men aldrig
    // bekräftad registrering ska inte gå att logga in med.
    const factor = factors?.totp?.[0];

    if (listError || !factor) {
      setError("Ingen andra faktor är registrerad på kontot. Ladda om sidan.");
      setSubmitting(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: code.trim(),
    });

    if (verifyError) {
      // Koden gäller i ett kort fönster. Den vanligaste orsaken till att en
      // riktig kod avvisas är att telefonens klocka gått isär, och det är värt
      // att säga — annars provar man samma sak igen.
      setError("Koden stämmer inte. Kontrollera att telefonens klocka går rätt och försök igen.");
      setCode("");
      setSubmitting(false);
      return;
    }

    // refresh() krävs för att server components ska läsa den uppgraderade
    // sessionen. Utan den renderas nästa sida fortfarande som aal1.
    router.refresh();
    router.replace(next ?? (await loginDestination()));
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-7">
      <label className="block">
        <span className="label-caps">Engångskod</span>
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
          /*
           * `one-time-code` gör att iOS och Android erbjuder koden ur
           * tangentbordet. `inputMode` ger sifferknappsatsen, och
           * `autoComplete` ensam räcker inte för det.
           */
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          className="field mt-1.5 text-center text-2xl tracking-[0.4em]"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || code.trim().length < 6}
        className="btn btn-primary w-full"
      >
        {submitting ? "Verifierar…" : "Verifiera"}
      </button>
    </form>
  );
}
