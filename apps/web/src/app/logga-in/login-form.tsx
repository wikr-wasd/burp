"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

    // refresh() krävs för att server components ska läsa den nya cookien.
    // Utan den renderas nästa sida med den utloggade sessionen.
    router.refresh();
    router.replace(next ?? "/dashboard");
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
