import type { Metadata } from "next";
import Link from "next/link";
import { Directions } from "@/components/site/directions";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { notFound } from "next/navigation";
import {
  formatMoney,
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
    .select("id, type, status, total_ore, currency, items_gross_ore, tip_ore, placed_at, restaurant_id")
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
      .select("name, city, city_slug, slug, street_address, postal_code, latitude, longitude, phone, order_policy")
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
    <>
      <SiteHeader />

      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <header className="mb-10">
        <p className="label-caps">Avhämtning · {restaurant?.name}</p>
        <h1 className="font-display mt-2 text-5xl">Din beställning</h1>
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

      {/*
        Vägbeskrivningen hör hemma här mer än någon annanstans.

        Gästen som just lagt en avhämtningsorder ska strax gå eller köra dit,
        och ska slippa skriva av en adress hen redan har på skärmen. Samma
        knappar som på restaurangsidan — ett mönster, inte två.
      */}
      {restaurant ? (
        <section className="mt-10">
          <hr className="rule" />
          <h2 className="label-caps mt-5">Hämtas hos</h2>

          <div className="mt-3">
            <Directions
              name={restaurant.name}
              streetAddress={restaurant.street_address}
              postalCode={restaurant.postal_code}
              city={restaurant.city}
              latitude={restaurant.latitude}
              longitude={restaurant.longitude}
            />
          </div>

          {restaurant.phone ? (
            <p className="mt-5">
              <a href={`tel:${restaurant.phone.replace(/\s/g, "")}`} className="link">
                {restaurant.phone}
              </a>
            </p>
          ) : null}
        </section>
      ) : null}

      <hr className="rule mt-10" />
      <h2 className="label-caps mt-5">Din nota</h2>

      <ul className="mt-3 divide-y divide-[var(--rule)]">
        {(items ?? []).map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p>
                <span className="tabular-nums text-[var(--muted)]">{item.quantity}×</span>{" "}
                {item.name_snapshot}
              </p>
              {optionsByItem.get(item.id)?.length ? (
                <p className="text-sm text-[var(--muted)]">
                  {optionsByItem.get(item.id)!.join(", ")}
                </p>
              ) : null}
              {item.note ? (
                <p className="text-sm text-[var(--muted)] italic">{item.note}</p>
              ) : null}
            </div>
            <span className="shrink-0 tabular-nums">{formatMoney(item.line_gross_ore, order.currency)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-6 space-y-1.5 border-t border-[var(--foreground)] pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-[var(--muted)]">Mat och dryck</dt>
          <dd className="tabular-nums">{formatMoney(order.items_gross_ore, order.currency)}</dd>
        </div>
        {order.tip_ore > 0 ? (
          <div className="flex justify-between">
            <dt className="text-[var(--muted)]">Dricks</dt>
            <dd className="tabular-nums">{formatMoney(order.tip_ore, order.currency)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between pt-2 text-lg">
          <dt>Totalt</dt>
          <dd className="tabular-nums">{formatMoney(order.total_ore, order.currency)}</dd>
        </div>
      </dl>

      {/* Betalning finns inte än (öppen fråga 5). Tills den gör det betalar
          gästen på plats, och det ska stå rakt ut i stället för att antydas. */}
      <p className="mt-8 border-l-2 border-burp-600 bg-burp-50 px-4 py-3 text-sm dark:bg-burp-900/40">
        Betalning sker på plats vid upphämtning.
      </p>

      {restaurant ? (
        <Link href={`/r/${restaurant.city_slug}/${restaurant.slug}`} className="link mt-10 inline-block text-sm">
          Tillbaka till {restaurant.name}
        </Link>
      ) : null}
      </main>

      <SiteFooter />
    </>
  );
}
