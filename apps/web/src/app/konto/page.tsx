import type { Metadata } from "next";
import Link from "next/link";
import { formatMoney, ORDER_STATUS_LABELS, type OrderStatus } from "@burp/core";
import { GuestHeader } from "@/components/guest/guest-header";
import { ReviewForm } from "@/components/guest/review-form";
import { getGuestOrders, getLoyalty, requireGuest } from "@/lib/guest";

/**
 * Gästens konto — mina beställningar.
 *
 * Startvyn är beställningshistoriken, inte en profilsida. Det är den gästen
 * kommer hit för: se vad som är på väg, hitta ett gammalt kvitto, eller lämna
 * omdöme på gårdagens middag.
 */

export const metadata: Metadata = {
  title: "Mitt konto",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const guest = await requireGuest();

  const [orders, loyalty] = await Promise.all([
    getGuestOrders(guest.userId),
    getLoyalty(guest.userId),
  ]);

  const active = orders.filter(
    (order) => !["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status),
  );
  const past = orders.filter((order) =>
    ["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status),
  );

  return (
    <>
      <GuestHeader guest={guest} current="bestallningar" />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold">Mina beställningar</h1>

        {loyalty && loyalty.balance > 0 ? (
          <div className="mt-4 rounded-xl border border-black/10 p-4 dark:border-white/15">
            <p className="text-sm opacity-60">Poäng</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{loyalty.balance}</p>
            {loyalty.expiringSoon > 0 ? (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                {loyalty.expiringSoon} poäng går ut inom 30 dagar.
              </p>
            ) : null}
          </div>
        ) : null}

        {orders.length === 0 ? (
          <div className="mt-8 rounded-xl border border-black/10 p-6 dark:border-white/15">
            <p className="opacity-70">Du har inte beställt något än.</p>
            <Link
              href="/"
              className="mt-3 inline-block rounded-md bg-burp-600 px-4 py-2.5 font-medium text-white"
            >
              Hitta en restaurang
            </Link>
          </div>
        ) : null}

        {active.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Pågående</h2>
            <ul className="mt-3 space-y-3">
              {active.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </ul>
          </section>
        ) : null}

        {past.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Tidigare</h2>
            <ul className="mt-3 space-y-3">
              {past.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

function OrderCard({ order }: { order: Awaited<ReturnType<typeof getGuestOrders>>[number] }) {
  const date = order.completedAt ?? order.placedAt;

  return (
    <li className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {order.restaurantSlug ? (
          <Link
            href={`/r/${order.citySlug}/${order.restaurantSlug}`}
            className="font-semibold underline-offset-4 hover:underline"
          >
            {order.restaurantName}
          </Link>
        ) : (
          <span className="font-semibold">{order.restaurantName}</span>
        )}
        <span className="tabular-nums">{formatMoney(order.totalOre, order.currency)}</span>
      </div>

      <p className="mt-1 text-sm opacity-60">
        {ORDER_STATUS_LABELS[order.status as OrderStatus]}
        {date ? ` · ${new Date(date).toLocaleDateString("sv-SE")}` : null}
        {order.type === "TABLE" ? " · vid bordet" : order.type === "PICKUP" ? " · avhämtning" : null}
      </p>

      {order.itemNames.length > 0 ? (
        <p className="mt-2 text-sm opacity-70">{order.itemNames.join(", ")}</p>
      ) : null}

      {/* Omdöme går bara att lämna på en genomförd order — samma regel som
          databasen enforcar, speglad här för att inte visa ett formulär som
          servern ändå kommer att avvisa. */}
      {order.status === "COMPLETED" && !order.hasReview ? (
        <ReviewForm orderId={order.id} restaurantName={order.restaurantName} />
      ) : null}

      {order.hasReview ? (
        <p className="mt-3 text-sm opacity-60">Du har lämnat omdöme på den här beställningen.</p>
      ) : null}
    </li>
  );
}
