"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { resetMfaFactors } from "@/app/backoffice/actions";

/**
 * Återställning av någon annans andra faktor.
 *
 * Supabase har inga reservkoder. Den som byter telefon utan att först
 * registrera den nya kommer inte in, och då är det här enda vägen tillbaka som
 * inte kräver att någon redigerar `auth.mfa_factors` för hand.
 *
 * Adressen skrivs in, inte ett id: den som ringer supporten säger sin
 * e-postadress. Anteckningen är obligatorisk med flit — en rad i
 * `security_events` som bara säger "faktorn togs bort" besvarar inte frågan
 * varför, och det är den frågan man ställer ett halvår senare.
 *
 * Backoffice är svensk. Se språkavsnittet i CLAUDE.md.
 */
export function MfaReset() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();

    if (
      !window.confirm(
        `Ta bort tvåstegsverifieringen för ${email}? Kontot skyddas då bara av sitt lösenord tills en ny faktor registrerats. Åtgärden loggas.`,
      )
    ) {
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await resetMfaFactors(email, note);

      setFeedback({
        ok: result.ok,
        message: result.ok
          ? `Faktorn är borttagen för ${email}. Be personen registrera en ny direkt.`
          : (result.message ?? "Något gick fel."),
      });

      if (result.ok) {
        setEmail("");
        setNote("");
      }
    });
  }

  return (
    <form onSubmit={submit} className="card mt-4 space-y-4 p-4">
      <div className="flex items-start gap-3">
        <KeyRound size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--muted)]" />
        <p className="text-sm text-[var(--muted)]">
          Tar bort en persons registrerade faktorer så att hen kan logga in med
          lösenord igen och registrera en ny. Raden i <code>security_events</code>{" "}
          går inte att ändra i efterhand.
        </p>
      </div>

      <label className="block">
        <span className="label-caps">E-postadress</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="off"
          className="field mt-1.5"
        />
      </label>

      <label className="block">
        <span className="label-caps">Varför</span>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          required
          maxLength={200}
          placeholder="Bytt telefon, ringde support"
          className="field mt-1.5"
        />
      </label>

      {feedback ? (
        <p
          role="status"
          className={`text-sm ${feedback.ok ? "text-green-700" : "text-burp-700 dark:text-burp-100"}`}
        >
          {feedback.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || email.trim() === "" || note.trim() === ""}
        className="btn btn-secondary"
      >
        {pending ? "Tar bort…" : "Ta bort faktorn"}
      </button>
    </form>
  );
}
