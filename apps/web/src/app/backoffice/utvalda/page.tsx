import type { Metadata } from "next";
import { PlatformHeader } from "@/components/platform/platform-header";
import {
  FeaturedEditor,
  type Choice,
  type FeaturedRow,
} from "@/components/platform/featured-editor";
import { requirePlatformAdmin } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import { listCities } from "@/lib/discovery";

/**
 * Burps utvalda restauranger, per stad.
 *
 * ⚠️ Det här är ett REDAKTIONELLT urval och ingen popularitetslista. Gästen ser
 * det under sin egen rubrik — "Utvalda i Sarajevo" — skild från "andra sparade
 * också", som räknas ur riktiga favoriter i `co_favourites()`.
 *
 * Skillnaden är inte kosmetisk. Rubriken om vad andra gäster gillar är ett
 * påstående om verkligheten, och en handplockad lista under den hade varit en
 * annons som utger sig för att vara något annat. Samma tillit som omdömena är
 * byggda för att skydda: betyg får bara komma från genomförda order.
 *
 * Ska en restaurang kunna KÖPA sin plats här är det ett affärsbeslut — se
 * docs/BUSINESS.md — och listan måste då märkas som betald.
 */

export const metadata: Metadata = {
  title: "Utvalda",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ stad?: string }>;
}

export default async function FeaturedPage({ searchParams }: PageProps) {
  const admin = await requirePlatformAdmin();
  const params = await searchParams;

  const cities = await listCities();
  const citySlug = cities.find((city) => city.slug === params.stad)?.slug ?? cities[0]?.slug ?? "";
  const cityName = cities.find((city) => city.slug === citySlug)?.name ?? citySlug;

  const supabase = await createClient();

  const [{ data: featuredRows }, { data: restaurants }] = await Promise.all([
    supabase
      .from("featured_restaurants")
      .select("id, restaurant_id, note, sort_order")
      .eq("city_slug", citySlug)
      .order("sort_order", { ascending: true }),
    supabase
      .from("restaurants")
      .select("id, name, city")
      .eq("status", "ACTIVE")
      .order("name", { ascending: true }),
  ]);

  const byId = new Map((restaurants ?? []).map((row) => [row.id, row]));

  const featured: FeaturedRow[] = (featuredRows ?? [])
    .map((row) => {
      const restaurant = byId.get(row.restaurant_id);
      if (!restaurant) return null;

      return {
        id: row.id,
        restaurantId: row.restaurant_id,
        name: restaurant.name,
        city: restaurant.city,
        note: row.note,
      };
    })
    .filter((row): row is FeaturedRow => row !== null);

  const choices: Choice[] = (restaurants ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
  }));

  return (
    <>
      <PlatformHeader admin={admin} current="utvalda" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-4xl">Utvalda</h1>
        <p className="mt-1 text-sm opacity-70">
          Burps eget urval per stad. Visas för gästen under sin egen rubrik, skild från
          &quot;andra sparade också&quot; — den listan räknas ur riktiga favoriter och får
          inte blandas med ett handplockat urval.
        </p>

        {/*
          Staden i adressen och inte i ett tillstånd: urvalet gäller ett område,
          och en länk till "utvalda i Mostar" ska gå att skicka till någon.
        */}
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Stad">
          {cities.map((city) => (
            <a
              key={city.slug}
              href={`/backoffice/utvalda?stad=${city.slug}`}
              aria-current={city.slug === citySlug ? "page" : undefined}
              className={`chip ${city.slug === citySlug ? "chip-active" : ""}`}
            >
              {city.name}
            </a>
          ))}
        </nav>

        <h2 className="font-display mt-8 text-2xl">{cityName}</h2>

        <FeaturedEditor
          citySlug={citySlug}
          featured={featured}
          choices={choices}
          canWrite={admin.role !== "support"}
        />
      </main>
    </>
  );
}
