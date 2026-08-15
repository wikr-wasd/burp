"use client";

import { useEffect } from "react";

/**
 * Felgräns för hela sajten.
 *
 * Måste vara en klientkomponent — det är React som fångar felet — och kan
 * därför inte slå upp språket själv. Texterna ligger som konstanter här i
 * stället för i ordboken: den här sidan visas när något redan gått fel, och
 * ska inte bero på ännu ett uppslag som kan misslyckas.
 *
 * Ingen sidfot. Den frågar databasen, och om det var databasen som fällde
 * sidan skulle felsidan falla på samma sak.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Loggas på klienten så att det går att hitta i webbläsarens konsol vid
    // felsökning. Servern loggar redan sin sida av samma fel.
    console.error("[burp]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 text-center">
      <p className="label-caps">Fel · Error</p>

      <h1 className="font-display mt-3 text-4xl sm:text-5xl">
        Något gick fel.
        <span className="mt-2 block text-[var(--muted)]">Something went wrong.</span>
      </h1>

      <p className="mx-auto mt-5 max-w-md leading-relaxed text-[var(--muted)]">
        Det är vårt fel, inte ditt. Försök igen — funkar det inte heller går det bra att
        ringa restaurangen direkt.
      </p>

      <div className="mt-8">
        <button type="button" onClick={reset} className="btn btn-primary">
          Försök igen · Try again
        </button>
      </div>

      {/*
        Felkoden syns för gästen med flit. Den som ringer och säger "det står
        4f2a1" går att hjälpa; den som säger "det blev fel" går det inte.
      */}
      {error.digest ? (
        <p className="label-caps mt-8">Referens: {error.digest}</p>
      ) : null}
    </main>
  );
}
