import "server-only";

import type { CurrencyCode, PaymentProviderId, PaymentStatus } from "@burp/core";
import { publicEnv } from "../env";
import { createAdminClient } from "../supabase/admin";
import {
  PaymentProviderUnavailableError,
  type PaymentAccount,
  type PaymentProvider,
} from "./provider";
import { isStripeConfigured, stripeProvider } from "./stripe";

export * from "./provider";

/**
 * Vilken adapter en leverantör har, och vilken leverantör en restaurang
 * använder.
 *
 * Valet läses ur restaurangens betalkonto och ALDRIG ur landet i en komponent
 * (regel 9). En restaurang i Kroatien kan ha Stripe i dag och Monri i morgon,
 * och gästen ska inte märka bytet.
 */

const ADAPTERS: Partial<Record<PaymentProviderId, PaymentProvider>> = {
  STRIPE: stripeProvider,
  // MONRI läggs till här när avtalet finns. Ingen stubbe under tiden — en
  // adapter som svarar men inte fungerar är sämre än ingen adapter alls.
};

export function paymentProvider(id: PaymentProviderId): PaymentProvider {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new PaymentProviderUnavailableError(id);
  return adapter;
}

/**
 * Leverantörer som går att koppla just nu, i den ordning de bör erbjudas.
 *
 * En leverantör utan nycklar i miljön listas inte. Det är skillnaden mellan en
 * knapp som inte finns och en knapp som kraschar när någon trycker på den.
 */
export function connectableProviders(currency: CurrencyCode): PaymentProviderId[] {
  const available: PaymentProviderId[] = [];
  if (isStripeConfigured() && stripeProvider.currencies.includes(currency)) {
    available.push("STRIPE");
  }
  return available;
}

/**
 * Restaurangens aktiva kortkonto, eller null.
 *
 * Null betyder att QR-kassan bara visar "betala på plats". Det är inte ett
 * felläge — det är läget i Bosnien och Serbien tills ett Monri-avtal finns,
 * och kontantflödet fungerar hela vägen.
 *
 * Läser med service role eftersom anropet sker i QR-flödet, där gästen är
 * anonym och saknar `auth.uid()`. Filtrerar själv på restaurant_id (regel 5).
 */
export async function getCardAccount(restaurantId: string): Promise<PaymentAccount | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("restaurant_payment_accounts")
    .select("provider, external_account_id, currency, status")
    .eq("restaurant_id", restaurantId)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const provider = data.provider as PaymentProviderId;
  // Ett konto för en leverantör vi inte har adapter för ska inte erbjudas
  // gästen. Raden får ligga kvar — den blir användbar samma dag adaptern finns.
  if (!ADAPTERS[provider]) return null;

  return {
    provider,
    externalAccountId: data.external_account_id,
    currency: data.currency as CurrencyCode,
    isActive: true,
  };
}

/**
 * Vad QR-menyn behöver veta för att våga visa kortknappen.
 *
 * Null betyder "visa den inte". Två saker måste stämma: restaurangen har ett
 * aktivt konto, och Burp har nycklarna för att kunna rendera betalrutan. Bara
 * den ena räcker inte, och en knapp som kraschar när någon trycker på den är
 * sämre än ingen knapp.
 */
export async function cardOptionFor(
  restaurantId: string,
): Promise<{ publishableKey: string } | null> {
  const account = await getCardAccount(restaurantId);
  if (!account) return null;

  // Bara Stripe har en publicerbar nyckel i klienten. Monri hämtar sin
  // motsvarighet ur betalningens svar när adaptern finns.
  if (account.provider !== "STRIPE") return null;

  const publishableKey = publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return publishableKey ? { publishableKey } : null;
}

export interface PaymentSummary {
  provider: PaymentProviderId;
  status: PaymentStatus;
  amountOre: number;
  /** Sant när gästen betalade i plattformen och inte i kassan. */
  paidInApp: boolean;
}

/**
 * Vad kvittot ska säga om betalningen.
 *
 * Läser med service role: bordskvittot visas för en anonym gäst som saknar
 * `auth.uid()`, och åtkomsten är redan avgjord av bordssessionen när den här
 * anropas. Filtrerar på ordern (regel 5).
 *
 * Null betyder att ingen betalning registrerats — då gäller "betalning sker på
 * plats", vilket är sant både före kassans kvittens och när restaurangen inte
 * tar kort alls.
 */
export async function paymentSummaryFor(orderId: string): Promise<PaymentSummary | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("payments")
    .select("provider, status, amount_ore")
    .eq("order_id", orderId)
    .neq("status", "FAILED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const provider = data.provider as PaymentProviderId;

  return {
    provider,
    status: data.status as PaymentStatus,
    amountOre: data.amount_ore,
    paidInApp: provider !== "CASH",
  };
}

/** Restaurangens konto oavsett status — för personalytan, som ska se väntande. */
export async function getPaymentAccounts(restaurantId: string) {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("restaurant_payment_accounts")
    .select("id, provider, external_account_id, currency, status, updated_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });

  return data ?? [];
}
