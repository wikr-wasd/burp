import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, ReceiptText } from "lucide-react";
import { nextOpening, zonedNow } from "@burp/core";
import { getActiveMenu } from "@/lib/menu";
import { cardOptionFor } from "@/lib/payments";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  lookupTable,
  ongoingTableOrderId,
  type ClosedRestaurantContext,
} from "@/lib/table-session";
import { MenuOrder } from "@/components/order/menu-order";
import { GuestLanguagePicker } from "@/components/site/guest-language-picker";
import { favouriteDishes } from "@/lib/activity";
import { translateMenu } from "@/lib/translate-menu";
import { dictionary, fill, requestLocale, type Dictionary } from "@/lib/i18n";

/**
 * QR-landningssidan — burp.se/t/R7K2M9X4TB (avsnitt 4.2).
 *
 * Det här är Burps viktigaste sida. Gästen har precis skannat en dekal, sitter
 * vid ett bord och har ingen app, inget konto och inget tålamod. Sidan är
 * serverrenderad utan klientJS för första vyn av just den anledningen.
 *
 * Flödet:
 *   1. Rate limit på IP  — påhittade koder ska inte vara gratis att prova
 *   2. Verifiera HMAC    — utan databasslagning
 *   3. Slå upp bordet    — restaurang, öppettider, låsning
 *   4. Sätt session      — cookie mot `table_sessions`
 *   5. Visa menyn
 */

export const dynamic = "force-dynamic";

