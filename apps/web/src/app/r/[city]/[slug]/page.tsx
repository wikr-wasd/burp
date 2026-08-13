import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicEnv } from "@/lib/env";
import { restaurantJsonLd, serializeJsonLd } from "@/lib/seo/jsonld";
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
}

async function getRestaurant(city: string, slug: string): Promise<RestaurantRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("restaurants")
    .select(
      "id, name, slug, description, city, street_address, postal_code, latitude, longitude, phone, price_tier, cuisines, hero_image_url, rating_average, rating_count",
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
      ...(restaurant.hero_image_url ? { images: [restaurant.hero_image_url] } : {}),
    },
  };
}

export default async function RestaurantPage({ params }: PageProps) {
  const { city, slug } = await params;
  const restaurant = await getRestaurant(city, slug);

  if (!restaurant) notFound();

  const url = new URL(`/r/${city}/${slug}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString();

  const jsonLd = restaurantJsonLd({
    name: restaurant.name,
    description: restaurant.description,
    url,
    imageUrl: restaurant.hero_image_url,
    streetAddress: restaurant.street_address,
    postalCode: restaurant.postal_code,
    city: restaurant.city,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    phone: restaurant.phone,
    priceTier: restaurant.price_tier,
    cuisines: restaurant.cuisines ?? [],
    openingHours: [], // Fylls från `restaurants.opening_hours` när menyvyn byggs.
    rating:
      restaurant.rating_count > 0 && restaurant.rating_average !== null
        ? { average: restaurant.rating_average, count: restaurant.rating_count }
        : null,
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        // Innehållet är serialiserat med escapad `<` — se serializeJsonLd.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <h1 className="text-4xl font-bold tracking-tight">{restaurant.name}</h1>
      <p className="mt-2 opacity-70">
        {restaurant.street_address}, {restaurant.postal_code} {restaurant.city}
      </p>

      {restaurant.description ? (
        <p className="mt-6 text-lg leading-relaxed">{restaurant.description}</p>
      ) : null}

      {restaurant.rating_count > 0 && restaurant.rating_average !== null ? (
        <p className="mt-4 text-sm opacity-70">
          {restaurant.rating_average.toFixed(1)} av 5 · {restaurant.rating_count} omdömen
        </p>
      ) : null}

      <section className="mt-10 rounded-xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="font-semibold">Meny</h2>
        <p className="mt-2 text-sm opacity-70">Menyvyn byggs i Fas 1.</p>
      </section>
    </main>
  );
}
