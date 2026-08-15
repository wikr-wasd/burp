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
  params: Promise<{ city: string; slug: string }>;
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
  const { city, slug } = await params;
  const restaurant = await getRestaurant(city, slug);

  if (!restaurant) return { title: "Restaurangen hittades inte" };

  const canonical = `/r/${city}/${slug}`;
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
  const { city, slug } = await params;
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
    openingHours: [], // Fylls från `restaurants.opening_hours` när menyvyn byggs.
    rating:
      restaurant.rating_count > 0 && restaurant.rating_average !== null
        ? { average: restaurant.rating_average, count: restaurant.rating_count }
        : null,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
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
        className="mt-6"
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
              <span aria-hidden="true" className="text-burp-600">
                ★
              </span>{" "}
              <span className="tabular-nums">
                {restaurant.rating_average.toFixed(1).replace(".", ",")}
              </span>
              <span className="text-[var(--muted)]"> ({restaurant.rating_count})</span>
            </span>
          ) : (
            <span className="text-[var(--muted)]">Inga omdömen än</span>
          )}

          <span className="text-[var(--muted)]">{hours ? `Öppet idag ${hours}` : "Stängt idag"}</span>

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
      </header>

      {menu && menu.categories.length > 0 ? (
        <section className="mt-14">
          <hr className="rule" />
          <p className="label-caps mt-6">Beställ för avhämtning · {menu.name}</p>
          <div className="mt-6">
            <MenuOrder
              menu={menu}
              restaurantName={restaurant.name}
              currency={restaurant.currency}
              timeZone={timeZone}
              context={{ kind: "PICKUP" }}
              pickupSlots={pickupSlots}
              showHeading={false}
            />
          </div>
        </section>
      ) : (
        <section className="mt-14 border-y border-[var(--rule)] py-12 text-center">
          <h2 className="font-display text-2xl">Ingen meny just nu</h2>
          <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
            {restaurant.name} har inte publicerat någon meny för den här tiden. Ring gärna dit
            och fråga.
          </p>
        </section>
      )}

      {/* Omdömen sist: gästen ska först kunna beställa, sedan övertygas.
          Betygen är kopplade till genomförda order, vilket är det som gör att
          AggregateRating i markupen ovan får publiceras. */}
      <section className="mt-16">
        <hr className="rule" />
        <h2 className="font-display mt-6 text-3xl">Omdömen</h2>
        {restaurant.rating_count > 0 && restaurant.rating_average !== null ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {restaurant.rating_average.toFixed(1).replace(".", ",")} av 5 baserat på{" "}
            {restaurant.rating_count} {restaurant.rating_count === 1 ? "omdöme" : "omdömen"} från
            genomförda beställningar.
          </p>
        ) : null}
        <ReviewList reviews={reviews} />
      </section>
    </main>
  );
}
