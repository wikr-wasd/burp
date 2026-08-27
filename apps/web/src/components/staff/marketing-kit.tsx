"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { fill } from "@/lib/i18n";

/**
 * Färdigt material att publicera själv.
 *
 * ── Vad det här är, och vad det inte är ─────────────────────────────────────
 *
 * Inte en annonstjänst. Restaurangen har redan konton, följare och en telefon;
 * det den saknar är en affisch som är utskriven och en text som är skriven.
 * Båda finns här, och båda publiceras av den som äger kontot.
 *
 * ── Varför affischen skrivs ut och inte laddas ner ──────────────────────────
 *
 * En PNG kräver att något ritar den — en canvas i webbläsaren eller en
 * bildtjänst på servern — och resultatet blir en fil i en nedladdningsmapp som
 * ingen hittar igen. Utskrift går genom webbläsaren, ser likadan ut som den
 * kommer ut, och är vad man ändå gör med en affisch. Samma väg som
 * bordsdekalerna (`/dashboard/bord`).
 *
 * Storyrutan är däremot till för att FOTOGRAFERAS av telefonen som ska
 * publicera den. Därför 9:16 på skärmen och inget nedladdningsklick.
 */
export function MarketingKit({
  restaurantName,
  city,
  url,
  qrSvg,
  labels,
  guestTexts,
  guestLanguage,
}: {
  restaurantName: string;
  city: string;
  url: string;
  /** Färdig SVG från servern. Ingen QR-generering i webbläsaren. */
  qrSvg: string;
  labels: Dictionary["staff"]["marketing"];
  /** Texterna gästerna ska läsa — på restaurangens LANDS språk. */
  guestTexts: Dictionary["marketing"];
  guestLanguage: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      // Utfällt textfält som reserv. Utan HTTPS eller med blockerat urklipp
      // ska texten fortfarande gå att markera för hand.
      setCopied(`fail:${key}`);
    }
  }

  const filled = {
    whatsapp: fill(guestTexts.whatsapp, { name: restaurantName, url }),
    instagram: fill(guestTexts.instagram, { name: restaurantName, city }),
    google: fill(guestTexts.google, { name: restaurantName, url }),
  };

  return (
    <div className="mt-6 space-y-10">
      <p className="text-sm text-[var(--muted)]">
        {fill(labels.languageNote, { language: guestLanguage })}
      </p>

      {/* ── Affischen ─────────────────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3 print:hidden">
          <h2 className="font-display text-2xl">{labels.posterTitle}</h2>
          <button type="button" onClick={() => window.print()} className="btn btn-secondary">
            <Printer size={16} aria-hidden="true" />
            {labels.print}
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)] print:hidden">{labels.posterHint}</p>

        {/*
          A5 i stående format. Måtten står i millimeter därför att arket gör
          det: en affisch mätt i pixlar blir olika stor på olika skrivare.
        */}
        <div className="card mt-4 flex flex-col items-center gap-6 p-8 text-center print:h-[297mm] print:w-[210mm] print:justify-center print:border-0 print:shadow-none">
          <p className="label-caps">{guestTexts.posterEyebrow}</p>
          <p className="font-display text-4xl">{restaurantName}</p>

          <div
            className="w-56"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />

          <p className="font-display max-w-xs text-2xl leading-snug">
            {guestTexts.posterHeadline}
          </p>
          <p className="text-[var(--muted)]">{guestTexts.posterBody}</p>
          <p className="font-mono text-sm break-all">{url}</p>
        </div>
      </section>

      {/* ── Storyrutan ────────────────────────────────────────────────────── */}
      <section className="print:hidden">
        <h2 className="font-display text-2xl">{labels.storyTitle}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{labels.storyHint}</p>

        <div className="mt-4 flex justify-center">
          <div className="flex aspect-[9/16] w-64 flex-col items-center justify-center gap-5 rounded-[var(--radius)] bg-burp-600 p-6 text-center text-white">
            <p className="font-display text-2xl leading-tight">{guestTexts.storyHeadline}</p>

            <div
              className="w-32 rounded bg-white p-2"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />

            <p className="text-lg font-medium">{restaurantName}</p>
            <p className="text-sm opacity-90">{guestTexts.storyBody}</p>
          </div>
        </div>
      </section>

      {/* ── Texterna ──────────────────────────────────────────────────────── */}
      <section className="print:hidden">
        <h2 className="font-display text-2xl">{labels.textsTitle}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{labels.textsHint}</p>

        <div className="mt-4 space-y-4">
          <CopyBlock
            title={labels.whatsapp}
            text={filled.whatsapp}
            copied={copied === "whatsapp"}
            failed={copied === "fail:whatsapp"}
            copyLabel={labels.copy}
            copiedLabel={labels.copied}
            onCopy={() => copy("whatsapp", filled.whatsapp)}
          />
          <CopyBlock
            title={labels.instagram}
            text={filled.instagram}
            copied={copied === "instagram"}
            failed={copied === "fail:instagram"}
            copyLabel={labels.copy}
            copiedLabel={labels.copied}
            onCopy={() => copy("instagram", filled.instagram)}
          />
          <CopyBlock
            title={labels.google}
            text={filled.google}
            copied={copied === "google"}
            failed={copied === "fail:google"}
            copyLabel={labels.copy}
            copiedLabel={labels.copied}
            onCopy={() => copy("google", filled.google)}
          />
        </div>

        {/*
          Google-profilen är restaurangens egen och ligger utanför Burp.
          Att låtsas att vi publicerar där hade varit ett löfte vi inte kan
          hålla — Google har ingen skriv-endpoint för det här.
        */}
        <p className="mt-4 text-sm text-[var(--muted)]">{labels.googleHint}</p>
      </section>
    </div>
  );
}

function CopyBlock({
  title,
  text,
  copied,
  failed,
  copyLabel,
  copiedLabel,
  onCopy,
}: {
  title: string;
  text: string;
  copied: boolean;
  failed: boolean;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label-caps">{title}</p>
        <button type="button" onClick={onCopy} className="btn btn-secondary">
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>

      {/* Texten ligger i ett fält och inte i ett stycke: går urklippet inte att
          nå ska den fortfarande gå att markera och kopiera för hand. */}
      <textarea
        readOnly
        value={text}
        rows={4}
        className="field mt-3 w-full resize-y font-sans text-sm"
        onFocus={(event) => event.currentTarget.select()}
      />

      {failed ? <p className="mt-2 text-sm text-[var(--muted)]">{copyLabel}</p> : null}
    </div>
  );
}
