"use client";

import { useState, useTransition } from "react";
import { Banknote, Check, RotateCcw, TriangleAlert } from "lucide-react";
import {
  formatAmountInput,
  formatMoney,
  parseAmount,
  settleCash,
  type CurrencyCode,
} from "@burp/core";
import { refundPayment, registerCashPayment } from "@/app/dashboard/kassa/actions";
import { EmptyState } from "@/components/ui/empty-state";
import type { RegisterOrder } from "@/lib/cash-register";

/**
 * Kassavyn (öppen fråga 6).
 *
 * Personalen kvitterar vad som faktiskt togs emot. Fältet är förifyllt med
 * notan, eftersom det är svaret i nio fall av tio — men det går att ändra, och
 * det är hela poängen. Serbiska dinarer har noll decimaler och bosniska sedlar
 * slutar i praktiken på hela och halva mark; en nota på 12,37 KM betalas med
 * 12,40. Ett fält som vägrar ta emot det tvingar fram en felaktig siffra.
 *
 * Avviker beloppet från notan säger knappen det rakt ut innan man trycker.
 * Avvikelsen är oftast avrundning och ibland en rabatt i lokalen — båda ska
 * synas, ingen ska stoppas.
 *
 * Prisberäkningen här är en spegling för att kunna visa skillnaden direkt.
 * Servern räknar om från ordersumman i databasen och det är den siffran som
 * sparas; samma princip som varukorgen.
 */