// Sidan får aldrig indexeras. Den är knuten till ett fysiskt bord och skulle i
// en sökträff ge en främling en giltig bordssession.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function TablePage({ params }: PageProps) {
  const { token } = await params;

  /*
   * Språket kommer från gästens telefon, inte från adressen.
   *
   * Sidan är noindex och ska aldrig hamna i en sökträff, så den behöver ingen
   * egen URL per språk. Och QR-beställning används av turister — en
   * engelsktalande gäst i Sarajevo ska inte mötas av svenska för att
   * produkten råkar vara byggd i Sverige.
   */
  const locale = await requestLocale();
  const t = dictionary(locale);

  const requestHeaders = await headers();
  const limit = await rateLimit(`qr:${clientIp(requestHeaders)}`, RATE_LIMITS.qrLookup);
  if (!limit.success) {
    return <TableMessage title={t.table.tooManyTitle} body={t.table.tooManyBody} />;
  }

  const lookup = await lookupTable(token);

  if (!lookup.ok) {
    /*
     * Villkoret står i positiv form med flit.
     *
     * De två avslag som bär en restaurang plockas ut först, och allt annat
     * 404:ar på sista raden. Ogiltig signatur och okänt bord ger avsiktligt
     * samma svar — skulle de skilja sig kunde sidan användas som orakel för att
     * kartlägga vilka koder som existerar.
     */
    if (lookup.reason !== "TABLE_LOCKED" && lookup.reason !== "CLOSED") {
      notFound();
    }

    const { restaurant } = lookup;
    const ongoing = await ongoingBanner(restaurant.id, token, t);
    const restaurantHref = `/r/${restaurant.citySlug}/${restaurant.slug}`;

    /*
     * Ett låst bord är inte en stängd restaurang.
     *
     * Bordet låses av personalen — notan hålls på att göras upp, eller så är
     * bordet ur bruk. Köket kan mycket väl vara i full gång, så ett klockslag
     * vore fel svar. Vägen till den egna notan och till restaurangsidan gäller
     * däremot lika mycket här.
     */
    if (lookup.reason === "TABLE_LOCKED") {
      return (
        <TableMessage
          title={t.table.lockedTitle}
          body={t.table.lockedBody}
          restaurantHref={restaurantHref}
          restaurantLabel={t.table.seeRestaurant}
          ongoing={ongoing}
        />
      );
    }

    return (
      <TableMessage
        title={t.table.closedTitle}
        body={t.table.closedBody}
        detail={opensLine(restaurant, t.table, t.weekday)}
        restaurantHref={restaurantHref}
        restaurantLabel={t.table.seeRestaurant}
        ongoing={ongoing}
      />
    );
  }

  const { table } = lookup;

  // Ingen bordssession skapas här. Den kräver en cookie-skrivning, och det får
  // bara ske i en route handler — POST /api/orders gör det när gästen faktiskt
  // beställer.
  const menu = await getActiveMenu(table.restaurantId, table.timeZone);

  // Kortknappen visas bara när restaurangen faktiskt kan ta emot ett kort.
  // Null är inte ett felläge — det är läget i Bosnien och Serbien tills ett
  // lokalt avtal finns, och kontantflödet fungerar hela vägen.
  const card = await cardOptionFor(table.restaurantId);

  if (!menu || menu.categories.length === 0) {
    // Öppet men utan meny. Inget klockslag att ge — menyn saknas nu, inte till
    // ett bestämt klockslag — men notan och restaurangsidan finns.
    return (
      <TableMessage
        title={t.table.noMenuTitle}
        body={t.table.noMenuBody}
        restaurantHref={`/r/${table.citySlug}/${table.restaurantSlug}`}
        restaurantLabel={t.table.seeRestaurant}
        ongoing={await ongoingBanner(table.restaurantId, token, t)}
      />
    );
  }

  /*
   * Andra halvan av rundturen.
   *
   * Kvittot leder numera tillbaka hit, men vägen tillbaka DIT saknades: en
   * gäst som skannat om dekalen, bytt flik eller tappat sidan hade ingen väg
   * till sin egen nota. Bordssessionen vet vilka order som är i gång, så
   * frågan behöver varken cookie-lista eller inloggning.
   *
   * Bara order som ännu inte är slutförda räknas. En färdigserverad order är
   * historik, och en banner om den hade legat kvar hela kvällen.
   *
   * Är flera i gång pekar länken på den senaste. Notan är gemensam och
   * kvittosidan visar hela ordern man kom till — den som vill se en tidigare
   * hittar den därifrån.
   */
  const ongoingOrderId = await ongoingTableOrderId(table.restaurantId);

  /*
   * Vad gästerna beställer oftast här.
   *
   * Ytan har högst kvalitetskrav i produkten, och den fråga en gäst vid
   * bordet faktiskt ställer är "vad ska jag ta?". Menyn svarar på vad som
   * finns; det här svarar på vad folk väljer. Tom lista när underlaget är för
   * tunt — då märks ingen rätt alls.
   */
  const favourites = await favouriteDishes(table.restaurantId);

  /*
   * Menyn på gästens språk.
   *
   * Beskrivningarna, inte rättnamnen: "Ćevapi" är vad rätten HETER, och en
   * gäst som läst ett översatt namn skulle peka på något som varken köket
   * eller notan känner igen. Beskrivningen är motsatsen — den finns just för
   * att förklara vad rätten är. Se `lib/translate-menu.ts`.
   */
  const { menu: readableMenu, translated: menuTranslated } = await translateMenu(menu, locale);

  return (
    /*
     * `.theme-table` — den enda ytan som följer telefonens mörka läge.
     *
     * Gästen sitter vid ett bord på kvällen, ofta i en mörk lokal. En vit
     * skärm i ansiktet där är inte en detalj utan hela upplevelsen. Resten av
     * produkten är alltid papper; se globals.css och öppen fråga 9.
     */
    <div className="theme-table">
      <main className="mx-auto max-w-2xl px-6 py-10">
        {/*
          Språkväljaren först på sidan, före allt annat.

          Gästen som inte förstår språket kan inte läsa sig fram till en
          väljare längre ned — det är precis den situationen hon försöker ta
          sig ur. Valet skrivs i kakan och gäller sedan hela plattformen:
          menyn, notan, kvittot och kontot.
        */}
        <div className="mb-6 flex justify-end">
          <GuestLanguagePicker current={locale} label={t.site.language} />
        </div>

        {/* Över menyn och inte i den. Gästen som redan beställt ska se det
            innan hon börjar bläddra — inte upptäcka det längst ned. */}
        {ongoingOrderId ? (
          <Link
            href={`/t/${token}/order/${ongoingOrderId}`}
            className="card mb-6 flex items-center gap-3 px-4 py-3 no-underline"
          >
            <ReceiptText size={20} aria-hidden="true" className="shrink-0 text-burp-600" />
            <span className="min-w-0">
              <span className="block font-medium">{t.menu.ongoingOrder}</span>
              <span className="block text-sm text-[var(--muted)]">
                {t.menu.ongoingOrderLink}
              </span>
            </span>
            <ChevronRight
              size={18}
              aria-hidden="true"
              className="ml-auto shrink-0 text-[var(--muted)]"
            />
          </Link>
        ) : null}

        <MenuOrder
          menu={readableMenu}
          restaurantName={table.restaurantName}
          labels={t.menu}
          popularDishes={favourites}
          autoTranslated={menuTranslated}
          allergenLabels={t.allergen}
          currency={table.currency}
          timeZone={table.timeZone}
          card={card}
          context={{
            kind: "TABLE",
            tableToken: token.toUpperCase(),
            tableNumber: table.zone
              ? `${table.tableNumber} · ${table.zone}`
              : table.tableNumber,
          }}
        />
      </main>
    </div>
  );
}

