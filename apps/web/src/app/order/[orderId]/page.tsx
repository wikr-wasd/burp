import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatOre,
  parseOrderPolicy,
  type OrderStatus,
} from "@burp/core";
import { OrderActions } from "@/components/order/order-actions";
import { OrderStatusView } from "@/components/order/order-status";
import { guestOwnsOrder } from "@/lib/guest-orders";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Kvitto och status för en avhämtningsbeställning.
 *
 * Gästen är anonym, precis som vid bordet, men har ingen bordssession att
 * legitimera sig med. I stället avgör cookien från `guest-orders` om den här
 * webbläsaren lade ordern. Utan den kontrollen räcker det att gissa ett
 * order-id för att läsa någon annans beställning.
 *
 * Service role används därför att gästen saknar `auth.uid()` — samma skäl som
 * i bordsflödet. Varje läsning nedan filtrerar själv på order-id (regel 5).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ orderId: string }>;
}

export default async function PickupOrderPage({ params }: PageProps) {
  const { orderId } = await params;

  // Ordern som inte tillhör den här gästen och ordern som inte finns ska ge
  // exakt samma svar. Skulle de skilja sig går sidan att använda för att lista
  // ut vilka order-id som existerar.
  if (!(await guestOwnsOrder(orderId))) notFound();

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, type, status, total_ore, items_gross_ore, tip_ore, placed_at, restaurant_id")
    .eq("id", orderId)
    .maybeSingle();

  // Bordsbeställningar har en egen kvittosida under bordets token, med
  // bordsnumret i sidhuvudet. Hamnar en sådan här är det fel sida.
  if (!order || order.type === "TABLE") notFound();

  const [{ data: items }, { data: restaurant }] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, name_snapshot, quantity, line_gross_ore, note")
      .eq("order_id", order.id),
    supabase
      .from("restaurants")
      .select("name, city, city_slug, slug, street_address, postal_code, phone, order_policy")
      .eq("id", order.restaurant_id)
      .single(),
  ]);

  const { data: options } = await supabase
    .from("order_item_options")
    .select("order_item_id, name_snapshot")
    .in(
      "order_item_id",
      (items ?? []).map((item) => item.id),
    );

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
          Avhämtning · {restaurant?.name}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Din beställning</h1>
      </header>

      <OrderStatusView
        status={order.status as OrderStatus}
        prepTimeMinutes={policy.prepTimeMinutes}
        placedAt={order.placed_at}
      />

      {/* Restaurangens egna regler avgör vad som visas. Är allt avstängt
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

      {restaurant ? (
        <section className="mt-8 rounded-xl border border-black/10 p-4 dark:border-white/15">
          <h2 className="font-semibold">Hämtas hos</h2>
          <p className="mt-1 text-sm opacity-70">
            {restaurant.street_address}, {restaurant.postal_code} {restaurant.city}
          </p>
          {restaurant.phone ? (
            <p className="mt-2 text-sm">
              <a
                href={`tel:${restaurant.phone.replace(/\s/g, "")}`}
                className="underline underline-offset-4"
              >
                {restaurant.phone}
              </a>
            </p>
          ) : null}
        </section>
      ) : null}

      <ul className="mt-8 divide-y divide-black/10 dark:divide-white/10">
        {(items ?? []).map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">
                <span className="tabular-nums opacity-60">{item.quantity}×</span>{" "}
                {item.name_snapshot}
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

      {/* Betalning finns inte än (öppen fråga 5). Tills den gör det betalar
          gästen på plats, och det ska stå rakt ut i stället för att antydas. */}
      <p className="mt-6 rounded-lg bg-burp-50 px-4 py-3 text-sm dark:bg-burp-900/40">
        Betalning sker på plats vid upphämtning.
      </p>

      {restaurant ? (
        <Link
          href={`/r/${restaurant.city_slug}/${restaurant.slug}`}
          className="mt-8 inline-block text-sm underline underline-offset-4 opacity-70 transition-opacity hover:opacity-100"
        >
          Tillbaka till {restaurant.name}
        </Link>
      ) : null}
    </main>
  );
}
