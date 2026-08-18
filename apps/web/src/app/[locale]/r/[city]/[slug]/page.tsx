import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  availableSlots,
  COUNTRY_INFO,
  parseOpeningHours,
  parseOrderPolicy,
  type CountryCode,
  type CurrencyCode,
} from "@burp/core";
import { FoodImage } from "@/components/media/food-image";
import { MenuOrder } from "@/components/order/menu-order";
import { cardOptionFor } from "@/lib/payments";
import { SiteFooter } from "@/components/site/site-footer";
import { Directions } from "@/components/site/directions";
import { MapEmbed } from "@/components/site/map-embed";
import {
  OpeningHoursWeek,
  toSchemaOpeningHours,
} from "@/components/site/opening-hours-week";
import { SiteHeader } from "@/components/site/site-header";
import { dictionary, isLocale, localePath, type Locale } from "@/lib/i18n";
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
  latitude: number;
  longitude: number;
  phone: string | null;
  price_tier: number | null;
  cuisines: string[] | null;
  hero_image_url: string | null;
  rating_average: number | null;
  rating_count: number;
  opening_hours: OpeningHours | null;
  order_policy: unknown;
  country: CountryCode;
  currency: CurrencyCode;
}

async function getRestaurant(city: string, slug: string): Promise<RestaurantRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("restaurants")
    .select(
      "id, name, slug, description, city, street_address, postal_code, latitude, longitude, phone, price_tier, cuisines, hero_image_url, rating_average, rating_count, opening_hours, order_policy, country, currency",
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
   * Hämttider räknas på servern, inte i klienten. Öppettiderna och
   * tillagningstiden är restaurangens data, och en klient som räknar själv kan
   * erbjuda en tid som servern sedan avvisar — vilket ser ut som en bugg för
   * gästen. Tom lista när förbeställning är avstängd; då visas ingen väljare.
   */
  const reviews = await getPublicReviews(restaurant.id);

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
      <FoodImage
        src={restaurantImage(restaurant.name, restaurant.city, resolveMediaUrl(restaurant.hero_image_url))}
        alt=""
        ratio="aspect-[16/9] sm:aspect-[21/9]"
        className="mt-6 overflow-hidden rounded-xl"
        priority
      />

      <header className="mt-8">
        <p className="label-caps">
          {[restaurant.cuisines?.join(" · "), restaurant.city].filter(Boolean).join(" · ")}
        </p>

        <h1 className="font-display mt-2 text-5xl sm:text-6xl">{restaurant.name}</h1>

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
        <nav aria-label={t.restaurant.onThisPage} className="mt-8 flex flex-wrap gap-2">
          {[
            { href: "#meny", label: t.restaurant.menu },
            { href: "#hitta-hit", label: t.restaurant.findUs },
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

      {menu && menu.categories.length > 0 ? (
        <section id="meny" className="mt-16">
          <p className="label-caps">{t.restaurant.orderForPickup} · {menu.name}</p>
          <div className="mt-6">
            <MenuOrder
              menu={menu}
              restaurantName={restaurant.name}
              labels={t.menu}
              currency={restaurant.currency}
              timeZone={timeZone}
              context={{ kind: "PICKUP" }}
              pickupSlots={pickupSlots}
              showHeading={false}
              card={card}
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

      <section id="hitta-hit" className="mt-16">
        <h2 className="font-display text-3xl">{t.restaurant.findUs}</h2>

        <div className="card mt-6 grid gap-10 p-6 lg:grid-cols-2">
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

      <SiteFooter locale={locale} />
    </>
  );
}
