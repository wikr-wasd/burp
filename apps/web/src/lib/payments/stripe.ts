import "server-only";

import Stripe from "stripe";
import { COUNTRY_INFO, fromMinorUnits, toMinorUnits, type CurrencyCode } from "@burp/core";
import { serverEnv } from "../env";
import {
  PaymentProviderError,
  WebhookVerificationError,
  type CreateIntentInput,
  type CreatedIntent,
  type OnboardingLink,
  type PaymentProvider,
  type ProviderEvent,
  type RefundInput,
  type RefundResult,
} from "./provider";

/**
 * Stripe-adaptern.
 *
 * Bygger på **direct charges**: betalningen skapas på restaurangens eget
 * Connect-konto, pengarna landar i restaurangens saldo och Burps avgift förs
 * över som `application_fee_amount`. Gästens pengar passerar aldrig Burp, och
 * det är precis det som gör att vi slipper betaltjänsttillstånd.
 *
 * Stripe finns inte i Bosnien eller Serbien. Adaptern vägrar därför andra
 * valutor än euro och kronor — hellre ett tydligt fel vid anslutningen än en
 * restaurang i Sarajevo som får ett konto den aldrig kan ta emot pengar på.
 */

/** Valutor ett Stripe-konto i våra marknader faktiskt kan avräkna i. */
const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = ["EUR", "SEK"];

let cached: Stripe | null = null;

function client(): Stripe {
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) {
    throw new PaymentProviderError(
      "STRIPE_SECRET_KEY saknas. Kortbetalning via Stripe är inte konfigurerad.",
      "STRIPE",
    );
  }
  // Klienten är tillståndslös och dyr nog att skapa för att inte göras per
  // anrop. API-versionen lämnas åt SDK:n, som fäster sin egen.
  cached ??= new Stripe(key);
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(serverEnv().STRIPE_SECRET_KEY);
}

/**
 * Vad Stripe kallar betalsättet, översatt.
 *
 * Apple Pay och Google Pay är inte egna betalsätt hos Stripe utan kort med en
 * plånbok ovanpå, och det är plånboken gästen känner igen på kvittot.
 */
function methodFrom(intent: Stripe.PaymentIntent): string | null {
  const charge = latestCharge(intent);
  const details = charge?.payment_method_details;
  if (!details) return null;
  if (details.type === "card") {
    return details.card?.wallet?.type ?? "card";
  }
  return details.type;
}

function latestCharge(intent: Stripe.PaymentIntent): Stripe.Charge | null {
  const charge = intent.latest_charge;
  return charge && typeof charge !== "string" ? charge : null;
}

export const stripeProvider: PaymentProvider = {
  id: "STRIPE",
  currencies: SUPPORTED_CURRENCIES,
  supportsApplicationFee: true,

  async createIntent(input: CreateIntentInput): Promise<CreatedIntent> {
    assertCurrency(input.currency);

    const intent = await client().paymentIntents.create(
      {
        amount: toMinorUnits(input.amountOre, input.currency),
        currency: input.currency.toLowerCase(),
        // Alla betalsätt restaurangens konto har aktiverat, inklusive Apple Pay
        // och Google Pay. De dyker upp av sig själva på enheter som stöder dem
        // och kräver ingen egen integration — bara en verifierad domän.
        automatic_payment_methods: { enabled: true },
        application_fee_amount:
          input.applicationFeeOre > 0
            ? toMinorUnits(input.applicationFeeOre, input.currency)
            : undefined,
        description: input.description,
        // Metadata är det enda som binder Stripes värld till vår. Webhooken
        // slår upp betalningen på `provider_reference`, men order_id här gör
        // en tvist läsbar direkt i Stripes portal.
        metadata: {
          burp_order_id: input.orderId,
          burp_restaurant_id: input.restaurantId,
        },
      },
      {
        idempotencyKey: input.idempotencyKey,
        // Direct charge: betalningen skapas PÅ restaurangens konto.
        stripeAccount: input.account.externalAccountId,
      },
    );

    if (!intent.client_secret) {
      throw new PaymentProviderError("Stripe gav ingen client_secret.", "STRIPE");
    }

    return {
      reference: intent.id,
      clientSecret: intent.client_secret,
      status: "PENDING",
      // Klienten måste initiera Stripe.js mot samma konto som betalningen
      // ligger på, annars hittar den inte betalningen.
      clientContext: { stripeAccount: input.account.externalAccountId },
    };
  },

  async parseWebhook(rawBody: string, headers: Headers): Promise<ProviderEvent> {
    const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new PaymentProviderError("STRIPE_WEBHOOK_SECRET saknas.", "STRIPE");
    }

    const signature = headers.get("stripe-signature");
    if (!signature) {
      throw new WebhookVerificationError("Stripe-signaturen saknas i huvudet.");
    }

    let event: Stripe.Event;
    try {
      event = await client().webhooks.constructEventAsync(rawBody, signature, secret);
    } catch (error) {
      throw new WebhookVerificationError(
        `Stripe-signaturen kunde inte verifieras: ${(error as Error).message}`,
      );
    }

    return translate(event);
  },

  async refund(input: RefundInput): Promise<RefundResult> {
    assertCurrency(input.account.currency);

    const refund = await client().refunds.create(
      {
        payment_intent: input.reference,
        amount: toMinorUnits(input.amountOre, input.account.currency),
        // Avgiften följer med tillbaka. Burp ska inte behålla 3,4 % på en
        // måltid restaurangen fått betala tillbaka.
        refund_application_fee: true,
        metadata: input.reason ? { burp_reason: input.reason } : undefined,
      },
      {
        idempotencyKey: input.idempotencyKey,
        stripeAccount: input.account.externalAccountId,
      },
    );

    return {
      reference: refund.id,
      amountOre: fromMinorUnits(refund.amount, input.account.currency),
      isSettled: refund.status === "succeeded",
      raw: refund,
    };
  },

  async createOnboardingLink({
    restaurantId,
    country,
    currency,
    email,
    existingAccountId,
    returnUrl,
    refreshUrl,
  }): Promise<OnboardingLink> {
    assertCurrency(currency);

    if (!(country in COUNTRY_INFO)) {
      throw new PaymentProviderError(`Okänt land: ${country}`, "STRIPE");
    }

    const accountId =
      existingAccountId ??
      (
        await client().accounts.create({
          type: "express",
          country,
          email: email ?? undefined,
          default_currency: currency.toLowerCase(),
          business_type: "company",
          metadata: { burp_restaurant_id: restaurantId },
        })
      ).id;

    const link = await client().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      // Stripe skickar tillbaka gästen hit när formuläret avbryts respektive
      // slutförs. Länken går ut, därför två olika adresser.
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });

    return { url: link.url, externalAccountId: accountId };
  },
};

