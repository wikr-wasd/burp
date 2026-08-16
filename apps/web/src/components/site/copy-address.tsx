"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Kopierar adressen till urklipp.
 *
 * För gästen som ska klistra in den någon annanstans än i en kartapp — i ett
 * meddelande till den hen ska äta med, oftast. Knappen finns bara när
 * webbläsaren faktiskt kan kopiera: `navigator.clipboard` kräver en säker
 * kontext, och en knapp som inte gör något är värre än ingen knapp.
 */
export function CopyAddress({
  address,
  labels,
}: {
  address: string;
  /** Texterna skickas in — komponenten är klientkod och ska inte veta om språk. */
  labels: { copy: string; copied: string; notice: string };
}) {
  const [supported, setSupported] = useState(false);
  const [copied, setCopied] = useState(false);

  // Kontrollen körs efter montering. Serverrendering har ingen `navigator`,
  // och att gissa på servern skulle ge en knapp som hoppar in eller ut när
  // React tar över.
  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && Boolean(navigator.clipboard));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!supported) return null;

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
        } catch {
          // Användaren kan ha nekat behörigheten. Ingen bekräftelse då —
          // hellre tyst än ett "kopierat" som inte stämmer.
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {copied ? labels.copied : labels.copy}
      {/* Skärmläsare får besked om att något hänt; den visuella texten byts
          bara ut, vilket inte alltid läses upp. */}
      <span aria-live="polite" className="sr-only">
        {copied ? labels.notice : ""}
      </span>
    </button>
  );
}
