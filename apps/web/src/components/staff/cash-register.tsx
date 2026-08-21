"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { Banknote, Check, CreditCard, RotateCcw, TriangleAlert, Users } from "lucide-react";
import {
  formatAmountInput,
  formatMoney,
  parseAmount,
  settleCash,
  type CurrencyCode,
  type PaymentProviderId,
} from "@burp/core";
import {
  closeTableSession,
  refundPayment,
  registerPayment,
  settleTableSession,
} from "@/app/dashboard/kassa/actions";
import { EmptyState } from "@/components/ui/empty-state";
import type { RegisterOrder, RegisterTable, SettledPayment } from "@/lib/cash-register";

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

/**
 * Betalsättens namn, tillgängliga för hela kassans träd.
 *
 * En context och inte en prop, därför att uppslaget behövs fem nivåer ned —
 * i notraden, i leverantörsvalet, i den kvitterade raden och två gånger i
 * betalningsraden. Att tråda samma oföränderliga tabell genom fem
 * komponenter hade gjort varje framtida ändring till fem ändringar.
 *
 * Värdet kommer in som en prop till `CashRegister` och därifrån in i
 * providern. Ordboken importeras alltså aldrig av klientkoden — texterna
 * hämtas på servern och skickas hit som rena strängar.
 */
const ProviderLabels = createContext<Record<PaymentProviderId, string> | null>(null);

/*
 * Vidgas till `Record<string, string>` vid uppslaget, med flit.
 *
 * `payments.provider` kommer ur databasen som en sträng och kan i teorin bära
 * en leverantör den här versionen av gränssnittet inte känner till. Varje
 * uppslag har därför ett `?? payment.provider` efter sig, och den fallbacken
 * är oåtkomlig om typen låtsas att nyckeln alltid finns. En okänd leverantör
 * ska visa sin kod i kassan — inte fälla sidan som räknar pengarna.
 */
function useProviderLabels(): Record<string, string> {
  const labels = useContext(ProviderLabels);
  if (!labels) throw new Error("ProviderLabels saknas — kassan måste renderas inuti CashRegister.");
  return labels;
}

