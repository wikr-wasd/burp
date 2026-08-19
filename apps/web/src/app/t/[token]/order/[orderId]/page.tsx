import { dictionary, fill, requestLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  COUNTRY_INFO,
  formatMoney,
  parseOrderPolicy,
  type OrderStatus,
} from "@burp/core";
import { OrderActions } from "@/components/order/order-actions";
import { OrderStatusView } from "@/components/order/order-status";
import { PaymentNotice } from "@/components/order/payment-notice";
import { TableReview } from "@/components/order/table-review";
import { paymentSummaryFor } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentTableSessionId, lookupTable } from "@/lib/table-session";

/**
 * Kvitto och status för en bordsbeställning.
 *
 * Gästen är anonym, så åtkomsten kan inte avgöras av `auth.uid()`. I stället
 * krävs att ordern hör till samma bordssession som cookien pekar på. Utan
 * kontrollen skulle vem som helst kunna läsa en annan gästs nota genom att
 * gissa ett order-id.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ token: string; orderId: string }>;
}

export default async function OrderPage({ params }: PageProps) {

  /*
   * Språket kommer från gästens telefon, inte från adressen.
   *
   * Kvittot är noindex och behöver därför ingen egen URL per språk. Samma
   * resonemang som QR-sidan: gästen som just beställt vid ett bord i Sarajevo
   * ska läsa sin nota på sitt eget språk.
   */
  const locale = await requestLocale();
  const t = dictionary(locale);
  const { token, orderId } = await params;

  const lookup = await lookupTable(token);
  if (!lookup.ok) notFound();

  const sessionId = await currentTableSessionId();
  if (!sessionId) notFound();

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, total_ore, currency, items_gross_ore, discount_ore, tip_ore, placed_at, table_session_id, restaurant_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  // Tre kontroller, alla nödvändiga: ordern finns, den hör till det här bordets
  // pågående session, och den tillhör den restaurang tokenet pekar på.
  if (
    !order ||
    order.table_session_id !== sessionId ||
    order.restaurant_id !== lookup.table.restaurantId
  ) {
    notFound();
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("id, name_snapshot, quantity, line_gross_ore, note")
    .eq("order_id", order.id);

  const { data: options } = await supabase
    .from("order_item_options")
    .select("order_item_id, name_snapshot")
    .in("order_item_id", (items ?? []).map((item) => item.id));

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, order_policy")
    .eq("id", order.restaurant_id)
    .single();

  const policy = parseOrderPolicy(restaurant?.order_policy);
  const payment = await paymentSummaryFor(order.id);

  // Har gästen redan svarat ska frågan inte ställas igen. Databasen hindrar
  // dubbletten ändå (`reviews_order_key`), men en knapp som alltid nekar är
  // sämre än ingen knapp.
  const { data: existingReview } = await supabase
    .from("reviews")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();

  const hasReview = existingReview !== null;

  const optionsByItem = new Map<string, string[]>();
  for (const option of options ?? []) {
    const existing = optionsByItem.get(option.order_item_id);
    if (existing) existing.push(option.name_snapshot);
    else optionsByItem.set(option.order_item_id, [option.name_snapshot]);
  }

  return (
    // Kvittot hör till samma stund och samma bord som menyn, och följer därför
    // telefonens mörka läge. Se `.theme-table` i globals.css.
    <div className="theme-table">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <header className="mb-10">
        <p className="label-caps">
          {fill(t.receipt.table, { number: lookup.table.tableNumber })} · {restaurant?.name}
        </p>
        <h1 className="font-display mt-2 text-5xl">{t.receipt.title}</h1>
      </header>

      <OrderStatusView
        labels={t.receipt}
        status={order.status as OrderStatus}
        prepTimeMinutes={policy.prepTimeMinutes}
        placedAt={order.placed_at}
      />

      {/* Restaurangens egna regler avgör vad som visas här. Är allt avstängt
          renderar komponenten ingenting alls. */}
      <OrderActions
        labels={t.receipt}
        orderId={order.id}
        status={order.status as OrderStatus}
        placedAt={order.placed_at}
        policy={policy}
        items={(items ?? []).map((item) => ({
          id: item.id,
          name: item.name_snapshot,
          quantity: item.quantity,
        }))}
      />

      <h2 className="label-caps mt-8">{t.receipt.yourBill}</h2>

      <ul className="mt-3 divide-y divide-[var(--rule)]">
        {(items ?? []).map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">
                <span className="tabular-nums text-[var(--muted)]">{item.quantity}×</span>{" "}
                {item.name_snapshot}
              </p>
              {optionsByItem.get(item.id)?.length ? (
                <p className="text-sm text-[var(--muted)]">{optionsByItem.get(item.id)!.join(", ")}</p>
              ) : null}
              {item.note ? (
                <p className="text-sm text-[var(--muted)] italic">{item.note}</p>
              ) : null}
            </div>
            <span className="shrink-0 tabular-nums">{formatMoney(item.line_gross_ore, order.currency)}</span>
          </li>
        ))}
      </ul>

      {/* Texterna kommer ur ordboken, inte ur koden. Raderna stod tidigare på
          svenska mitt i en sida som väljer språk på Accept-Language — en
          engelsktalande turist fick "Mat och dryck" på sin nota. */}
      <dl className="mt-6 space-y-1 border-t border-[var(--rule)] pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-[var(--muted)]">{t.receipt.foodAndDrink}</dt>
          <dd className="tabular-nums">{formatMoney(order.items_gross_ore, order.currency)}</dd>
        </div>
        {order.discount_ore < 0 ? (
          <div className="flex justify-between text-green-700 dark:text-green-400">
            <dt>{t.receipt.discount}</dt>
            <dd className="tabular-nums">{formatMoney(order.discount_ore, order.currency)}</dd>
          </div>
        ) : null}
        {order.tip_ore > 0 ? (
          <div className="flex justify-between">
            <dt className="text-[var(--muted)]">{t.receipt.tip}</dt>
            <dd className="tabular-nums">{formatMoney(order.tip_ore, order.currency)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between pt-2 text-base font-semibold">
          <dt>{t.receipt.total}</dt>
          <dd className="tabular-nums">{formatMoney(order.total_ore, order.currency)}</dd>
        </div>
      </dl>

      {/*
        Frågan ställs när måltiden är över och inte innan.

        En gäst som fortfarande väntar på maten har ingenting att säga om den,
        och en fråga i fel ögonblick är hur man lär folk att ignorera frågan.
        Har gästen redan svarat visas ingenting alls.
      */}
      {order.status === "COMPLETED" && !hasReview ? (
        <TableReview token={token} orderId={order.id} labels={t.receipt} />
      ) : null}

      {/* Vad som hänt med pengarna, och att det här inte är ett fiskalt
          kvitto. Båda ska stå rakt ut, inte antydas. */}
      <PaymentNotice
        payment={payment}
        fiscalReceiptRequired={COUNTRY_INFO[lookup.table.country].fiscalReceiptRequired}
        labels={{
          payInPerson: t.receipt.payAtTable,
          paidByCard: t.receipt.paidByCard,
          refundedNotice: t.receipt.refundedNotice,
          notFiscalReceipt: t.receipt.notFiscalReceipt,
        }}
      />
      </main>
    </div>
  );
}
