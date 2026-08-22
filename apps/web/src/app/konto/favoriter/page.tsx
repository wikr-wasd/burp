import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { GuestHeader } from "@/components/guest/guest-header";
import { FavoriteButton } from "@/components/guest/favorite-button";
import { requireGuest } from "@/lib/guest";
import { dictionary, requestLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await requestLocale());

  return {
    title: t.account.favorites,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const guest = await requireGuest("/konto/favoriter");
  const t = dictionary(await requestLocale());
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
      <GuestHeader
        guest={guest}
        current="favoriter"
        texts={t.account}
        homeLabel={t.site.home}
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="label-caps">{t.account.label}</p>
        <h1 className="font-display mt-2 text-4xl">{t.account.favorites}</h1>

        {ordered.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={Heart}
              title={t.account.favoritesEmptyTitle}
              body={t.account.favoritesEmptyBody}
              action={
                <Link href="/" className="btn btn-primary">
                  {t.account.browseRestaurants}
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {ordered.map((restaurant) => (
              <li
                key={restaurant.id}
                className="card flex flex-wrap items-start gap-3  p-4"
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
                      {/* Samma formulering som startsidans träfflista. En egen
                          hade betytt två sätt att skriva samma betyg. */}
                      {t.home.ratingSummary(
                        restaurant.rating_average.toFixed(1).replace(".", ","),
                        restaurant.rating_count,
                      )}
                    </p>
                  ) : null}
                  {/* En favoritmarkerad restaurang kan ha pausat eller stängts av.
                      Att tyst visa den som vanlig vore att skicka gästen till en
                      sida som inte går att beställa från. */}
                  {restaurant.status !== "ACTIVE" ? (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      {t.account.notAcceptingOrders}
                    </p>
                  ) : null}
                </div>

                <FavoriteButton
                  restaurantId={restaurant.id}
                  isFavorite
                  saveLabel={t.account.saveFavorite}
                  removeLabel={t.account.removeFavorite}
                  failedLabel={t.account.errors.favoriteFailed}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
