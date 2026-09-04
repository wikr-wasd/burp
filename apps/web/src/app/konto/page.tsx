import type { Metadata } from "next";
import { GuestLanguagePicker } from "@/components/site/guest-language-picker";
import Link from "next/link";
import { formatMoney, type OrderStatus } from "@burp/core";
import { GuestHeader } from "@/components/guest/guest-header";
import { ReviewForm } from "@/components/guest/review-form";
import { getGuestAvatar, getGuestOrders, getLoyalty, requireGuest } from "@/lib/guest";
import { summariseGuest } from "@/lib/guest-summary";
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

  const [orders, loyalty, avatar] = await Promise.all([
    getGuestOrders(guest.userId),
    getLoyalty(guest.userId),
    getGuestAvatar(guest.userId),
  ]);

  const active = orders.filter(
    (order) => !["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status),
  );
  const past = orders.filter((order) =>
    ["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status),
  );

  // Byggt av historiken sidan ändå hämtat. Ingen extra fråga, ingen ny uppgift
  // att be gästen om.
  const summary = summariseGuest(orders);

  const monthYear = (iso: string) =>
    new Date(iso).toLocaleDateString(LOCALE_DATE_TAGS[locale], {
      month: "long",
      year: "numeric",
    });

  return (
    <>
      <GuestHeader
        guest={guest}
        current="bestallningar"
        texts={t.account}
        homeLabel={t.site.home}
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/*
          Hälsningen först, listan sedan.

          Sidan öppnade med "Mina beställningar" och ett saldo i en grå ruta.
          Det är korrekt och kallt. Den som loggar in är en återkommande gäst,
          och det första hon möts av bör säga att vi känner igen henne — inte
          rubricera en tabell.
        */}
        <div className="flex items-center gap-4">
          {/* Bilden visas bara om hon lagt upp en. En tom rund ruta med en
              generisk ikon är inte en personlig detalj, det är en lucka. */}
          {avatar ? (
            <img
              src={avatar.url}
              alt=""
              className="size-14 shrink-0 rounded-full border border-[var(--rule)] object-cover"
            />
          ) : null}

          <div className="min-w-0">
            <p className="label-caps">{t.account.label}</p>
            <h1 className="font-display mt-1 text-4xl">
              {guest.fullName
                ? fill(t.account.greeting, { name: guest.fullName.split(" ")[0] ?? guest.fullName })
                : t.account.greetingNoName}
            </h1>
          </div>

          {/* Språkvalet står hos gästen och inte bara i adressen. Det gäller
              hela plattformen — också QR-sidan vid bordet och kvittot. */}
          <div className="ml-auto shrink-0">
            <GuestLanguagePicker current={locale} label={t.site.language} />
          </div>
        </div>

        {summary.since ? (
          <p className="mt-1 text-[var(--muted)]">
            {summary.visits === 1
              ? t.account.firstVisit
              : fill(t.account.since, { date: monthYear(summary.since) })}
          </p>
        ) : null}

        {loyalty && loyalty.balance > 0 ? (
          /*
            Poängen som något man ser, inte som en rad man läser.

            Accentfärgen är Burps egen och inte restaurangens: det här är
            gästens förhållande till Burp, och det ska se likadant ut oavsett
            var hon senast åt.
          */
          <div className="card mt-6 flex items-center gap-4 p-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-burp-600 text-2xl font-semibold text-white tabular-nums">
              {loyalty.balance}
            </span>
            <span>
              <span className="block font-medium">{t.account.points}</span>
              {loyalty.expiringSoon > 0 ? (
                <span className="mt-0.5 block text-sm text-amber-700 dark:text-amber-400">
                  {fill(t.account.pointsExpiring, { n: loyalty.expiringSoon })}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        {/*
          Dina ställen och det du beställer oftast.

          Visas först när det finns något att visa: två besök säger inget om en
          vana, och "din favoritrestaurang" efter ett enda besök är en gissning
          gästen genomskådar direkt.
        */}
        {summary.visits >= 3 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {summary.places.length > 0 ? (
              <section className="card p-4">
                <h2 className="label-caps">{t.account.yourPlaces}</h2>
                <ul className="mt-3 space-y-2">
                  {summary.places.map((place) => (
                    <li key={place.restaurantId}>
                      <Link
                        href={`/${locale}/r/${place.citySlug}/${place.slug}`}
                        className="flex items-baseline justify-between gap-3 text-sm hover:text-burp-600"
                      >
                        <span className="truncate font-medium">{place.name}</span>
                        <span className="shrink-0 text-[var(--muted)] tabular-nums">
                          {place.visits === 1
                            ? t.account.visitsOne
                            : fill(t.account.visits, { n: place.visits })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {summary.dishes.length > 0 ? (
              <section className="card p-4">
                <h2 className="label-caps">{t.account.yourDishes}</h2>
                <ul className="mt-3 space-y-2">
                  {summary.dishes.map((dish) => (
                    <li
                      key={dish.name}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="truncate">{dish.name}</span>
                      <span className="shrink-0 text-[var(--muted)] tabular-nums">
                        {dish.times === 1
                          ? t.account.timesOne
                          : fill(t.account.times, { n: dish.times })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        <h2 className="font-display mt-10 text-2xl">{t.account.ordersTitle}</h2>

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