export function CashRegister({
  unsettled,
  settled,
  canRefund,
}: {
  unsettled: RegisterOrder[];
  settled: RegisterOrder[];
  /**
   * Ägare och chef. Servitören ser raderna men får inte lämna tillbaka pengar
   * — samma gräns som statistiksidan drar.
   */
  canRefund: boolean;
}) {
  return (
    <div className="mt-8">
      <section>
        <h2 className="font-display text-2xl">Att kvittera</h2>

        {unsettled.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={Check}
              title="Allt är kvitterat"
              body="Varje slutförd order det senaste dygnet har en registrerad betalning."
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {unsettled.map((order) => (
              <UnsettledRow key={order.id} order={order} />
            ))}
          </ul>
        )}
      </section>

      {settled.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-display text-2xl">Betalt i dag</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {/* Beloppen summeras inte. En restaurang har en valuta, men samma
                regel gäller här som på plattformsöversikten: summan skrivs där
                den är säker, inte där den ser bra ut. */}
            Facit över passet, kontanter och kort. Raderna går inte att ändra — en
            felkvittering rättas med en motbokning, inte genom att skriva om historien.
          </p>

          <ul className="card mt-3 divide-y divide-[var(--rule)]">
            {settled.map((order) => (
              <SettledRow key={order.id} order={order} canRefund={canRefund} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ── Att kvittera ────────────────────────────────────────────────────────── */

function UnsettledRow({ order }: { order: RegisterOrder }) {
  const [amount, setAmount] = useState(() => formatAmountInput(order.totalOre, order.currency));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const receivedOre = parseAmount(amount, order.currency);
  const settlement =
    receivedOre !== null && receivedOre > 0 ? settleCash(receivedOre, order.totalOre) : null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await registerCashPayment(order.id, amount);
      if (!result.ok) setError(result.message ?? "Kvitteringen gick inte igenom.");
    });
  }

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-xl">{orderLabel(order)}</p>
        <p className="text-lg font-semibold tabular-nums">
          {formatMoney(order.totalOre, order.currency)}
        </p>
      </div>

      {order.itemSummary ? (
        <p className="mt-1 text-sm text-[var(--muted)]">{order.itemSummary}</p>
      ) : null}

      <p className="label-caps mt-1">Serverad {order.completedLabel}</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1">
          <span className="label-caps">Mottaget belopp</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="field mt-1.5 tabular-nums"
          />
        </label>

        <button
          type="button"
          disabled={pending || settlement === null}
          onClick={submit}
          className="btn btn-primary"
        >
          <Banknote size={16} aria-hidden="true" />
          {pending ? "Kvitterar…" : "Kvittera"}
        </button>
      </div>

      {/* Avvikelsen står ut innan man trycker, inte efteråt. En rad som säger
          "3 fening över" är en bekräftelse; samma rad efter registreringen är
          en anklagelse. */}
      {settlement && settlement.kind !== "EXACT" ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-[var(--muted)]">
          <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {settlement.kind === "OVER" ? "Över notan med " : "Under notan med "}
            <span className="font-medium tabular-nums">
              {formatMoney(Math.abs(settlement.differenceOre), order.currency)}
            </span>
            . Registreras som det står — avrundning och rabatt i lokalen ska synas.
          </span>
        </p>
      ) : null}

      {receivedOre === null && amount.trim() !== "" ? (
        <p className="mt-3 text-sm text-burp-600">Beloppet gick inte att tolka.</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/* ── Kvitterat ───────────────────────────────────────────────────────────── */

/** Vad raden ska säga att gästen betalade med. */
const PROVIDER_LABELS: Record<string, string> = {
  CASH: "Kontant",
  GIFT_CARD: "Presentkort",
  STRIPE: "Kort",
  MONRI: "Kort",
};

function SettledRow({ order, canRefund }: { order: RegisterOrder; canRefund: boolean }) {
  const payment = order.payment!;
  const difference = payment.amountOre - order.totalOre;
  const remainingOre = payment.amountOre - payment.refundedOre;

  const [open, setOpen] = useState(false);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Check size={16} aria-hidden="true" className="shrink-0 text-green-600" />
        <span className="font-medium">{orderLabel(order)}</span>
        <span className="text-sm text-[var(--muted)]">
          {PROVIDER_LABELS[payment.provider] ?? payment.provider} · {payment.capturedLabel}
        </span>

        <span className="mr-auto" />

        {difference !== 0 ? (
          <span className="text-sm tabular-nums text-[var(--muted)]">
            notan {formatMoney(order.totalOre, order.currency)}
          </span>
        ) : null}
        <span
          className={`font-semibold tabular-nums ${payment.refundedOre > 0 ? "text-[var(--muted)] line-through" : ""}`}
        >
          {formatMoney(payment.amountOre, order.currency)}
        </span>
      </div>

      {payment.refundedOre > 0 ? (
        <p className="mt-1 flex items-center gap-2 text-sm text-[var(--muted)]">
          <RotateCcw size={14} aria-hidden="true" className="shrink-0" />
          Återbetalt {formatMoney(payment.refundedOre, order.currency)}
          {remainingOre > 0 ? ` · kvar ${formatMoney(remainingOre, order.currency)}` : ""}
        </p>
      ) : null}

      {canRefund && remainingOre > 0 ? (
        open ? (
          <RefundForm
            payment={payment}
            currency={order.currency}
            remainingOre={remainingOre}
            onClose={() => setOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 text-sm text-[var(--muted)] underline underline-offset-2 hover:text-burp-600"
          >
            Betala tillbaka
          </button>
        )
      ) : null}
    </li>
  );
}

/**
 * Motbokningen.
 *
 * Beloppet är förifyllt med vad som återstår, eftersom hela notan är det
 * vanliga fallet — men det går att sänka. En kall rätt av fyra ska inte kräva
 * att hela måltiden betalas tillbaka.
 *
 * Skälet är obligatoriskt. En återbetalning utan skäl är oförklarlig för den
 * som stämmer av kassan tre månader senare, och databasen kräver det ändå.
 */
function RefundForm({
  payment,
  currency,
  remainingOre,
  onClose,
}: {
  payment: NonNullable<RegisterOrder["payment"]>;
  currency: CurrencyCode;
  remainingOre: number;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(() => formatAmountInput(remainingOre, currency));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountOre = parseAmount(amount, currency);
  const tooMuch = amountOre !== null && amountOre > remainingOre;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await refundPayment(payment.id, amount, reason);
      if (result.ok) onClose();
      else setError(result.message ?? "Återbetalningen gick inte igenom.");
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--rule)] p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-32">
          <span className="label-caps">Belopp</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="field mt-1.5 tabular-nums"
          />
        </label>

        <label className="min-w-48 flex-1">
          <span className="label-caps">Varför</span>
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="T.ex. kall soppa"
            className="field mt-1.5"
          />
        </label>
      </div>

      {tooMuch ? (
        <p className="mt-2 text-sm text-burp-600">
          Mer än vad som återstår ({formatMoney(remainingOre, currency)}).
        </p>
      ) : null}

      {amountOre === null && amount.trim() !== "" ? (
        <p className="mt-2 text-sm text-burp-600">Beloppet gick inte att tolka.</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || amountOre === null || tooMuch || !reason.trim()}
          className="btn btn-primary"
        >
          <RotateCcw size={16} aria-hidden="true" />
          {pending ? "Betalar tillbaka…" : "Betala tillbaka"}
        </button>
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Avbryt
        </button>
      </div>
    </div>
  );
}

function orderLabel(order: RegisterOrder): string {
  if (order.tableNumber) return `Bord ${order.tableNumber}`;
  return order.type === "PICKUP" ? "Avhämtning" : order.type === "DELIVERY" ? "Leverans" : "Bord";
}
