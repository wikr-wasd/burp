import { dictionary, fill, requestLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  formatMoney,
  parseOrderPolicy,
  type OrderStatus,
} from "@burp/core";
import { OrderActions } from "@/components/order/order-actions";
import { OrderStatusView } from "@/components/order/order-status";
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
      "id, status, total_ore, currency, items_gross_ore, tip_ore, placed_at, table_session_id, restaurant_id",
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

  const optionsByItem = new Map<string, string[]>();
  for (const option of options ?? []) {
    const existing = optionsByItem.get(option.order_item_id);
    if (existing) existing.push(option.name_snapshot);
    else optionsByItem.set(option.order_item_id, [option.name_snapshot]);
  }

  return (
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

      <ul className="mt-8 divide-y divide-[var(--rule)]">
        {(items ?? []).map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">
                <span className="tabular-nums opacity-60">{item.quantity}×</span> {item.name_snapshot}
              </p>
              {optionsByItem.get(item.id)?.length ? (
                <p className="text-sm opacity-60">{optionsByItem.get(item.id)!.join(", ")}</p>
              ) : null}
              {item.note ? <p className="text-sm italic opacity-60">{item.note}</p> : null}
            </div>
            <span className="shrink-0 tabular-nums">{formatMoney(item.line_gross_ore, order.currency)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-6 space-y-1 border-t border-[var(--rule)] pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="opacity-60">Mat och dryck</dt>
          <dd className="tabular-nums">{formatMoney(order.items_gross_ore, order.currency)}</dd>
        </div>
        {order.tip_ore > 0 ? (
          <div className="flex justify-between">
            <dt className="opacity-60">Dricks</dt>
            <dd className="tabular-nums">{formatMoney(order.tip_ore, order.currency)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between pt-2 text-base font-semibold">
          <dt>{t.receipt.total}</dt>
          <dd className="tabular-nums">{formatMoney(order.total_ore, order.currency)}</dd>
        </div>
      </dl>

      {/* Betalningen sker på plats tills en betalleverantör är vald
          (öppen fråga 5). Det ska stå rakt ut, inte antydas. */}
      <p className="mt-8 border-l-2 border-burp-600 bg-burp-50 px-4 py-3 text-sm dark:bg-burp-900/40">
        {t.receipt.payAtTable}
      </p>
    </main>
  );
}
