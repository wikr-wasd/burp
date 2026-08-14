import type { Metadata } from "next";
import Link from "next/link";
import {
  listCities,
  listCuisines,
  priceTierLabel,
  searchRestaurants,
  todaysHours,
  type DiscoveryRestaurant,
} from "@/lib/discovery";

/**
 * Startsidan — marknadsplatsens upptäcktsyta (avsnitt 9).
 *
 * Byggd mobilförst. Gästen står oftast på en gata med telefonen i handen, inte
 * vid ett skrivbord, så layouten börjar i en kolumn och breddas uppåt.
 *
 * Sökning och filter är vanliga länkar och ett GET-formulär, inte klientstate.
 * Det gör att sidan fungerar utan JavaScript, att varje filtrerad vy har en
 * egen delbar URL, och att Google kan indexera den. Ett filter som bara finns
 * i minnet ger ingen av de tre sakerna.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Restauranglistan ändras när någon öppnar, stänger eller byter beskrivning —
// inte per sekund. Sidan renderas dock per request eftersom sökningen ligger i
// query-parametrar.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string; kok?: string; stad?: string }>;
}

/** Bygger en URL med ett filter satt eller borttaget, och behåller resten. */
function filterHref(
  current: { q?: string; kok?: string; stad?: string },
  change: Partial<{ kok: string | null; stad: string | null }>,
): string {
  const params = new URLSearchParams();

  const next = {
    q: current.q,
    kok: "kok" in change ? change.kok ?? undefined : current.kok,
    stad: "stad" in change ? change.stad ?? undefined : current.stad,
  };

  if (next.q) params.set("q", next.q);
  if (next.kok) params.set("kok", next.kok);
  if (next.stad) params.set("stad", next.stad);

  const queryString = params.toString();
  return queryString ? `/?${queryString}` : "/";
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q?.trim() || undefined;
  const cuisine = params.kok?.trim() || undefined;
  const city = params.stad?.trim() || undefined;

  const [restaurants, cuisines, cities] = await Promise.all([
    searchRestaurants({ query, cuisine, city }),
    listCuisines(city),
    listCities(),
  ]);

  const activeCity = cities.find((entry) => entry.slug === city);
  const hasFilter = Boolean(query || cuisine || city);

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-[var(--background)]/95 backdrop-blur dark:border-white/15">
        <div className="mx-auto max-w-4xl px-4 pt-4 pb-3 sm:px-6">
          <div className="flex items-baseline justify-between gap-4">
            <Link href="/" className="text-2xl font-bold tracking-tight">
              Burp
            </Link>
            <Link
              href="/logga-in"
              className="text-sm underline underline-offset-4 opacity-70 transition-opacity hover:opacity-100"
            >
              För restauranger
            </Link>
          </div>

          <form action="/" method="get" role="search" className="mt-3 flex gap-2">
            {/* Sökningen ska inte tappa vald stad eller kökstyp. */}
            {city ? <input type="hidden" name="stad" value={city} /> : null}
            {cuisine ? <input type="hidden" name="kok" value={cuisine} /> : null}

            <label htmlFor="q" className="sr-only">
              Sök efter restaurang eller maträtt
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query ?? ""}
              placeholder="Sök restaurang eller kök"
              autoComplete="off"
              className="min-h-11 flex-1 rounded-lg border border-black/15 bg-transparent px-4 text-base outline-none placeholder:opacity-50 focus-visible:border-burp-600 focus-visible:ring-2 focus-visible:ring-burp-600/40 dark:border-white/20"
            />
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-burp-600 px-5 font-semibold text-white transition-colors hover:bg-burp-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
            >
              Sök
            </button>
          </form>
        </div>

        <FilterRow label="Stad">
          <Chip href={filterHref(params, { stad: null })} active={!city}>
            Alla städer
          </Chip>
          {cities.map((entry) => (
            <Chip
              key={entry.slug}
              href={filterHref(params, { stad: entry.slug })}
              active={city === entry.slug}
            >
              {entry.name}
            </Chip>
          ))}
        </FilterRow>

        {cuisines.length > 0 ? (
          <FilterRow label="Kök">
            <Chip href={filterHref(params, { kok: null })} active={!cuisine}>
              Alla kök
            </Chip>
            {cuisines.map((entry) => (
              <Chip
                key={entry}
                href={filterHref(params, { kok: entry })}
                active={cuisine === entry}
              >
                {entry}
              </Chip>
            ))}
          </FilterRow>
        ) : null}
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-xl font-semibold">
            {activeCity ? `Restauranger i ${activeCity.name}` : "Restauranger"}
          </h1>
          <p className="text-sm opacity-70" aria-live="polite">
            {restaurants.length === 1 ? "1 träff" : `${restaurants.length} träffar`}
          </p>
        </div>

        {query || cuisine ? (
          <p className="mt-1 text-sm opacity-70">
            {query ? <>Sökning: <span className="font-medium">{query}</span></> : null}
            {query && cuisine ? " · " : null}
            {cuisine ? <>Kök: <span className="font-medium">{cuisine}</span></> : null}
          </p>
        ) : null}

        {restaurants.length === 0 ? (
          <EmptyState hasFilter={hasFilter} />
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {restaurants.map((restaurant) => (
              <li key={restaurant.id}>
                <RestaurantCard restaurant={restaurant} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-black/5 dark:border-white/10">
      <div
        className="mx-auto flex max-w-4xl gap-2 overflow-x-auto px-4 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600 ${
        active
          ? "bg-burp-600 font-medium text-white"
          : "border border-black/15 hover:border-black/35 dark:border-white/20 dark:hover:border-white/40"
      }`}
    >
      {children}
    </Link>
  );
}

function RestaurantCard({ restaurant }: { restaurant: DiscoveryRestaurant }) {
  const hours = todaysHours(restaurant.openingHours);
  const price = priceTierLabel(restaurant.priceTier);

  return (
    <Link
      href={`/r/${restaurant.citySlug}/${restaurant.slug}`}
      className="flex h-full gap-4 rounded-xl border border-black/10 p-4 transition-colors hover:border-burp-600/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600 dark:border-white/15"
    >
      {/* Bilder laddas upp i dashboarden först när mediaverktyget byggs
          (avsnitt 8). Tills dess en typografisk platta i stället för en trasig
          bildruta — den syns aldrig som ett fel. */}
      <span
        aria-hidden="true"
        className="grid size-14 shrink-0 place-items-center rounded-lg bg-burp-100 text-xl font-bold text-burp-700 dark:bg-burp-900 dark:text-burp-100"
      >
        {restaurant.name.charAt(0)}
      </span>

      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{restaurant.name}</span>
          {restaurant.ratingCount > 0 && restaurant.ratingAverage !== null ? (
            <span className="text-sm opacity-70">
              {restaurant.ratingAverage.toFixed(1)} ({restaurant.ratingCount})
            </span>
          ) : (
            <span className="text-sm opacity-50">Inga omdömen än</span>
          )}
        </span>

        <span className="text-sm opacity-70">
          {[restaurant.cuisines.join(" · "), price, restaurant.city]
            .filter(Boolean)
            .join(" · ")}
        </span>

        {restaurant.description ? (
          <span className="line-clamp-2 text-sm opacity-60">{restaurant.description}</span>
        ) : null}

        <span className="mt-auto pt-1 text-sm opacity-60">
          {hours ? `Idag ${hours}` : "Stängt idag"}
        </span>
      </span>
    </Link>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="mt-8 rounded-xl border border-dashed border-black/15 p-8 text-center dark:border-white/20">
      <p className="font-medium">Inga restauranger matchade.</p>
      <p className="mx-auto mt-2 max-w-sm text-sm opacity-70">
        {hasFilter
          ? "Pröva en annan sökning, en annan stad eller ta bort filtren."
          : "Det finns inga aktiva restauranger att visa just nu."}
      </p>
      {hasFilter ? (
        <Link
          href="/"
          className="mt-5 inline-block min-h-11 rounded-lg bg-burp-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-burp-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
        >
          Visa alla restauranger
        </Link>
      ) : null}
    </div>
  );
}
