import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney, type CurrencyCode } from "@burp/core";
import { CancelButton } from "./cancel-button";
import { SiteHeader } from "@/components/site/site-header";
import { dictionary, fill, LOCALE_TAGS, requestLocale } from "@/lib/i18n";
import { reservationByToken } from "@/lib/reservations";

/**
 * Bokningens kvitto.
 *
 * ── Varför nyckeln står i adressen ──────────────────────────────────────────
 *
 * Gästen har inget konto. Nyckeln är det enda som binder bokningen till henne,
 * och utan den skulle sidan visa namn och telefonnummer för vem som helst som
 * gissar ett id. Den ligger därför i länken — som en kvittolänk, och med samma
 * följd: den som har länken har bokningen.
 *
 * ── Varför Accept-Language och inte språk i adressen ────────────────────────
 *
 * Sidan är noindex. Den behöver ingen egen URL per språk, och gästen som just
 * bokat ska mötas på sitt eget språk utan att välja igen — samma regel som
 * kvittona och QR-sidan.
 */

export const metadata: Metadata = {
  title: "Bokning",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nyckel?: string }>;
}

export default async function BookingPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { nyckel } = await searchParams;

  // Utan nyckel finns ingen bokning att visa. 404 och inte 403: att skilja på
  // "fel nyckel" och "finns inte" hade bekräftat att bokningen existerar.
  if (!nyckel) notFound();

  const reservation = await reservationByToken(id, nyckel);
  if (!reservation) notFound();

  const locale = await requestLocale();
  const t = dictionary(locale);
  const tag = LOCALE_TAGS[locale];

  const when = new Intl.DateTimeFormat(tag, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: reservation.timeZone,
  }).format(new Date(reservation.startsAt));

  const cancelled = reservation.status === "CANCELLED";

  return (
    <>
      <SiteHeader locale={locale} />

      <main className="mx-auto w-full max-w-lg px-6 py-16">
        <p className="label-caps">{reservation.restaurantName}</p>
        <h1 className="font-display mt-2 text-4xl">
          {cancelled ? t.booking.cancelled : t.booking.confirmedTitle}
        </h1>

        {!cancelled ? (
          <p className="mt-3 text-[var(--muted)]">{t.booking.confirmedBody}</p>
        ) : null}

        <dl className="mt-8 space-y-3 border-t border-[var(--rule)] pt-6">
          <Row label={t.booking.date} value={when} />
          <Row
            label={t.booking.chooseTable}
            value={
              fill(t.booking.tableLabel, { number: reservation.tableNumber }) +
              (reservation.zone ? ` · ${reservation.zone}` : "")
            }
          />
          <Row
            label={t.booking.partySize}
            value={fill(t.booking.partyLabel, { n: String(reservation.partySize) })}
          />
          <Row label={t.booking.name} value={reservation.guestName} />

          {reservation.note ? <Row label={t.booking.note} value={reservation.note} /> : null}

          {reservation.surchargeOre > 0 ? (
            <Row
              label={t.booking.surchargeHint}
              value={formatMoney(
                reservation.surchargeOre,
                reservation.currency as CurrencyCode,
                tag,
              )}
            />
          ) : null}

          <Row
            label={t.booking.yourBooking}
            value={t.booking.status[reservation.status as keyof typeof t.booking.status] ?? reservation.status}
          />
        </dl>

        {/* Avbokning bara medan bokningen står. Ett bord gästen redan sitter
            vid går inte att avboka, och en avbokad bokning inte heller. */}
        {reservation.status === "BOOKED" ? (
          <CancelButton
            id={reservation.id}
            token={nyckel}
            labels={{
              cancel: t.booking.cancel,
              confirm: t.booking.cancelConfirm,
              done: t.booking.cancelled,
              failed: t.booking.cancelFailed,
            }}
          />
        ) : null}

        <p className="mt-10 text-sm">
          <Link
            href={`/${locale}/r/${reservation.citySlug}/${reservation.restaurantSlug}`}
            className="link"
          >
            {t.booking.backToRestaurant}
          </Link>
        </p>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
      <dt className="label-caps">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