function assertCurrency(currency: CurrencyCode): void {
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw new PaymentProviderError(
      `Stripe kan inte hantera ${currency}. Bosnien och Serbien kräver en lokal inlösare — se docs/OPEN-QUESTIONS.md fråga 5.`,
      "STRIPE",
    );
  }
}

/**
 * Översätter en Stripe-händelse till Burps språk.
 *
 * Bara fem typer betyder något. Allt annat kvitteras som `IGNORED` med 200 —
 * en okänd händelsetyp är inte ett fel, och svarar vi 400 fortsätter Stripe
 * skicka om den i tre dygn.
 */
function translate(event: Stripe.Event): ProviderEvent {
  const base: Omit<ProviderEvent, "kind"> = {
    eventId: event.id,
    reference: null,
    amountOre: null,
    currency: null,
    externalAccountId: event.account ?? null,
    accountIsActive: null,
    failureReason: null,
    providerFeeOre: null,
    method: null,
    raw: event,
  };

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const currency = currencyOf(intent.currency);
      const charge = latestCharge(intent);
      return {
        ...base,
        kind: "PAYMENT_SUCCEEDED",
        reference: intent.id,
        amountOre: currency ? fromMinorUnits(intent.amount_received, currency) : null,
        currency,
        // Stripes egen avgift är restaurangens kostnad, inte ett avdrag från
        // Burps 3,4 % — öppen fråga 1 är besvarad på den punkten.
        providerFeeOre:
          currency && charge?.application_fee_amount != null
            ? fromMinorUnits(charge.application_fee_amount, currency)
            : null,
        method: methodFrom(intent),
      };
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      return {
        ...base,
        kind: "PAYMENT_FAILED",
        reference: intent.id,
        failureReason: intent.last_payment_error?.message ?? "Betalningen nekades.",
      };
    }

    case "payment_intent.canceled": {
      const intent = event.data.object;
      return { ...base, kind: "PAYMENT_CANCELLED", reference: intent.id };
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const currency = currencyOf(charge.currency);
      return {
        ...base,
        kind: "REFUND_SUCCEEDED",
        reference: typeof charge.payment_intent === "string" ? charge.payment_intent : null,
        amountOre: currency ? fromMinorUnits(charge.amount_refunded, currency) : null,
        currency,
      };
    }

    case "account.updated": {
      const account = event.data.object;
      return {
        ...base,
        kind: "ACCOUNT_UPDATED",
        externalAccountId: account.id,
        // Kontot får ta emot pengar först när Stripe godkänt underlaget. Att
        // gå på `details_submitted` hade räckt för att visa en kortknapp som
        // sedan nekar varje betalning.
        accountIsActive: Boolean(account.charges_enabled),
      };
    }

    default:
      return { ...base, kind: "IGNORED" };
  }
}

function currencyOf(value: string): CurrencyCode | null {
  const upper = value.toUpperCase();
  return SUPPORTED_CURRENCIES.find((currency) => currency === upper) ?? null;
}
