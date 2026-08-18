import "server-only";

import type { CurrencyCode, PaymentProviderId, PaymentStatus } from "@burp/core";

/**
 * Gränssnittet mot en betalleverantör.
 *
 * Burp är en marknadsplats i tre länder med tre olika betallandskap, och ingen
 * leverantör täcker alla. Stripe finns i Kroatien och Sverige men varken i
 * Bosnien eller Serbien; Monri täcker hela regionen. Att bygga mot en av dem
 * direkt hade betytt att den andra kostar en ombyggnad.
 *
 * Därför det här: allt som skiljer leverantörerna åt ligger bakom fyra
 * metoder, och resten av koden vet bara att det finns en betalning.
 *
 * **Pengarna passerar aldrig Burp.** Restaurangen äger sitt eget
 * inlösenavtal — det är beslutet som gör att vi slipper betaltjänsttillstånd i
 * Bosnien och Serbien, som ligger utanför EU/EES. Burps avgift tas antingen som
 * en application fee hos leverantören eller faktureras i efterhand ur `fees`.
 */

export interface PaymentAccount {
  provider: PaymentProviderId;
  /** Leverantörens id för restaurangens konto, t.ex. `acct_…` hos Stripe. */
  externalAccountId: string;
  currency: CurrencyCode;
  /** Sant först när leverantören godkänt kontot och det får ta emot pengar. */
  isActive: boolean;
}

export interface CreateIntentInput {
  orderId: string;
  restaurantId: string;
  /** Det som ska debiteras, i valutans minsta enhet. Alltid > 0. */
  amountOre: number;
  currency: CurrencyCode;
  /** Burps avgift ur `fees`. Noll när leverantören inte kan dela betalningen. */
  applicationFeeOre: number;
  /**
   * Samma nyckel som `payments.idempotency_key`. Skickas vidare till
   * leverantören så att ett dubbeltryck aldrig kan ge två debiteringar.
   */
  idempotencyKey: string;
  account: PaymentAccount;
  /** Vad som står på gästens kontoutdrag och i leverantörens portal. */
  description: string;
}

export interface CreatedIntent {
  /** Leverantörens referens. Lagras i `payments.provider_reference`. */
  reference: string;
  /**
   * Det klienten behöver för att slutföra betalningen. Null för leverantörer
   * som i stället skickar gästen vidare till en egen sida.
   */
  clientSecret: string | null;
  /** Var betalningen står direkt efter att den skapats. */
  status: PaymentStatus;
  /** Ytterligare fält klienten behöver, t.ex. vilket konto den ska betala mot. */
  clientContext: Record<string, string>;
}

/**
 * Vad en webhook betyder, översatt till Burps språk.
 *
 * `IGNORED` är ett fullvärdigt svar och inte ett fel. Leverantörerna skickar
 * långt fler händelsetyper än vi bryr oss om, och en okänd typ ska kvitteras
 * med 200 så att leverantören slutar försöka igen.
 */
export type ProviderEventKind =
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "PAYMENT_CANCELLED"
  | "REFUND_SUCCEEDED"
  | "ACCOUNT_UPDATED"
  | "IGNORED";

export interface ProviderEvent {
  kind: ProviderEventKind;
  /** Leverantörens egen id för händelsen. Används för att avvisa dubbletter. */
  eventId: string;
  /** Referensen till betalningen händelsen gäller. Null för `IGNORED`. */
  reference: string | null;
  /** Beloppet leverantören säger sig ha hanterat. Kontrolleras mot ordern. */
  amountOre: number | null;
  currency: CurrencyCode | null;
  /** Leverantörens konto händelsen gäller, för `ACCOUNT_UPDATED`. */
  externalAccountId: string | null;
  accountIsActive: boolean | null;
  /** Vad gästen ska få veta när det gick fel. */
  failureReason: string | null;
  /** Leverantörens egen avgift, när den är känd. Fyller `fees.provider_fee_ore`. */
  providerFeeOre: number | null;
  /** Betalsättet gästen faktiskt använde: `card`, `apple_pay`, `google_pay`… */
  method: string | null;
  /** Rått svar. Sparas så att en tvist kan redas ut utan leverantörens portal. */
  raw: unknown;
}

export interface RefundInput {
  reference: string;
  amountOre: number;
  idempotencyKey: string;
  account: PaymentAccount;
  reason: string | null;
}

export interface RefundResult {
  reference: string;
  amountOre: number;
  /** Sant när leverantören redan bekräftat. Annars avgör webhooken. */
  isSettled: boolean;
  raw: unknown;
}

export interface OnboardingLink {
  url: string;
  externalAccountId: string;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Valutor leverantören kan ta emot. Tom lista betyder alla. */
  readonly currencies: readonly CurrencyCode[];
  /** Sant när leverantören kan dra Burps avgift ur betalningen automatiskt. */
  readonly supportsApplicationFee: boolean;

  createIntent(input: CreateIntentInput): Promise<CreatedIntent>;
  /**
   * Verifierar signaturen och översätter händelsen. Kastar
   * `WebhookVerificationError` om signaturen inte stämmer — anropande kod ska
   * då svara 400 och inte behandla innehållet.
   */
  parseWebhook(rawBody: string, headers: Headers): Promise<ProviderEvent>;
  refund(input: RefundInput): Promise<RefundResult>;
  /** Startar eller återupptar restaurangens anslutning hos leverantören. */
  createOnboardingLink(input: {
    restaurantId: string;
    country: string;
    currency: CurrencyCode;
    email: string | null;
    existingAccountId: string | null;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<OnboardingLink>;
}

export class WebhookVerificationError extends Error {
  override readonly name = "WebhookVerificationError";
}

export class PaymentProviderError extends Error {
  override readonly name = "PaymentProviderError";
  constructor(
    message: string,
    readonly provider: PaymentProviderId,
  ) {
    super(message);
  }
}

/** Leverantören finns i schemat men har ingen adapter — inget avtal ännu. */
export class PaymentProviderUnavailableError extends Error {
  override readonly name = "PaymentProviderUnavailableError";
  constructor(readonly provider: PaymentProviderId) {
    super(
      `Ingen adapter för ${provider}. Kortbetalning via ${provider} kräver ett påskrivet avtal — se docs/OPEN-QUESTIONS.md fråga 5.`,
    );
  }
}
