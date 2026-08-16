"use client";

import { useState, useTransition } from "react";
import { Banknote, Check, TriangleAlert } from "lucide-react";
import { formatAmountInput, formatMoney, parseAmount, settleCash } from "@burp/core";
import { registerCashPayment } from "@/app/dashboard/kassa/actions";
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
}: {
  unsettled: RegisterOrder[];
  settled: RegisterOrder[];
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
          <h2 className="font-display text-2xl">Kvitterat i dag</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {/* Beloppen summeras inte. En restaurang har en valuta, men samma
                regel gäller här som på plattformsöversikten: summan skrivs där
                den är säker, inte där den ser bra ut. */}
            Facit över passet. Raderna går inte att ändra — en felkvittering rättas
            med en motbokning, inte genom att skriva om historien.
          </p>

          <ul className="card mt-3 divide-y divide-[var(--rule)]">
            {settled.map((order) => (
              <SettledRow key={order.id} order={order} />
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

function SettledRow({ order }: { order: RegisterOrder }) {
  const payment = order.payment!;
  const difference = payment.amountOre - order.totalOre;

  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
      <Check size={16} aria-hidden="true" className="shrink-0 text-green-600" />
      <span className="font-medium">{orderLabel(order)}</span>
      <span className="mr-auto text-sm text-[var(--muted)]">{payment.capturedLabel}</span>

      {difference !== 0 ? (
        <span className="text-sm tabular-nums text-[var(--muted)]">
          notan {formatMoney(order.totalOre, order.currency)}
        </span>
      ) : null}
      <span className="font-semibold tabular-nums">
        {formatMoney(payment.amountOre, order.currency)}
      </span>
    </li>
  );
}

function orderLabel(order: RegisterOrder): string {
  if (order.tableNumber) return `Bord ${order.tableNumber}`;
  return order.type === "PICKUP" ? "Avhämtning" : order.type === "DELIVERY" ? "Leverans" : "Bord";
}