export function CashRegister({
  tables,
  unsettled,
  settled,
  canRefund,
  providerLabels,
}: {
  tables: RegisterTable[];
  unsettled: RegisterOrder[];
  settled: RegisterOrder[];
  /**
   * Ägare och chef. Servitören ser raderna men får inte lämna tillbaka pengar
   * — samma gräns som statistiksidan drar.
   */
  canRefund: boolean;
  /** Betalsättens namn ur ordboken. Rena strängar — komponenten är klientkod. */
  providerLabels: Record<PaymentProviderId, string>;
}) {
  const nothingLeft = tables.length === 0 && unsettled.length === 0;

  return (
    <ProviderLabels value={providerLabels}>
    <div className="mt-8">
      <section>
        <h2 className="font-display text-2xl">Att kvittera</h2>

        {nothingLeft ? (
          <div className="mt-3">
            <EmptyState
              icon={Check}
              title="Allt är kvitterat"
              body="Varje slutförd order det senaste dygnet har en registrerad betalning."
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {/* Borden först. Ett sällskap står och väntar med pengarna i handen;
                en avhämtning som ingen kvitterat gör inte det. */}
            {tables.map((table) => (
              <TableBillRow key={table.sessionId} table={table} />
            ))}
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
    </ProviderLabels>
  );
}

/* ── Bordets gemensamma nota ─────────────────────────────────────────────── */

/**
 * Ett bordssällskaps nota.
 *
 * Ser ut som en order i listan men är flera. Det är avsiktligt: servitören tar
 * emot ETT handslag och ska trycka EN gång. Att fördelningen per order sker i
 * databasen är bokföringens problem, inte hennes.
 *
 * Ordrarna går att fälla ut, för den som vill se vad sällskapet beställt eller
 * behöver kvittera en enda av dem.
 */
function TableBillRow({ table }: { table: RegisterTable }) {
  const [amount, setAmount] = useState(() => formatAmountInput(table.dueOre, table.currency));
  const [provider, setProvider] = useState<PaymentProviderId>("CASH");
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const receivedOre = parseAmount(amount, table.currency);
  const settlement =
    receivedOre !== null && receivedOre > 0 ? settleCash(receivedOre, table.dueOre) : null;

  function settle() {
    setError(null);
    startTransition(async () => {
      const result = await settleTableSession(table.sessionId, amount, provider);
      if (!result.ok) setError(result.message ?? "Kvitteringen gick inte igenom.");
    });
  }

  function close() {
    if (
      !window.confirm(
        "Stäng notan utan att kvittera något? Ordrarna ligger kvar och går att kvittera var för sig.",
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await closeTableSession(table.sessionId);
      if (!result.ok) setError(result.message ?? "Notan kunde inte stängas.");
    });
  }

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 font-display text-xl">
          <Users size={18} aria-hidden="true" className="text-[var(--muted)]" />
          {table.tableNumber ? `Bord ${table.tableNumber}` : "Bord"}
        </p>
        <p className="text-lg font-semibold tabular-nums">
          {formatMoney(table.dueOre, table.currency)}
        </p>
      </div>

      <p className="mt-1 text-sm text-[var(--muted)]">
        {table.orders.length === 1
          ? "En beställning"
          : `${table.orders.length} beställningar på samma nota`}
        {table.paidOre > 0
          ? ` · ${formatMoney(table.paidOre, table.currency)} redan betalt av ${formatMoney(table.totalOre, table.currency)}`
          : ""}
      </p>

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-sm text-[var(--muted)] underline underline-offset-2 hover:text-burp-600"
      >
        {expanded ? "Dölj beställningarna" : "Visa beställningarna"}
      </button>

      {expanded ? (
        <ul className="mt-3 space-y-3 border-l-2 border-[var(--rule)] pl-3">
          {table.orders.map((order) => (
            <UnsettledRow key={order.id} order={order} compact />
          ))}
        </ul>
      ) : null}

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

        <ProviderChoice value={provider} onChange={setProvider} disabled={pending} />

        <button
          type="button"
          disabled={pending || settlement === null}
          onClick={settle}
          className="btn btn-primary"
        >
          {provider === "CASH" ? (
            <Banknote size={16} aria-hidden="true" />
          ) : (
            <CreditCard size={16} aria-hidden="true" />
          )}
          {pending ? "Kvitterar…" : "Kvittera hela bordet"}
        </button>
      </div>

      {settlement && settlement.kind !== "EXACT" ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-[var(--muted)]">
          <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {settlement.kind === "OVER" ? "Över notan med " : "Under notan med "}
            <span className="font-medium tabular-nums">
              {formatMoney(Math.abs(settlement.differenceOre), table.currency)}
            </span>
            . Fördelas på bordets beställningar i proportion till vad var och en kostar.
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

      <button
        type="button"
        onClick={close}
        disabled={pending}
        className="mt-3 text-sm text-[var(--muted)] underline underline-offset-2 hover:text-burp-600"
      >
        Stäng notan utan att kvittera
      </button>
    </li>
  );
}

/* ── Att kvittera ────────────────────────────────────────────────────────── */

function UnsettledRow({
  order,
  compact = false,
}: {
  order: RegisterOrder;
  /** Inuti ett bords nota. Då bär bordet kortet, och raden ska inte ha ett eget. */
  compact?: boolean;
}) {
  const providerLabels = useProviderLabels();
  // Förifyllt med vad som ÅTERSTÅR, inte med hela notan. Har gästen betalat
  // halva med presentkort är det bara resten som ska tas emot kontant, och ett
  // fält som föreslår hela notan hade fått kassan att gå plus varje gång.
  const [amount, setAmount] = useState(() => formatAmountInput(order.dueOre, order.currency));
  const [provider, setProvider] = useState<PaymentProviderId>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const receivedOre = parseAmount(amount, order.currency);
  const settlement =
    receivedOre !== null && receivedOre > 0 ? settleCash(receivedOre, order.dueOre) : null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await registerPayment(order.id, amount, provider);
      if (!result.ok) setError(result.message ?? "Kvitteringen gick inte igenom.");
    });
  }

  return (
    <li className={compact ? "" : "card p-4"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={compact ? "font-medium" : "font-display text-xl"}>{orderLabel(order)}</p>
        <p className="text-lg font-semibold tabular-nums">
          {formatMoney(order.dueOre, order.currency)}
        </p>
      </div>

      {order.itemSummary ? (
        <p className="mt-1 text-sm text-[var(--muted)]">{order.itemSummary}</p>
      ) : null}

      <p className="label-caps mt-1">Serverad {order.completedLabel}</p>

      {/* Delbetalt. Personalen ska se varför beloppet i fältet är lägre än
          notan — annars ser det ut som ett fel. */}
      {order.paidOre > 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {order.payments.map((payment) => providerLabels[payment.provider] ?? payment.provider).join(", ")}
          {" · "}
          {formatMoney(order.paidOre, order.currency)} betalt av{" "}
          {formatMoney(order.totalOre, order.currency)}
        </p>
      ) : null}

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

        <ProviderChoice value={provider} onChange={setProvider} disabled={pending} />

        <button
          type="button"
          disabled={pending || settlement === null}
          onClick={submit}
          className="btn btn-primary"
        >
          {provider === "CASH" ? (
            <Banknote size={16} aria-hidden="true" />
          ) : (
            <CreditCard size={16} aria-hidden="true" />
          )}
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

/* ── Betalsätt ───────────────────────────────────────────────────────────── */

/**
 * Vad gästen betalade med, kontant eller i restaurangens egen kortterminal.
 *
 * Två knappar och inte en rullgardin: personalen står vid disken med en gäst
 * framför sig, och valet ska gå att träffa utan att sikta. Kontant är förvalt
 * — det är fortfarande det vanligaste i Bosnien och Serbien, och ett förval som
 * stämmer i nio fall av tio sparar mer tid än det kostar de gånger det inte gör.
 *
 * Burp läser inte terminalen. Valet säger bara vad personalen tog emot, precis
 * som beloppet gör — men utan det bokförs varje kortbetalning som sedlar, och
 * kassaavstämningen tror att det ligger pengar i lådan som inte finns.
 */
const REGISTERABLE: readonly PaymentProviderId[] = ["CASH", "TERMINAL"];

function ProviderChoice({
  value,
  onChange,
  disabled,
}: {
  value: PaymentProviderId;
  onChange: (provider: PaymentProviderId) => void;
  disabled?: boolean;
}) {
  const providerLabels = useProviderLabels();
  return (
    <fieldset className="min-w-0">
      <legend className="label-caps">Betalsätt</legend>
      <div className="mt-1.5 flex gap-2">
        {REGISTERABLE.map((provider) => {
          const active = provider === value;
          const Icon = provider === "CASH" ? Banknote : CreditCard;

          return (
            <button
              key={provider}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(provider)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-[0.5rem] border px-3 text-sm whitespace-nowrap transition-colors duration-[var(--speed)] disabled:opacity-50 ${
                active
                  ? "border-burp-600 bg-burp-50 font-medium text-burp-700 dark:bg-burp-900/40 dark:text-burp-100"
                  : "border-[var(--rule-control)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {providerLabels[provider]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ── Kvitterat ───────────────────────────────────────────────────────────── */

/**
 * Vad raden ska säga att gästen betalade med.
 *
 * Låg tidigare som en egen lista här. Den bor nu i `@burp/core` tillsammans med
 * leverantörerna själva, så att kassan och gästens kvitto inte kan säga olika
 * saker om samma betalning.
 */


function SettledRow({ order, canRefund }: { order: RegisterOrder; canRefund: boolean }) {
  const providerLabels = useProviderLabels();
  const difference = order.paidOre - order.totalOre;
  const refundedOre = order.payments.reduce((sum, payment) => sum + payment.refundedOre, 0);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Check size={16} aria-hidden="true" className="shrink-0 text-green-600" />
        <span className="font-medium">{orderLabel(order)}</span>
        <span className="text-sm text-[var(--muted)]">
          {order.payments
            .map((payment) => providerLabels[payment.provider] ?? payment.provider)
            .join(" + ")}
          {order.payments[0] ? ` · ${order.payments[0].capturedLabel}` : ""}
        </span>

        <span className="mr-auto" />

        {difference !== 0 ? (
          <span className="text-sm tabular-nums text-[var(--muted)]">
            notan {formatMoney(order.totalOre, order.currency)}
          </span>
        ) : null}
        <span
          className={`font-semibold tabular-nums ${refundedOre > 0 ? "text-[var(--muted)] line-through" : ""}`}
        >
          {formatMoney(order.paidOre, order.currency)}
        </span>
      </div>

      {/* En rad per betalmedel. Ett presentkort plus ett kort är två rader som
          ska gå att stämma av var för sig — och återbetalas var för sig. */}
      <ul className="mt-1 space-y-1">
        {order.payments.map((payment) => (
          <PaymentLine
            key={payment.id}
            payment={payment}
            currency={order.currency}
            canRefund={canRefund}
            showLabel={order.payments.length > 1}
          />
        ))}
      </ul>
    </li>
  );
}

function PaymentLine({
  payment,
  currency,
  canRefund,
  showLabel,
}: {
  payment: SettledPayment;
  currency: CurrencyCode;
  canRefund: boolean;
  showLabel: boolean;
}) {
  const providerLabels = useProviderLabels();
  const [open, setOpen] = useState(false);
  const remainingOre = payment.amountOre - payment.refundedOre;

  return (
    <li>
      {payment.refundedOre > 0 ? (
        <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <RotateCcw size={14} aria-hidden="true" className="shrink-0" />
          {showLabel ? `${providerLabels[payment.provider] ?? payment.provider}: ` : ""}
          återbetalt {formatMoney(payment.refundedOre, currency)}
          {remainingOre > 0 ? ` · kvar ${formatMoney(remainingOre, currency)}` : ""}
        </p>
      ) : null}

      {canRefund && remainingOre > 0 ? (
        open ? (
          <RefundForm
            payment={payment}
            currency={currency}
            remainingOre={remainingOre}
            onClose={() => setOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm text-[var(--muted)] underline underline-offset-2 hover:text-burp-600"
          >
            Betala tillbaka
            {showLabel ? ` ${providerLabels[payment.provider] ?? payment.provider}` : ""}
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
  payment: SettledPayment;
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

      {/* Var pengarna hamnar. Ett presentkort löses aldrig in mot kontanter —
          det är det som gör att Burp får ge ut dem utan tillstånd — och
          personalen ska inte stå och öppna kassalådan i onödan. */}
      <p className="mt-2 text-xs text-[var(--muted)]">
        {payment.provider === "GIFT_CARD"
          ? "Värdet läggs tillbaka på presentkortet, inte i kassan."
          : payment.provider === "CASH"
            ? "Registreras som en motbokning. Sedlarna lämnar ni tillbaka över disk."
            : payment.provider === "TERMINAL"
              ? "Registreras som en motbokning. Återbetalningen gör ni i terminalen — Burp når den inte."
              : "Går tillbaka till gästens kort via leverantören. Kan ta några dagar."}
      </p>

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
