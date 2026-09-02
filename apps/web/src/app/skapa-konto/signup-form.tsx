"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Registreringsformulär.
 *
 * Profilraden skapas av en databastrigger när kontot registreras
 * (`handle_new_user` i migration 0002), inte härifrån. Skulle klienten göra
 * det skulle en avbruten registrering kunna lämna ett konto utan profil.
 */
export function SignUpForm({
  next,
  labels,
}: {
  next?: string;
  /** Rena strängar — klientkod kan inte ta emot en funktion över gränsen. */
  labels: Dictionary["auth"];
}) {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Supabase kräver minst sex tecken. Att säga det före anropet är snällare
    // än att låta servern avvisa efter en rundtur.
    if (password.length < 8) {
      setError(labels.passwordTooShort);
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      /*
       * Samtycket följer med metadatan och skrivs av `handle_new_user`
       * (migration 0066), inte av ett anrop efteråt. Med e-postbekräftelse
       * påslagen finns ingen session förrän länken klickats — en klient som
       * försökte skriva profilen direkt hade tappat krysset tyst i produktion
       * men inte lokalt, där bekräftelse är avstängd.
       */
      options: {
        data: {
          full_name: fullName.trim() || null,
          marketing_opt_in: marketingOptIn,
        },
      },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? labels.emailTaken
          : labels.signUpFailed,
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
      <p className="mt-8 bg-green-600/10 px-4 py-3 text-sm text-green-800 dark:text-green-300">
        {fill(labels.confirmSent, { email })}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-7">
      <label className="block">
        <span className="label-caps">
          {labels.name}{" "}
          <span className="normal-case whitespace-nowrap">{labels.nameOptional}</span>
        </span>
        <input
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          maxLength={120}
          className="field mt-1.5"
        />
      </label>

      <label className="block">
        <span className="label-caps">{labels.email}</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          className="field mt-1.5"
        />
      </label>

      <label className="block">
        <span className="label-caps">{labels.password}</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="field mt-1.5"
        />
        <span className="mt-1.5 block text-xs text-[var(--muted)]">{labels.passwordHint}</span>
      </label>

      {/*
        Orutad ruta är NEJ, och den är orutad från början med flit. Ett
        förkryssat samtycke är inget samtycke — och listan ska bära dem som
        faktiskt vill höra av oss, inte dem som inte orkade leta reda på rutan.
      */}
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={marketingOptIn}
          onChange={(event) => setMarketingOptIn(event.target.checked)}
          className="mt-0.5 size-5 accent-burp-600"
        />
        <span className="text-sm">{labels.marketingOptIn}</span>
      </label>

      {error ? (
        <p role="alert" className="border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary w-full"
      >
        {submitting ? "Skapar konto…" : "Skapa konto"}
      </button>
    </form>
  );
}
