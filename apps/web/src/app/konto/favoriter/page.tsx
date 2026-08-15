import type { Metadata } from "next";
import Link from "next/link";
import { GuestHeader } from "@/components/guest/guest-header";
import { FavoriteButton } from "@/components/guest/favorite-button";
import { requireGuest } from "@/lib/guest";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Favoriter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const guest = await requireGuest("/konto/favoriter");
  const supabase = await createClient();

  const { data: favorites } = await supabase
    .from("favorites")
    .select("restaurant_id, created_at")
    .eq("user_id", guest.userId)
    .order("created_at", { ascending: false });

  const restaurantIds = (favorites ?? []).map((favorite) => favorite.restaurant_id);

  const { data: restaurants } = restaurantIds.length
    ? await supabase
        .from("restaurants")
        .select("id, name, slug, city, city_slug, cuisines, rating_average, rating_count, status")
        .in("id", restaurantIds)
    : { data: [] };

  // Ordningen kommer från favorites, inte från restaurants — senast sparad först.
  const byId = new Map((restaurants ?? []).map((r) => [r.id, r] as const));
  const ordered = restaurantIds.map((id) => byId.get(id)).filter((r) => r !== undefined);

  return (
    <>
      <GuestHeader guest={guest} current="favoriter" />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="label-caps">Mitt konto</p>
        <h1 className="font-display mt-2 text-4xl">Favoriter</h1>

        {ordered.length === 0 ? (
          <div className="mt-6 border border-[var(--rule)] p-6">
            <p className="opacity-70">
              Inga favoriter än. Spara en restaurang så hittar du tillbaka snabbare.
            </p>
            <Link
              href="/"
              className="mt-3 inline-block bg-burp-600 px-4 py-2.5 font-medium text-white"
            >
              Bläddra bland restauranger
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {ordered.map((restaurant) => (
              <li
                key={restaurant.id}
                className="flex flex-wrap items-start gap-3 border border-[var(--rule)] p-4"
              >
                <div className="mr-auto min-w-0">
                  <Link
                    href={`/r/${restaurant.city_slug}/${restaurant.slug}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {restaurant.name}
                  </Link>
                  <p className="text-sm opacity-60">
                    {restaurant.city}
                    {restaurant.cuisines?.length ? ` · ${restaurant.cuisines.join(", ")}` : ""}
                  </p>
                  {restaurant.rating_count > 0 && restaurant.rating_average !== null ? (
                    <p className="text-sm opacity-60">
                      {restaurant.rating_average.toFixed(1).replace(".", ",")} av 5 ·{" "}
                      {restaurant.rating_count} omdömen
                    </p>
                  ) : null}
                  {/* En favoritmarkerad restaurang kan ha pausat eller stängts av.
                      Att tyst visa den som vanlig vore att skicka gästen till en
                      sida som inte går att beställa från. */}
                  {restaurant.status !== "ACTIVE" ? (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      Tar inte emot beställningar just nu.
                    </p>
                  ) : null}
                </div>

                <FavoriteButton restaurantId={restaurant.id} isFavorite />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
