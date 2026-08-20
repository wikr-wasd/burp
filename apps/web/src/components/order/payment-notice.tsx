import type { PaymentSummary } from "@/lib/payments";

/**
 * Vad kvittot säger om pengarna.
 *
 * Två saker, och de är olika sorters påstående.
 *
 * Det första är betalstatusen: betalt med kort, återbetalt, eller betalning på
 * plats. Den frågan har gästen alltid.
 *
 * Det andra är att det här **inte är ett kvitto**. Kroatien kräver sedan
 * 2026-01-01 att varje kvitto till en konsument rapporteras till
 * skattemyndigheten i realtid och förses med en signatur, oavsett betalsätt;
 * Serbien har motsvarande krav sedan 2022. Burp gör inte det — restaurangen
 * har sin egen fiskalkassa. Ett dokument med ordersumma och momsuppdelning
 * utan signatur kan annars läsas som ett kvitto som borde ha fiskaliserats,
 * och den missuppfattningen kostar restaurangen och inte oss.
 *
 * Landet avgör om raden visas, inte koden (regel 9).
 */
export function PaymentNotice({
  payment,
  fiscalReceiptRequired,
  labels,
}: {
  payment: PaymentSummary | null;
  fiscalReceiptRequired: boolean;
  labels: {
    /** "Betalning sker på plats." eller motsvarande för avhämtning. */
    payInPerson: string;
    paidByCard: string;
    /** Kort i restaurangens egen terminal, registrerat av personalen. */
    paidInTerminal: string;
    refundedNotice: string;
    notFiscalReceipt: string;
  };
}) {
  const isRefunded =
    payment?.status === "REFUNDED" || payment?.status === "PARTIALLY_REFUNDED";

  /*
   * Tre lägen, inte två.
   *
   * Ett kort i restaurangens egen terminal är betalt — men inte genom Burp.
   * Utan den tredje raden hade kvittot antingen sagt "Betalning sker på plats"
   * om något gästen redan betalat, eller "Betald med kort" om en betalning vi
   * inte kan återbetala.
   */
  const message = isRefunded
    ? labels.refundedNotice
    : payment?.status !== "CAPTURED"
      ? labels.payInPerson
      : payment.provider === "TERMINAL"
        ? labels.paidInTerminal
        : payment.paidInApp
          ? labels.paidByCard
          : labels.payInPerson;

  return (
    <>
      <p className="mt-8 border-l-2 border-burp-600 bg-burp-50 px-4 py-3 text-sm dark:bg-burp-900/40">
        {message}
      </p>

      {fiscalReceiptRequired ? (
        <p className="mt-3 text-xs text-[var(--muted)]">{labels.notFiscalReceipt}</p>
      ) : null}
    </>
  );
}
