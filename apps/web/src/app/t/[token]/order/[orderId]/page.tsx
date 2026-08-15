import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  formatOre,
  ORDER_STATUS_LABELS,
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
  const { token, orderId } = await params;

  const lookup = await lookupTable(token);
  if (!lookup.ok) notFound();

  const sessionId = await currentTableSessionId();
  if (!sessionId) notFound();

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, total_ore, items_gross_ore, tip_ore, placed_at, table_session_id, restaurant_id",
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
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide opacity-60">
          Bord {lookup.table.tableNumber} · {restaurant?.name}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Din beställning</h1>
      </header>

      <OrderStatusView
        status={order.status as OrderStatus}
        prepTimeMinutes={policy.prepTimeMinutes}
        placedAt={order.placed_at}
      />

      {/* Restaurangens egna regler avgör vad som visas här. Är allt avstängt
          renderar komponenten ingenting alls. */}
      <OrderActions
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

      <ul className="mt-8 divide-y divide-black/10 dark:divide-white/10">
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
            <span className="shrink-0 tabular-nums">{formatOre(item.line_gross_ore)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-6 space-y-1 border-t border-black/10 pt-4 text-sm dark:border-white/10">
        <div className="flex justify-between">
          <dt className="opacity-60">Mat och dryck</dt>
          <dd className="tabular-nums">{formatOre(order.items_gross_ore)}</dd>
        </div>
        {order.tip_ore > 0 ? (
          <div className="flex justify-between">
            <dt className="opacity-60">Dricks</dt>
            <dd className="tabular-nums">{formatOre(order.tip_ore)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between pt-2 text-base font-semibold">
          <dt>Totalt</dt>
          <dd className="tabular-nums">{formatOre(order.total_ore)}</dd>
        </div>
      </dl>

      <p className="mt-8 text-sm opacity-60">
        Status: {ORDER_STATUS_LABELS[order.status as OrderStatus]}
      </p>
    </main>
  );
}
