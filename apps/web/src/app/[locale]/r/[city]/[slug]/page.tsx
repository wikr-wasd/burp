import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendingUp } from "lucide-react";
import {
  availableSlots,
  checkAccentColor,
  COUNTRY_INFO,
  imageAdjustStyle,
  parseImageAdjust,
  parseReservationPolicy,
  parseOpeningHours,
  parseOrderPolicy,
  type CountryCode,
  type CurrencyCode,
} from "@burp/core";
import { favouriteDishes } from "@/lib/activity";
import { FoodImage } from "@/components/media/food-image";
import { MenuOrder } from "@/components/order/menu-order";
import { BookingForm } from "@/components/site/booking-form";
import { cardOptionFor } from "@/lib/payments";
import { getPunchCard } from "@/lib/punch-cards";
import { SiteFooter } from "@/components/site/site-footer";
import { Directions } from "@/components/site/directions";
import { MapEmbed } from "@/components/site/map-embed";
import {
  OpeningHoursWeek,
  toSchemaOpeningHours,
} from "@/components/site/opening-hours-week";
import { SiteHeader } from "@/components/site/site-header";
import { ShareButton } from "@/components/site/share-button";
import { dictionary, isLocale, localePath, LOCALE_TAGS, type Locale } from "@/lib/i18n";
import { todaysHours, type OpeningHours } from "@/lib/discovery-format";
import { publicEnv } from "@/lib/env";
import { resolveMediaUrl } from "@/lib/media-url";
import { getActiveMenu } from "@/lib/menu";
import { getPublicReviews } from "@/lib/reviews";
import { ReviewList } from "@/components/reviews/review-list";
import { restaurantJsonLd, serializeJsonLd } from "@/lib/seo/jsonld";
import { restaurantImage } from "@/lib/placeholder";
import { createClient } from "@/lib/supabase/server";

/**
 * Publik restaurangsida — burp.se/r/{stad}/{slug} (avsnitt 9.1).
 *
 * Det här är sidan Google indexerar och som ger Burp organisk trafik. Därför:
 * serverrenderad, riktig text i HTML:en, schema.org-markup, och revalidering i
 * stället för klientrendering.
 *
 * Sidan läser via den vanliga RLS-klienten. Publika restauranger är läsbara för
 * `anon` enligt policy i migration 0009 — ingen service role behövs, och ska
 * inte användas, för data som ändå är offentlig.
 */

// Menyer ändras några gånger om dagen, inte per sekund. En timme håller sidan
// snabb och färsk nog; en menyändring i dashboarden triggar revalidering.
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ locale: string; city: string; slug: string }>;
}

interface RestaurantRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string;
  street_address: string;
  postal_code: string;
  // Nullbara i schemat. Påstods vara `number` här tills Supabase-typerna
  // kopplades in 2026-08-22 — se `Directions`.
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  price_tier: number | null;
  cuisines: string[] | null;
  hero_image_url: string | null;
  hero_adjust: unknown;
  banner_adjust: unknown;
  accent_hex: string | null;
  logo_url: string | null;
  banner_url: string | null;
  reservation_policy: unknown;
  rating_average: number | null;
  rating_count: number;
  opening_hours: OpeningHours | null;
  order_policy: unknown;
  country: CountryCode;
  currency: CurrencyCode;
}

interface DocumentRow {
  id: string;
  title: string;
  storage_path: string;
  size_bytes: number;
}

/**
 * Restaurangens egna dokument (migration 0064).
 *
 * Bara godkända — RLS säger samma sak, men filtret står här också så att
 * frågan går att läsa utan att man slår upp policyn. Menyn är INTE ett
 * dokument: den ligger som data längre ner på sidan och går att beställa ur.
 */
async function getDocuments(restaurantId: string): Promise<DocumentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("restaurant_documents")
    .select("id, title, storage_path, size_bytes")
    .eq("restaurant_id", restaurantId)
    .eq("status", "APPROVED")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return data ?? [];
}

