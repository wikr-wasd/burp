"use client";

import { useState, useTransition } from "react";
import { Copy, Gift, Plus } from "lucide-react";
import { formatMoney, type CurrencyCode } from "@burp/core";
import {
  issueGiftCard,
  setGiftCardActive,
} from "@/app/dashboard/presentkort/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Presentkort i personalytan.
 *
 * Koden visas EN gång efter utgivning, stort och kopieringsbart — den ska
 * skrivas på ett kort eller skickas i ett mejl, och den som ger ut det står
 * med en gäst framför sig. Sedan står den i listan som vanlig text, eftersom
 * personalen måste kunna slå upp ett kort en gäst tappat bort.
 */

export interface GiftCardRow {
  id: string;
  code: string;
  issuedOre: number;
  balanceOre: number;
  expiresAt: string | null;
  isActive: boolean;
  issuedToEmail: string | null;
  note: string | null;
}

export function GiftCardManager({
  cards,
  currency,
  labels,
}: {
  cards: GiftCardRow[];
  currency: CurrencyCode;
  /** Rapportytornas texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["reports"];
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await issueGiftCard({ amount, email, note, expiresAt });
      if (result.ok && result.code) {
        setIssued(result.code);
        setAmount("");
        setEmail("");
        setNote("");
        setExpiresAt("");
        setOpen(false);
      } else {
        setError(result.message ?? "Presentkortet kunde inte skapas.");
      }
    });
  }

  return (
    <div className="mt-8">
      {issued ? (
        <div className="card border-green-600/40 bg-green-50 p-4 dark:bg-green-900/30">
          <p className="label-caps">{labels.giftCardIssued}</p>
          <p className="mt-2 font-display text-3xl tracking-widest tabular-nums">{issued}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {labels.giftCardIssuedHint}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(issued)}
              className="btn btn-secondary"
            >
              <Copy size={16} aria-hidden="true" />
              {labels.copy}
            </button>
            <button type="button" onClick={() => setIssued(null)} className="btn btn-secondary">
              {labels.copied}
            </button>
          </div>
        </div>
      ) : open ? (
        <div className="card p-4">
          <h2 className="font-display text-xl">{labels.newGiftCard}</h2>

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="w-40">
              <span className="label-caps">{labels.amount}</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={fill(labels.amountIn, { currency })}
                className="field mt-1.5 tabular-nums"
              />
            </label>

            <label className="w-40">
              <span className="label-caps">{labels.validUntil}</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="field mt-1.5"
              />
              <span className="mt-1 block text-xs text-[var(--muted)]">
                {labels.noEndDate}
              </span>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="label-caps">
              {labels.recipient}{" "}
              <span className="normal-case">{labels.optional}</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={labels.recipientPlaceholder}
              className="field mt-1.5"
            />
          </label>

          <label className="mt-4 block">
            <span className="label-caps">
              {labels.note}{" "}
              <span className="normal-case">{labels.optional}</span>
            </span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={labels.notePlaceholder}
              className="field mt-1.5"
            />
          </label>

          {error ? (
            <p role="alert" className="mt-4 border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={submit} disabled={pending} className="btn btn-primary">
              {pending ? labels.creating : labels.issue}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">
              {labels.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
          <Plus size={16} aria-hidden="true" />
          {labels.newGiftCard}
        </button>
      )}

      {cards.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Gift}
            title={labels.giftCardsEmptyTitle}
            body={labels.giftCardsEmptyBody}
          />
        </div>
      ) : (
        <ul className="card mt-8 divide-y divide-[var(--rule)]">
          {cards.map((card) => (
            <GiftCardRowView key={card.id} card={card} currency={currency} labels={labels} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GiftCardRowView({
  card,
  currency,
  labels,
}: {
  card: GiftCardRow;
  currency: CurrencyCode;
  /** Rapportytornas texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["reports"];
}) {
  const [pending, startTransition] = useTransition();
  const isSpent = card.balanceOre <= 0;

  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
      <span
        className={`font-mono tabular-nums ${card.isActive && !isSpent ? "" : "text-[var(--muted)] line-through"}`}
      >
        {card.code}
      </span>

      <span className="font-semibold tabular-nums">
        {formatMoney(card.balanceOre, currency)}
      </span>
      {card.balanceOre !== card.issuedOre ? (
        <span className="text-sm text-[var(--muted)]">
          av {formatMoney(card.issuedOre, currency)}
        </span>
      ) : null}

      <span className="mr-auto text-sm text-[var(--muted)]">
        {card.issuedToEmail ?? card.note ?? ""}
        {card.expiresAt
          ? ` · till ${new Date(card.expiresAt).toLocaleDateString("sv-SE")}`
          : ""}
      </span>

      {/* Spärr, inte borttagning. Transaktionerna är det enda som säger vad
          kortet är värt, och de pekar på det. */}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setGiftCardActive(card.id, !card.isActive);
          })
        }
        className="min-h-11 text-sm text-[var(--muted)] underline underline-offset-2 hover:text-burp-600"
      >
        {card.isActive ? labels.block : labels.unblock}
      </button>
    </li>
  );
}
