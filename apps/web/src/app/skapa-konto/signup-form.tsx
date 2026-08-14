"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Registreringsformulär.
 *
 * Profilraden skapas av en databastrigger när kontot registreras
 * (`handle_new_user` i migration 0002), inte härifrån. Skulle klienten göra
 * det skulle en avbruten registrering kunna lämna ett konto utan profil.
 */
export function SignUpForm({ next }: { next?: string }) {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Supabase kräver minst sex tecken. Att säga det före anropet är snällare
    // än att låta servern avvisa efter en rundtur.
    if (password.length < 8) {
      setError("Lösenordet behöver minst 8 tecken.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim() || null } },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "Det finns redan ett konto med den e-postadressen."
          : "Kontot kunde inte skapas. Försök igen.",
      );
      setSubmitting(false);
      return;
    }

    // Med e-postbekräftelse påslagen finns ingen session förrän länken klickats.
    // Lokalt är bekräftelse avstängd och sessionen finns direkt — båda fallen
    // måste hanteras, annars fastnar den ena miljön på en tom sida.
    if (!data.session) {
      setNeedsConfirmation(true);
      setSubmitting(false);
      return;
    }

    router.refresh();
    router.replace(next ?? "/konto");
  }

  if (needsConfirmation) {
    return (
      <p className="mt-8 rounded-md bg-green-600/10 px-4 py-3 text-sm text-green-800 dark:text-green-300">
        Nästan klart. Vi har skickat en bekräftelselänk till {email} — klicka på den så är
        kontot igång.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">
          Namn <span className="font-normal opacity-60">valfritt</span>
        </span>
        <input
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          maxLength={120}
          className="mt-1 min-h-11 w-full rounded-md border border-black/15 bg-transparent px-3 dark:border-white/20"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">E-post</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          className="mt-1 min-h-11 w-full rounded-md border border-black/15 bg-transparent px-3 dark:border-white/20"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Lösenord</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 min-h-11 w-full rounded-md border border-black/15 bg-transparent px-3 dark:border-white/20"
        />
        <span className="mt-1 block text-xs opacity-60">Minst 8 tecken.</span>
      </label>

      {error ? (
        <p role="alert" className="rounded-md bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-12 w-full rounded-md bg-burp-600 px-4 font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Skapar konto…" : "Skapa konto"}
      </button>
    </form>
  );
}
