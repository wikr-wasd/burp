import type { Metadata } from "next";
import Link from "next/link";
import { Map as MapIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { GuestHeader } from "@/components/guest/guest-header";
import { RouteCreator } from "@/components/guest/route-creator";
import { AddToRoute } from "@/components/guest/add-to-route";
import { requireGuest } from "@/lib/guest";
import { dictionary, fill, LOCALE_TAGS, requestLocale } from "@/lib/i18n";
import { listRoutes, restaurantForRoute } from "@/lib/routes";

/**
 * Gästens matrundor.
 *
 * ── Varför den här ytan kräver konto när inget annat gör det ────────────────
 *
 * QR-beställning och bordsbokning kräver aldrig ett konto, och det är hela
 * poängen med dem. En SPARAD lista är något annat: den ska finnas kvar till
 * nästa gång, och det finns ingenting att spara den åt utan ett konto.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await requestLocale());

  return {
    title: t.account.routes,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

interface PageProps {
  /** `lagg` bär restaurangen som ska läggas till, från restaurangsidans länk. */
  searchParams: Promise<{ lagg?: string }>;
}

export default async function RoutesPage({ searchParams }: PageProps) {
  const guest = await requireGuest("/konto/rutter");

  const { lagg } = await searchParams;
  const locale = await requestLocale();
  const t = dictionary(locale);
  const routes = await listRoutes();

  /*
   * Restaurangen som ska läggas till, om gästen kom hit från en restaurangsida.
   *
   * Namnet slås upp här och inte i länken: en adress med namnet i sig hade
   * kunnat visa vad som helst för den som skriver om den, och rubriken
   * "Lägg till X i en rutt" ska vara sann.
   */
  const pending = lagg ? await restaurantForRoute(lagg) : null;

  const changed = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium" });

  return (
    <>
      <GuestHeader
        guest={guest}
        current="rutter"
        texts={t.account}
        homeLabel={t.site.home}
      />

      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="font-display text-4xl">{t.account.routes}</h1>
        <p className="mt-3 text-[var(--muted)]">{t.routes.intro}</p>

        {pending ? (
          <AddToRoute
            restaurantId={pending.id}
            restaurantName={pending.name}
            routes={routes.map((route) => ({ id: route.id, name: route.name }))}
            labels={t.routes}
          />
        ) : (
          <RouteCreator labels={t.routes} />
        )}

        {routes.length === 0 ? (
          <div className="mt-10">
            <EmptyState icon={MapIcon} title={t.routes.emptyTitle} body={t.routes.emptyBody} />
          </div>
        ) : (
          <ul className="mt-10 space-y-3">
            {routes.map((route) => (
              <li key={route.id}>
                <Link
                  href={`/konto/rutter/${route.id}`}
                  className="card block p-4 transition-shadow duration-[var(--speed)] hover:shadow-md"
                >
                  <p className="font-display text-xl">{route.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {fill(t.routes.stopCount, { n: String(route.stopCount) })}
                    {route.cities.length > 0 ? ` · ${route.cities.join(" · ")}` : ""}
                  </p>
                  <p className="label-caps mt-2">
                    {fill(t.routes.changed, {
                      date: changed.format(new Date(route.updatedAt)),
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
