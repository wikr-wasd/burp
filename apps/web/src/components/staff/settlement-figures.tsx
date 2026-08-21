import { formatMoney, type CurrencyCode } from "@burp/core";
import {
  SETTLEMENT_STATUS_LABELS,
  type SettlementNumbers,
  type SettlementStatus,
} from "@/lib/settlement-period";
import type { Dictionary } from "@/lib/i18n";

/**
 * Sifferuppställningen i en avräkning.
 *
 * En enda komponent, delad av restaurangens vy och Burps backoffice. Två
 * uppställningar hade glidit isär i vilka rader som visas — och den dagen läser
 * restaurangen en annan faktura än den Burp skickade.
 *
 * Ordningen är avsiktlig och läses uppifrån: vad som såldes, vad som gick
 * tillbaka, och vad som återstår att betala. Bruttot och dricksen står med
 * fastän ingetdera ska betalas till Burp — utan dem går det inte att se att
 * avgiften är rimlig, och dricksen står där just för att visa att den INTE är
 * med i underlaget.
 */
export function SettlementFigures({
  numbers,
  currency,
  labels,
}: {
  numbers: SettlementNumbers;
  currency: CurrencyCode;
  /** Rapportytornas texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["reports"];
}) {
  return (
    <dl className="divide-y divide-[var(--rule)]">
      <Row
        label={labels.orders}
        value={String(numbers.ordersCount)}
        hint={labels.completedInPeriod}
      />
      <Row
        label={labels.revenueInclVat}
        value={formatMoney(numbers.grossOre, currency)}
        hint="betalades direkt till er"
      />
      {numbers.tipsOre > 0 ? (
        <Row
          label="Dricks"
          value={formatMoney(numbers.tipsOre, currency)}
          hint={labels.tipsNotInFeeBase}
          muted
        />
      ) : null}
      {numbers.cashOre > 0 ? (
        <Row
          label="varav kontant i kassan"
          value={formatMoney(numbers.cashOre, currency)}
          muted
          indented
        />
      ) : null}
      {numbers.refundsOre > 0 ? (
        <Row
          label={labels.refundedToGuests}
          value={`−${formatMoney(numbers.refundsOre, currency)}`}
          muted
        />
      ) : null}

      <Row label="Burps avgift" value={formatMoney(numbers.feesOre, currency)} />
      {numbers.feeCreditOre > 0 ? (
        <Row
          label={labels.creditForRefunded}
          value={`−${formatMoney(numbers.feeCreditOre, currency)}`}
          muted
          indented
        />
      ) : null}

      <Row
        label={numbers.amountDueOre < 0 ? "Att kreditera" : "Att betala"}
        value={formatMoney(Math.abs(numbers.amountDueOre), currency)}
        strong
      />
    </dl>
  );
}

export function SettlementStatusBadge({ status }: { status: SettlementStatus }) {
  return (
    <span className={`badge ${STATUS_CLASS[status]}`}>{SETTLEMENT_STATUS_LABELS[status]}</span>
  );
}

/**
 * Grönt bara för betald. Handlingsrött vore fel här — en fakturerad avräkning
 * är inte ett fel, den väntar bara — och blått finns inte i produkten.
 */
const STATUS_CLASS: Record<SettlementStatus, string> = {
  DRAFT: "bg-[var(--background)] text-[var(--muted)]",
  INVOICED: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  PAID: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  VOID: "bg-[var(--background)] text-[var(--muted)] line-through",
};

function Row({
  label,
  value,
  hint,
  muted,
  indented,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  indented?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-4 py-3 ${
        muted ? "text-[var(--muted)]" : ""
      } ${strong ? "font-semibold" : ""}`}
    >
      <dt className={indented ? "pl-4" : ""}>
        {label}
        {hint ? <span className="ml-2 text-xs font-normal opacity-70">{hint}</span> : null}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
