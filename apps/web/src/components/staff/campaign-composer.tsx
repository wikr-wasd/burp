"use client";

import { useState, useTransition } from "react";
import { Mail, Send, Users, Wallet } from "lucide-react";
import { sendCampaign } from "@/app/dashboard/marknadsforing/campaign-actions";
import {
  CAMPAIGN_TEMPLATES,
  type CampaignRow,
  type CampaignTemplate,
} from "@/lib/campaign-types";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Utskicket, som en enda ruta.
 *
 * ── Mallen är ett utgångsläge, inte en tvångströja ─────────────────────────
 *
 * Att välja mall fyller ämnesraden och texten. Båda går att skriva om — det
 * är restaurangens brev och dess egna ord. Mallen finns för att en tom ruta
 * är det som gör att utskicket aldrig blir av.
 *
 * ── Vad som INTE går att göra här ──────────────────────────────────────────
 *
 * Välja mottagare. Listan är given: gäster som sagt ja OCH handlat hos
 * restaurangen. Ett fält att skriva in adresser i hade varit vägen till exakt
 * den spam som gör att nästa gäst inte kryssar i rutan — och till böter som
 * träffar Burp, inte restaurangen.
 *
 * ── Knappen är avstängd av en anledning som står utskriven ─────────────────
 *
 * Utan mottagare, utan saldo, utan ämnesrad eller utan text går det inte att
 * skicka. Varje sådant läge har sin egen mening under knappen. En avstängd
 * knapp utan förklaring är en produkt som säger nej utan att säga varför.
 */
export function CampaignComposer({
  labels,
  templates,
  credits,
  audience,
  history,
  guestLanguage,
}: {
  labels: Dictionary["staff"]["campaigns"];
  /** Ämnesrad och text per mall, redan på gästernas språk. */
  templates: Record<CampaignTemplate, { subject: string; body: string }>;
  credits: number;
  audience: number;
  history: CampaignRow[];
  /** Språknamnet på sitt eget språk — "Bosanski", "Deutsch". */
  guestLanguage: string;
}) {
  const [template, setTemplate] = useState<CampaignTemplate>("NEWS");
  const [subject, setSubject] = useState(templates.NEWS.subject);
  const [body, setBody] = useState(templates.NEWS.body);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: CampaignTemplate) {
    setTemplate(next);
    // Skriver över fälten med flit. Den som ändrat texten och sedan byter mall
    // har bytt ärende — och en halv gammal text under en ny rubrik är värre
    // än en tom ruta.
    setSubject(templates[next].subject);
    setBody(templates[next].body);
    setFeedback(null);
  }

  const enough = credits >= audience;
  const ready = audience > 0 && enough && subject.trim() !== "" && body.trim() !== "";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="flex items-center gap-2 text-sm">
          <Users size={16} aria-hidden="true" className="text-burp-600" />
          <span className="tabular-nums">{fill(labels.audience, { n: audience })}</span>
        </p>
        <p className="flex items-center gap-2 text-sm">
          <Wallet size={16} aria-hidden="true" className="text-burp-600" />
          <span className="tabular-nums">{fill(labels.credits, { n: credits })}</span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {CAMPAIGN_TEMPLATES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === template}
            onClick={() => choose(candidate)}
            className={`min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors ${
              candidate === template
                ? "border-burp-600 bg-burp-600 text-white"
                : "border-[var(--rule)] hover:border-burp-600"
            }`}
          >
            {templates[candidate].subject}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="label-caps">{labels.subject}</span>
        <input
          type="text"
          value={subject}
          maxLength={120}
          onChange={(event) => setSubject(event.target.value)}
          className="field mt-1.5"
        />
      </label>

      <label className="mt-4 block">
        <span className="label-caps">{labels.body}</span>
        <textarea
          value={body}
          maxLength={4000}
          rows={6}
          onChange={(event) => setBody(event.target.value)}
          className="field mt-1.5 resize-y"
        />
      </label>

      <p className="mt-2 text-xs text-[var(--muted)]">
        {fill(labels.language, { language: guestLanguage })}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() => {
            startTransition(async () => {
              const result = await sendCampaign({ template, subject, body });

              setFeedback(
                result.ok
                  ? { ok: true, message: fill(labels.sent, { n: result.delivered ?? 0 }) }
                  : { ok: false, message: result.message ?? labels.noCredits },
              );
            });
          }}
          className="btn btn-primary"
        >
          <Send size={16} aria-hidden="true" />
          {pending ? labels.sending : labels.send}
        </button>

        {/* Varför knappen är avstängd, utskrivet. */}
        {audience === 0 ? (
          <p className="text-sm text-[var(--muted)]">{labels.noAudience}</p>
        ) : !enough ? (
          <p className="text-sm text-[var(--muted)]">{labels.noCredits}</p>
        ) : null}
      </div>

      {feedback ? (
        <p
          role="status"
          className={`mt-3 text-sm ${
            feedback.ok ? "text-green-700 dark:text-green-400" : "text-burp-700 dark:text-burp-300"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <section className="mt-10">
        <h3 className="label-caps">{labels.history}</h3>

        {history.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">{labels.historyEmpty}</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--rule)]">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <Mail size={14} aria-hidden="true" className="shrink-0 text-[var(--muted)]" />
                <span className="min-w-0 flex-1 truncate text-sm">{row.subject}</span>
                <span className="text-xs tabular-nums text-[var(--muted)]">
                  {fill(labels.audience, { n: row.recipients })}
                </span>
                <span className="text-xs text-[var(--muted)]">{labels[`status${row.status}`]}</span>
                {row.failed > 0 ? (
                  <span className="w-full text-xs text-[var(--muted)]">
                    {fill(labels.failedSome, { n: row.failed })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