async function getRestaurant(city: string, slug: string): Promise<RestaurantRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("restaurants")
    .select(
      "id, name, slug, description, city, street_address, postal_code, latitude, longitude, phone, price_tier, cuisines, hero_image_url, hero_adjust, accent_hex, logo_url, banner_url, banner_adjust, rating_average, rating_count, opening_hours, order_policy, reservation_policy, country, currency",
    )
    .eq("slug", slug)
    .eq("city_slug", city)
    .eq("status", "ACTIVE")
    .maybeSingle();

  return (data as RestaurantRow | null) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, city, slug } = await params;
  const restaurant = await getRestaurant(city, slug);

  if (!restaurant) return { title: "404" };

  const canonical = localePath(locale as Locale, `/r/${city}/${slug}`);
  const description =
    restaurant.description ??
    `Beställ mat från ${restaurant.name} i ${restaurant.city}. Avhämtning, leverans eller beställning vid bordet.`;

  return {
    title: `${restaurant.name} — ${restaurant.city}`,
    description,
    alternates: { canonical },
    openGraph: {
      title: restaurant.name,
      description,
      url: canonical,
      type: "website",
      ...(resolveMediaUrl(restaurant.hero_image_url)
        ? { images: [resolveMediaUrl(restaurant.hero_image_url)!] }
        : {}),
    },
  };
}

