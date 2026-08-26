"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginDestination } from "@/app/logga-in/actions";
import { MFA_CHALLENGE_PATH } from "@/lib/mfa-path";
import { createClient } from "@/lib/supabase/client";

/**
 * Inloggningsformulär.
 *
 * Sessionen läggs i cookies av `@supabase/ssr`, inte i localStorage. Det är
 * det som gör att server components, route handlers och proxy:n ser samma
 * inloggning — och det som gör att en köksskärm kan stå påslagen hela dagen
 * utan att tappa sessionen.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      // Samma meddelande för fel lösenord och okänt konto. Skiljer de sig kan
      // sidan användas för att ta reda på vilka e-postadresser som finns.
      setError("Fel e-postadress eller lösenord.");
      setSubmitting(false);
      return;
    }

    /*
     * Har kontot en andra faktor? Då är inloggningen inte klar.
     *
     * Kontrollen måste ligga FÖRE `loginDestination()`. Med aal1 döljer RLS
     * både `staff` och `platform_admins`, så serveråtgärden hade svarat
     * `/konto` — och en ägare som skrivit rätt lösenord hade landat på
     * gästsidan utan att förstå varför.
     *
     * Uträkningen sker lokalt ur den nyss hämtade sessionens JWT; inget
     * nätanrop.
     */
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const target = new URL(MFA_CHALLENGE_PATH, window.location.origin);
      if (next) target.searchParams.set("next", next);

      router.refresh();
      router.replace(`${target.pathname}${target.search}`);
      return;
    }

    // refresh() krävs för att server components ska läsa den nya cookien.
    // Utan den renderas nästa sida med den utloggade sessionen.
    router.refresh();

    /*
     * Vart man hamnar avgörs av vem man är, inte av att alla är personal.
     *
     * Här stod `next ?? "/dashboard"`. Det stämde för en ägare och för en
     * chef, men kocken skickades till en yta han ändå kastas ut ur, och för
     * BÅDE en gäst och en plattformsadmin — som ingendera har en `staff`-rad —
     * blev det en studs tillbaka hit. Utan felmeddelande, eftersom
     * inloggningen faktiskt hade lyckats. Det såg ut som ett trasigt konto.
     *
     * `next` går före: den som klickade på en skyddad sida ska tillbaka dit.
     */
    router.replace(next ?? (await loginDestination()));
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-7">
      <label className="block">
        <span className="label-caps">E-post</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          autoFocus
          className="field mt-1.5"
        />
      </label>

      <label className="block">
        <span className="label-caps">Lösenord</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          className="field mt-1.5"
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

      <button type="submit" disabled={submitting} className="btn btn-primary w-full">
        {submitting ? "Loggar in…" : "Logga in"}
      </button>
    </form>
  );
}
