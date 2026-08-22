import type { Metadata } from "next";
import Link from "next/link";
import { formatMoney, type OrderStatus } from "@burp/core";
import { GuestHeader } from "@/components/guest/guest-header";
import { ReviewForm } from "@/components/guest/review-form";
import { getGuestOrders, getLoyalty, requireGuest } from "@/lib/guest";
import {
  dictionary,
  fill,
  requestLocale,
  LOCALE_DATE_TAGS,
  type Dictionary,
  type Locale,
} from "@/lib/i18n";

/**
 * Gästens konto — mina beställningar.
 *
 * Startvyn är beställningshistoriken, inte en profilsida. Det är den gästen
 * kommer hit för: se vad som är på väg, hitta ett gammalt kvitto, eller lämna
 * omdöme på gårdagens middag.
 *
 * Språket läses ur `Accept-Language` och inte ur adressen. `/konto` är noindex
 * och behöver därför ingen egen URL per språk — samma val som QR-sidan och
 * kvittona gör, och av samma skäl: en turist som just beställt på tyska ska
 * hitta sin historik på tyska.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await requestLocale());

  return {
    title: t.account.label,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const guest = await requireGuest();
  const locale = await requestLocale();
  const t = dictionary(locale);

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
      <GuestHeader
        guest={guest}
        current="bestallningar"
        texts={t.account}
        homeLabel={t.site.home}
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="label-caps">{t.account.label}</p>
        <h1 className="font-display mt-2 text-4xl">{t.account.ordersTitle}</h1>

        {loyalty && loyalty.balance > 0 ? (
          <div className="card mt-4 p-4">
            <p className="text-sm opacity-60">{t.account.points}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{loyalty.balance}</p>
            {loyalty.expiringSoon > 0 ? (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                {fill(t.account.pointsExpiring, { n: loyalty.expiringSoon })}
              </p>
            ) : null}
          </div>
        ) : null}

        {orders.length === 0 ? (
          <div className="mt-10 border-y border-[var(--rule)] py-14 text-center">
            <p className="font-display text-3xl">{t.account.ordersEmpty}</p>
            <Link href="/" className="btn btn-primary mt-6">
              {t.account.findRestaurant}
            </Link>
          </div>
        ) : null}

        {active.length > 0 ? (
          <section className="mt-8">
            <h2 className="label-caps mt-5">{t.account.ongoing}</h2>
            <ul className="mt-3 space-y-3">
              {active.map((order) => (
                <OrderCard key={order.id} order={order} t={t} locale={locale} />
              ))}
            </ul>
          </section>
        ) : null}

        {past.length > 0 ? (
          <section className="mt-8">
            <h2 className="label-caps mt-5">{t.account.earlier}</h2>
            <ul className="mt-3 space-y-3">
              {past.map((order) => (
                <OrderCard key={order.id} order={order} t={t} locale={locale} />
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

function OrderCard({
  order,
  t,
  locale,
}: {
  order: Awaited<ReturnType<typeof getGuestOrders>>[number];
  t: Dictionary;
  locale: Locale;
}) {
  const date = order.completedAt ?? order.placedAt;

  return (
    <li className="card p-4">
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
        {/*
          Gästens ord för statusen, inte personalens. `receipt.status` säger
          "Serverad" där `staff.status` säger "Slutförd" — samma tillstånd sett
          från två håll, och gästen sitter vid bordet.
        */}
        {t.receipt.status[order.status as OrderStatus]}
        {/*
          Datumet i läsarens format. `sv-SE` stod hårdkodat här: en tysk gäst
          fick 2026-08-22 i stället för 22.8.2026. `LOCALE_DATE_TAGS` och inte
          `LOCALE_TAGS` — ett omärkt `en` ger amerikanskt format, alltså månad
          före dag, och ett datum som läses baklänges är värre än ett datum på
          fel språk.
        */}
        {date ? ` · ${new Date(date).toLocaleDateString(LOCALE_DATE_TAGS[locale])}` : null}
        {order.type === "TABLE"
          ? ` · ${t.account.atTable}`
          : order.type === "PICKUP"
            ? ` · ${t.account.pickup}`
            : null}
      </p>

      {order.itemNames.length > 0 ? (
        <p className="mt-2 text-sm opacity-70">{order.itemNames.join(", ")}</p>
      ) : null}

      {/* Omdöme går bara att lämna på en genomförd order — samma regel som
          databasen enforcar, speglad här för att inte visa ett formulär som
          servern ändå kommer att avvisa. */}
      {order.status === "COMPLETED" && !order.hasReview ? (
        <ReviewForm
          orderId={order.id}
          restaurantName={order.restaurantName}
          texts={t.account}
          reviewTexts={t.receipt}
        />
      ) : null}

      {order.hasReview ? (
        <p className="mt-3 text-sm opacity-60">{t.account.reviewed}</p>
      ) : null}
    </li>
  );
}