export default async function RestaurantPage({ params }: PageProps) {
  const { locale: raw, city, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);
  const restaurant = await getRestaurant(city, slug);

  if (!restaurant) notFound();

  const timeZone = COUNTRY_INFO[restaurant.country].timeZone;
  const menu = await getActiveMenu(restaurant.id, timeZone);

  // Öppettiderna visas, men om restaurangen tar emot order just nu avgörs inte
  // här. Sidan är cachad en timme för SEO:ns skull, och ett "öppet nu" som är
  // upp till en timme gammalt vore värre än inget. Regeln körs i stället på
  // servern när ordern läggs — `is_restaurant_open()` i POST /api/orders.
  const hours = todaysHours(restaurant.opening_hours, timeZone);

  /*
   * Restaurangens eget märke.
   *
   * Färgen prövas på nytt vid VISNING och inte bara när den sparades. Raden i
   * databasen kan vara äldre än kravet — en färg som gick igenom innan
   * mörkt läge fanns ska inte fortsätta visas oläslig för att den råkade bli
   * sparad en gång. `checkAccentColor()` är samma funktion som redigeraren och
   * serveråtgärden använder; det finns bara en bedömning av vad som duger.
   */
  /*
   * Bokningsreglerna, och dagens datum i RESTAURANGENS tidszon.
   *
   * Datumet räknas här och inte i webbläsaren. En gäst i Stockholm som tittar
   * på en restaurang i Sarajevo ska se restaurangens dag — och en gäst strax
   * efter midnatt någon annanstans ska inte erbjudas gårdagen.
   */
  const reservationPolicy = parseReservationPolicy(restaurant.reservation_policy);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date());

  const documents = await getDocuments(restaurant.id);

  const accent = restaurant.accent_hex ? checkAccentColor(restaurant.accent_hex) : null;
  const logoUrl = resolveMediaUrl(restaurant.logo_url);
  const bannerUrl = resolveMediaUrl(restaurant.banner_url);

  /*
   * Hämttider räknas på servern, inte i klienten. Öppettiderna och
   * tillagningstiden är restaurangens data, och en klient som räknar själv kan
   * erbjuda en tid som servern sedan avvisar — vilket ser ut som en bugg för
   * gästen. Tom lista när förbeställning är avstängd; då visas ingen väljare.
   */
  const reviews = await getPublicReviews(restaurant.id);

  /*
   * Vad gästerna faktiskt beställer här.
   *
   * Menyn säger vad stället erbjuder; det här säger vad folk väljer, vilket är
   * en annan och för en ny gäst mer användbar uppgift. Namn, aldrig antal —
   * hur många order stället har är dess egen affär (migration 0074). Tom
   * lista när underlaget är för tunt, och då ritas avsnittet inte alls.
   */
  const favourites = await favouriteDishes(restaurant.id);

  const policy = parseOrderPolicy(restaurant.order_policy);
  const pickupSlots = policy.allowScheduledOrders
    ? availableSlots({
        openingHours: parseOpeningHours(restaurant.opening_hours),
        prepTimeMinutes: policy.prepTimeMinutes,
        now: new Date(),
      }).map((slot) => slot.toISOString())
    : [];

  // Kortknappen visas bara när restaurangen har ett aktivt betalkonto.
  const card = await cardOptionFor(restaurant.id);

  /*
   * Klippkortet kräver ett konto. En anonym gäst får null, och det är inte en
   * lucka att beklaga: besök går inte att räkna utan konto, och klippkortet
   * ska inte bli ett skäl att spåra den som valt bort ett.
   */
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const punchCard = await getPunchCard(restaurant.id, user?.id ?? null);

  const url = new URL(`/r/${city}/${slug}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString();

  const jsonLd = restaurantJsonLd({
    name: restaurant.name,
    description: restaurant.description,
    url,
    imageUrl: resolveMediaUrl(restaurant.hero_image_url),
    streetAddress: restaurant.street_address,
    postalCode: restaurant.postal_code,
    city: restaurant.city,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    phone: restaurant.phone,
    priceTier: restaurant.price_tier,
    cuisines: restaurant.cuisines ?? [],
    country: restaurant.country,
    currency: restaurant.currency,
    openingHours: toSchemaOpeningHours(restaurant.opening_hours),
    rating:
      restaurant.rating_count > 0 && restaurant.rating_average !== null
        ? { average: restaurant.rating_average, count: restaurant.rating_count }
        : null,
  });

  return (
    <>
      <SiteHeader
        locale={locale}
        path={`/r/${city}/${slug}`}
        breadcrumbs={[
          { label: t.site.allCities, href: localePath(locale, "/") },
          { label: restaurant.city, href: localePath(locale, `/${city}`) },
          { label: restaurant.name },
        ]}
      />

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
      <script
        type="application/ld+json"
        // Innehållet är serialiserat med escapad `<` — se serializeJsonLd.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      {/* Hjältebilden ligger överst och i fullbredd. Det är det första en gäst
          som kommer från en Google-träff ser, och en restaurangsida utan bild
          läser som en katalogpost snarare än ett ställe att äta på. */}
      {/* Bannern ersätter hjältebilden när restaurangen laddat upp en. Två
          breda bilder ovanpå varandra är inte en starkare start — det är en
          sida där man måste rulla förbi två bilder för att nå namnet. */}
      {bannerUrl ? (
        <img
          src={bannerUrl}
          alt=""
          // En banner är 21:9. Utan fokuspunkt beskärs den från mitten, och på
          // en bild av en lokal är det golvet som överlever.
          style={imageAdjustStyle(parseImageAdjust(restaurant.banner_adjust))}
          className="mt-6 aspect-[21/9] w-full overflow-hidden rounded-xl object-cover"
        />
      ) : (
        <FoodImage
          src={restaurantImage(restaurant.name, restaurant.city, resolveMediaUrl(restaurant.hero_image_url))}
          alt=""
          ratio="aspect-[16/9] sm:aspect-[21/9]"
          className="mt-6 overflow-hidden rounded-xl"
          adjust={restaurant.hero_adjust}
          priority
        />
      )}

      <header className="mt-8">
        {/*
          Restaurangens eget märke.

          Logotypen står FÖRE namnet och inte i stället för det: en bild kan
          inte läsas upp, och sidan indexeras på sitt namn. Bandet under
          rubriken är enda stället accentfärgen bär något — knappar, priser och
          betyg följer Burps palett, eftersom ingenting får konkurrera med
          maten (docs/DESIGN.md).
        */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="mb-4 h-16 w-auto max-w-[12rem] object-contain"
          />
        ) : null}

        <p className="label-caps">
          {accent?.ok && (restaurant.cuisines?.length ?? 0) > 0
            ? restaurant.city
            : [restaurant.cuisines?.join(" · "), restaurant.city].filter(Boolean).join(" · ")}
        </p>

        <h1 className="font-display mt-2 text-5xl sm:text-6xl">{restaurant.name}</h1>

        {/*
          Accentfärgen bär restaurangens KÖK, inte dess namn.

          Första utkastet upprepade namnet direkt under rubriken. Det såg ut som
          ett renderingsfel — samma ord två gånger med tre raders mellanrum —
          och bandet sa ingenting som inte redan stod där. Köket och staden är
          det gästen faktiskt läser efter namnet, och färgen ger dem en plats
          att sitta på.
        */}
        {accent?.ok && (restaurant.cuisines?.length ?? 0) > 0 ? (
          <p
            className="label-caps mt-3 inline-block rounded-[var(--radius)] px-3 py-1"
            style={{ backgroundColor: accent.hex!, color: accent.textOn! }}
          >
            {restaurant.cuisines!.join(" · ")}
          </p>
        ) : null}

        <p className="mt-3 text-[var(--muted)]">
          {restaurant.street_address}, {restaurant.postal_code} {restaurant.city}
        </p>

        <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {restaurant.rating_count > 0 && restaurant.rating_average !== null ? (
            <span>
              <span aria-hidden="true" className="text-[var(--star)]">
                ★
              </span>{" "}
              <span className="tabular-nums">
                {restaurant.rating_average.toFixed(1).replace(".", ",")}
              </span>
              <span className="text-[var(--muted)]"> ({restaurant.rating_count})</span>
            </span>
          ) : (
            <span className="text-[var(--muted)]">{t.home.noRatings}</span>
          )}

          <span className="text-[var(--muted)]">{hours ? t.restaurant.openToday(hours) : t.restaurant.closedToday}</span>

          {restaurant.phone ? (
            <a
              href={`tel:${restaurant.phone}`}
              className="underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-burp-600"
            >
              {restaurant.phone}
            </a>
          ) : null}
        </p>

        {restaurant.description ? (
          <p className="mt-6 max-w-prose text-lg leading-relaxed">{restaurant.description}</p>
        ) : null}

        {/*
          Restaurangens egen innehållsförteckning.

          En restaurang som fått en sida hos Burp ska kunna skicka länken till
          den och veta att en gäst hittar menyn, vägen dit och omdömena utan
          att leta. Ankarlänkar i stället för flikar: allt finns i HTML:en,
          Google indexerar hela sidan, och ingenting kräver JavaScript.
        */}
        {/*
          Rutten sparas på kontoytan, inte här.

          Den här sidan är cachad en timme, så vilka rutter EN gäst har går inte
          att rendera på den — den första besökarens rutter hade blivit allas.
          Länken bär restaurangens id och valet görs på en yta som ändå är
          personlig.
        */}
        {/*
          Dela och spara på samma rad: båda svarar på "jag vill komma tillbaka
          hit, eller ta med någon".

          Delningen går genom telefonens egen delningsruta. Vi lägger inga
          plattformsknappar här — ingen sajt kan tagga någons konto åt henne, och
          ett SDK per plattform hade betytt tredjepartsskript på en indexerad
          sida. Se `share-button.tsx`.
        */}
        <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href={`/konto/rutter?lagg=${restaurant.id}`} className="link text-sm">
            {t.routes.saveToRoute}
          </Link>

          <ShareButton
            title={restaurant.name}
            label={t.site.share}
            copiedLabel={t.site.shareCopied}
          />
        </p>

        <nav aria-label={t.restaurant.onThisPage} className="mt-8 flex flex-wrap gap-2">
          {[
            { href: "#meny", label: t.restaurant.menu },
            { href: "#hitta-hit", label: t.restaurant.findUs },
            ...(documents.length > 0
              ? [{ href: "#dokument", label: t.restaurant.documents }]
              : []),
            { href: "#omdomen", label: t.restaurant.reviews },
          ].map((entry) => (
            <a
              key={entry.href}
              href={entry.href}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--rule-control)] bg-[var(--surface)] px-4 text-sm font-medium transition-colors duration-[var(--speed)] hover:border-burp-600 hover:text-burp-600"
            >
              {entry.label}
            </a>
          ))}
        </nav>
      </header>

      {/*
        Bokningen står FÖRE menyn.

        Den som letar efter ett bord på fredag har inte kommit hit för att
        läsa vad ćevapi kostar, och en bokningsruta under trettio rätter är
        en ruta ingen hittar. Avsnittet finns bara när restaurangen slagit på
        bokning — standardläget är av.
      */}
      {reservationPolicy.enabled ? (
        <section id="boka" className="mt-14 scroll-mt-8">
          <h2 className="font-display text-3xl">{t.booking.title}</h2>
          <p className="mt-2 text-[var(--muted)]">{t.booking.intro}</p>

          <BookingForm
            restaurantId={restaurant.id}
            currency={restaurant.currency as CurrencyCode}
            timeZone={timeZone}
            localeTag={LOCALE_TAGS[locale as Locale]}
            initialDate={today}
            maxPartySize={reservationPolicy.maxPartySize}
            horizonDays={reservationPolicy.horizonDays}
            labels={t.booking}
          />
        </section>
      ) : null}

        {favourites.length > 0 ? (
          <section className="mt-14">
            <h2 className="font-display text-2xl">{t.restaurant.guestFavourites}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t.restaurant.guestFavouritesHint}
            </p>

            <ul className="mt-4 flex flex-wrap gap-2">
              {favourites.map((dish) => (
                <li key={dish} className="badge bg-[var(--surface)] text-[var(--foreground)]">
                  <TrendingUp size={12} aria-hidden="true" className="text-burp-600" />
                  {dish}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {menu && menu.categories.length > 0 ? (
        <section id="meny" className="mt-16">
          <p className="label-caps">{t.restaurant.orderForPickup} · {menu.name}</p>
          <div className="mt-6">
            <MenuOrder
              menu={menu}
              restaurantName={restaurant.name}
              labels={t.menu}
          allergenLabels={t.allergen}
              currency={restaurant.currency}
              timeZone={timeZone}
              context={{ kind: "PICKUP" }}
              pickupSlots={pickupSlots}
              showHeading={false}
              card={card}
              punchCard={punchCard}
            />
          </div>
        </section>
      ) : (
        <section id="meny" className="mt-14 border-y border-[var(--rule)] py-12 text-center">
          <h2 className="font-display text-2xl">{t.restaurant.noMenuTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
            {t.restaurant.noMenuBody(restaurant.name)}
          </p>
        </section>
      )}

      {/*
        Dokumenten. Ingen egen sida och ingen inbäddad läsare — en PDF öppnas
        av telefonens egen visare, och en iframe hade bara lagt ett lager
        emellan som inte går att zooma i.
      */}
      {documents.length > 0 ? (
        <section id="dokument" className="mt-16">
          <h2 className="font-display text-3xl">{t.restaurant.documents}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t.restaurant.documentsHint}</p>

          <ul className="mt-4 space-y-2">
            {documents.map((document) => (
              <li key={document.id}>
                <a
                  href={
                    resolveMediaUrl(
                      `/storage/v1/object/public/restaurant-docs/${document.storage_path}`,
                    ) ?? "#"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card flex min-h-11 items-center justify-between gap-3 px-4 py-3 transition-shadow duration-[var(--speed)] hover:shadow-md"
                >
                  <span className="min-w-0 truncate font-medium">{document.title}</span>
                  {/* Storleken står ut för att ingen ska hämta 8 MB på
                      mobildata utan att veta om det. */}
                  <span className="shrink-0 text-sm text-[var(--muted)] tabular-nums">
                    PDF · {Math.max(1, Math.round(document.size_bytes / 1024))} kB
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="hitta-hit" className="mt-16">
        <h2 className="font-display text-3xl">{t.restaurant.findUs}</h2>

        {/*
          Två spalter bara när det finns en karta att lägga i den andra.

          `MapEmbed` renderar ingenting för en restaurang utan koordinater — och
          en ny restaurang har inga förrän ägaren klistrat in en kartlänk. Med
          ett fast tvåspaltsrutnät blev följden en kortbredd där adressen och
          knapparna trängdes i vänstra fyrtiondelen och resten stod tom.
        */}
        <div
          className={`card mt-6 grid gap-10 p-6 ${
            restaurant.latitude !== null && restaurant.longitude !== null
              ? "lg:grid-cols-2"
              : ""
          }`}
        >
          <div>
            <Directions
              locale={locale}
              name={restaurant.name}
              streetAddress={restaurant.street_address}
              postalCode={restaurant.postal_code}
              city={restaurant.city}
              latitude={restaurant.latitude}
              longitude={restaurant.longitude}
            />

            {restaurant.phone ? (
              <p className="mt-6">
                <span className="label-caps block">{t.restaurant.phone}</span>
                <a href={`tel:${restaurant.phone}`} className="link mt-1 inline-block text-lg">
                  {restaurant.phone}
                </a>
              </p>
            ) : null}

            <div className="mt-8">
              <h3 className="label-caps">{t.restaurant.openingHours}</h3>
              <div className="mt-2">
                <OpeningHoursWeek locale={locale} hours={restaurant.opening_hours} />
              </div>
            </div>
          </div>

          {/* `self-start` håller kartan vid sin egen höjd. Utan den sträcker
              rutnätet ramen till kolumnens höjd medan bilden stannar, och
              gästen ser en tom kant under kartan. */}
          <MapEmbed
            locale={locale}
            latitude={restaurant.latitude}
            longitude={restaurant.longitude}
            name={restaurant.name}
            className="self-start"
          />
        </div>
      </section>

      {/* Omdömen sist: gästen ska först kunna beställa, sedan övertygas.
          Betygen är kopplade till genomförda order, vilket är det som gör att
          AggregateRating i markupen ovan får publiceras. */}
      <section id="omdomen" className="mt-16">
        <h2 className="font-display text-3xl">{t.restaurant.reviews}</h2>
        {restaurant.rating_count > 0 && restaurant.rating_average !== null ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.restaurant.reviewSummary(
              restaurant.rating_average.toFixed(1).replace(".", ","),
              restaurant.rating_count,
            )}
          </p>
        ) : null}
        <ReviewList reviews={reviews} labels={t.restaurant} locale={locale} />
      </section>
      </main>

      <SiteFooter locale={locale} path={`/r/${city}/${slug}`} />
    </>
  );
}