/**
 * Sidans fyra utgångar.
 *
 * Alla fyra var fram till 2026-08-22 en rubrik och en mening, ingenting annat.
 * Det räcker för att stänga dörren men inte för att svara på gästens fråga —
 * hon står vid bordet och undrar om hon ska vänta eller gå.
 *
 * Allt utom rubriken och brödtexten är därför valfritt: rate limit-fallet vet
 * ingenting om vilken restaurang det gäller, och ska inte låtsas att det gör
 * det. De andra tre vet, och säger det.
 */
function TableMessage({
  title,
  body,
  detail,
  restaurantHref,
  restaurantLabel,
  ongoing,
}: {
  title: string;
  body: string;
  /** "Öppnar 08:00." — bara den stängda dörren har ett klockslag att ge. */
  detail?: string | null;
  restaurantHref?: string;
  restaurantLabel?: string;
  /** Gästens egen pågående nota, om hon har en. */
  ongoing?: { href: string; title: string; body: string } | null;
}) {
  return (
    <div className="theme-table">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="text-[var(--muted)]">{body}</p>
        {detail ? <p className="text-[var(--muted)]">{detail}</p> : null}

        {/*
          Notan först, restaurangen sedan.

          En gäst som sitter kvar efter stängning med en obetald nota har ett
          ärende som väger tyngre än att läsa om stället. Fram till nu låg
          bannern innanför den öppna grenen, så just hon hittade ingenting.
        */}
        {ongoing ? (
          <Link
            href={ongoing.href}
            className="card mt-4 flex items-center gap-3 px-4 py-3 text-left no-underline"
          >
            <ReceiptText size={20} aria-hidden="true" className="shrink-0 text-burp-600" />
            <span className="min-w-0">
              <span className="block font-medium">{ongoing.title}</span>
              <span className="block text-sm text-[var(--muted)]">{ongoing.body}</span>
            </span>
            <ChevronRight
              size={18}
              aria-hidden="true"
              className="ml-auto shrink-0 text-[var(--muted)]"
            />
          </Link>
        ) : null}

        {restaurantHref && restaurantLabel ? (
          <p className="mt-2">
            <Link href={restaurantHref} className="link">
              {restaurantLabel}
            </Link>
          </p>
        ) : null}
      </main>
    </div>
  );
}

/**
 * Gästens egen pågående nota vid bordet, om hon har en.
 *
 * Låg tidigare bara inne i den öppna grenen, och det var precis fel gäst att
 * missa: den som sitter kvar efter stängning med en obetald nota är den som
 * mest behöver hitta tillbaka till den.
 */
async function ongoingBanner(
  restaurantId: string,
  token: string,
  t: Dictionary,
): Promise<{ href: string; title: string; body: string } | null> {
  const orderId = await ongoingTableOrderId(restaurantId);
  if (!orderId) return null;

  return {
    href: `/t/${token}/order/${orderId}`,
    title: t.menu.ongoingOrder,
    body: t.menu.ongoingOrderLink,
  };
}

/**
 * "Öppnar 08:00." eller "Öppnar lördag 09:00."
 *
 * Dagen skrivs ut bara när den inte är i dag — "Öppnar i dag 17:00" är brus
 * för någon som står där nu, och "Öppnar 17:00" om tre dagar är en lögn.
 *
 * `null` när det inte finns något klockslag att lova: en restaurang som väntar
 * på godkännande, en avstängd, och en som har stängt varje dag i veckan. Då
 * står `noHours` där i stället och pekar vidare till restaurangsidan.
 */
function opensLine(
  restaurant: ClosedRestaurantContext,
  texts: Dictionary["table"],
  weekday: Dictionary["weekday"],
): string {
  if (!restaurant.isActive) return texts.noHours;

  const { dayIndex, minutes } = zonedNow(new Date(), restaurant.timeZone);
  const next = nextOpening(restaurant.openingHours, dayIndex, minutes);

  if (!next) return texts.noHours;

  // Veckodagen kommer ur ordboken med stor bokstav. Den behålls som den är:
  // tyskan skriver veckodagar med versal och en gemenisering här hade gjort
  // "samstag" av "Samstag". En versal mitt i en svensk mening är den mindre
  // skadan av de två.
  return next.daysAhead === 0
    ? fill(texts.opensAt, { time: next.opens })
    : fill(texts.opensOn, { day: weekday[next.day], time: next.opens });
}
