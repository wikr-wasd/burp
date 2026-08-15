import type { Metadata } from "next";
import Link from "next/link";
import { FoodImage } from "@/components/media/food-image";
import {
  listCities,
  listCuisines,
  priceTierLabel,
  searchRestaurants,
  todaysHours,
  type DiscoveryRestaurant,
} from "@/lib/discovery";
import { restaurantImage } from "@/lib/placeholder";

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
 *
 * Tonen är en tryckt matbilaga: papper, antikva i rubrikerna, hårfina linjaler
 * i stället för kort som svävar. Bilden på maten är det som säljer, så den
 * första restaurangen får en hel uppslagsbild och resten ett rutnät.
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

  // Den högst betygsatta restaurangen får uppslaget. Är listan filtrerad ner
  // till en handfull träffar vore det udda att lyfta ut en av dem — då är
  // rutnätet ärligare.
  const [featured, ...rest] = restaurants;
  const showFeature = !hasFilter && restaurants.length >= 3 && featured;

  return (
    <div className="min-h-screen pb-20">
      <Masthead />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Hero
          params={params}
          city={city}
          cuisine={cuisine}
          query={query}
          cityName={activeCity?.name}
        />

        <div className="mt-8 space-y-px">
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
        </div>

        <hr className="rule mt-8" />

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="label-caps">
            {activeCity ? `Restauranger i ${activeCity.name}` : "Alla restauranger"}
          </h2>
          <p className="label-caps" aria-live="polite">
            {restaurants.length === 1 ? "1 träff" : `${restaurants.length} träffar`}
          </p>
        </div>

        {query || cuisine ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            {query ? (
              <>
                Sökning: <span className="text-[var(--foreground)]">{query}</span>
              </>
            ) : null}
            {query && cuisine ? " · " : null}
            {cuisine ? (
              <>
                Kök: <span className="text-[var(--foreground)]">{cuisine}</span>
              </>
            ) : null}
          </p>
        ) : null}

        {restaurants.length === 0 ? (
          <EmptyState hasFilter={hasFilter} />
        ) : (
          <>
            {showFeature ? <FeaturedCard restaurant={featured} /> : null}

            <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {(showFeature ? rest : restaurants).map((restaurant) => (
                <li key={restaurant.id}>
                  <RestaurantCard restaurant={restaurant} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Tidningshuvudet. Namnet i antikva, marknaden som spärrad versaletikett — det
 * som i en tryckt bilaga hade stått "VOL. 1 · NR 3".
 */
function Masthead() {
  return (
    <header className="border-b border-[var(--rule)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="font-display text-3xl text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-burp-600"
        >
          Burp
        </Link>

        <div className="flex items-center gap-5">
          <span className="label-caps hidden sm:inline">
            Bosna · Hrvatska · Srbija
          </span>
          <Link
            href="/logga-in"
            className="min-h-11 content-center text-sm text-[var(--muted)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-burp-600 hover:decoration-burp-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
          >
            För restauranger
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero({
  params,
  city,
  cuisine,
  query,
  cityName,
}: {
  params: { q?: string; kok?: string; stad?: string };
  city?: string;
  cuisine?: string;
  query?: string;
  cityName?: string;
}) {
  return (
    <section className="pt-10 sm:pt-14">
      <p className="label-caps">Matmarknadsplats</p>

      <h1 className="font-display mt-3 max-w-3xl text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-7xl">
        {cityName ? (
          <>
            Ät dig igenom <span className="text-burp-600">{cityName}</span>.
          </>
        ) : (
          <>
            Ćevapi, burek och allt <span className="text-burp-600">däremellan</span>.
          </>
        )}
      </h1>

      <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--muted)] sm:text-lg">
        Hitta restauranger i Sarajevo, Zagreb och Belgrad. Skanna QR-koden vid
        bordet och beställ direkt — ingen app, inget konto.
      </p>

      <form
        action="/"
        method="get"
        role="search"
        className="mt-8 flex max-w-xl gap-0 border-b-2 border-[var(--foreground)] pb-1"
      >
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
          placeholder="Sök restaurang, rätt eller kök"
          autoComplete="off"
          className="min-h-12 flex-1 bg-transparent text-lg outline-none placeholder:text-[var(--muted)] focus-visible:placeholder:opacity-60"
        />
        <button
          type="submit"
          className="min-h-12 shrink-0 px-2 text-sm font-medium tracking-[var(--tracking-label)] uppercase transition-colors hover:text-burp-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
        >
          Sök
        </button>
      </form>

      {/* Ligger kvar även när formuläret är tomt — utan den ser fältet ut att
          söka i något odefinierat. */}
      <p className="mt-2 max-w-xl text-xs text-[var(--muted)]">
        Söker i restaurangnamn och beskrivningar.
      </p>
    </section>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="label-caps hidden w-12 shrink-0 sm:block">{label}</span>
      <div
        className="-mx-4 flex flex-1 gap-1 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Filtret är en understruken etikett, inte en fylld pill.
 *
 * Aktivt filter markeras med rött och en linje under — samma sätt som en
 * tidning markerar den avdelning man läser. Höjden är 44 px även om texten är
 * liten; det är minsta trygga träffyta för en tumme.
 */
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
      className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600 ${
        active
          ? "border-burp-600 font-medium text-burp-600"
          : "border-transparent text-[var(--muted)] hover:border-[var(--rule)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </Link>
  );
}

/** Metadata under namnet: kök, prisklass, stad. Samma rad överallt. */
function meta(restaurant: DiscoveryRestaurant): string {
  return [
    restaurant.cuisines.join(" · "),
    priceTierLabel(restaurant.priceTier, restaurant.currency),
    restaurant.city,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Rating({ restaurant }: { restaurant: DiscoveryRestaurant }) {
  if (restaurant.ratingCount === 0 || restaurant.ratingAverage === null) {
    return <span className="text-[var(--muted)]">Inga omdömen än</span>;
  }

  return (
    <span>
      <span aria-hidden="true" className="text-burp-600">
        ★
      </span>{" "}
      <span className="tabular-nums">{restaurant.ratingAverage.toFixed(1)}</span>
      <span className="text-[var(--muted)]"> ({restaurant.ratingCount})</span>
      <span className="sr-only">
        {restaurant.ratingAverage.toFixed(1)} av 5 i snitt, {restaurant.ratingCount}{" "}
        omdömen
      </span>
    </span>
  );
}

/** Uppslaget: bild till vänster, text till höger på breda skärmar. */
function FeaturedCard({ restaurant }: { restaurant: DiscoveryRestaurant }) {
  const hours = todaysHours(restaurant.openingHours, restaurant.timeZone);

  return (
    <Link
      href={`/r/${restaurant.citySlug}/${restaurant.slug}`}
      className="group mt-8 grid gap-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-burp-600 lg:grid-cols-2 lg:items-center lg:gap-10"
    >
      <FoodImage
        src={restaurantImage(restaurant.name, restaurant.city, restaurant.heroImageUrl)}
        alt=""
        ratio="aspect-[3/2]"
        priority
      />

      <div>
        <p className="label-caps text-burp-600">Utvald just nu</p>

        <h3 className="font-display mt-2 text-4xl sm:text-5xl">{restaurant.name}</h3>

        <p className="mt-3 text-sm text-[var(--muted)]">{meta(restaurant)}</p>

        {restaurant.description ? (
          <p className="mt-4 max-w-prose leading-relaxed text-[var(--muted)]">
            {restaurant.description}
          </p>
        ) : null}

        <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Rating restaurant={restaurant} />
          <span className="text-[var(--muted)]">
            {hours ? `Idag ${hours}` : "Stängt idag"}
          </span>
        </p>

        <span className="mt-6 inline-block border-b-2 border-burp-600 pb-0.5 text-sm font-medium tracking-[var(--tracking-label)] text-burp-600 uppercase">
          Se menyn
        </span>
      </div>
    </Link>
  );
}

function RestaurantCard({ restaurant }: { restaurant: DiscoveryRestaurant }) {
  const hours = todaysHours(restaurant.openingHours, restaurant.timeZone);

  return (
    <Link
      href={`/r/${restaurant.citySlug}/${restaurant.slug}`}
      className="group flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-burp-600"
    >
      <FoodImage
        src={restaurantImage(restaurant.name, restaurant.city, restaurant.heroImageUrl)}
        alt=""
      />

      <h3 className="font-display mt-4 text-2xl group-hover:text-burp-600">
        {restaurant.name}
      </h3>

      <p className="label-caps mt-1.5">{meta(restaurant)}</p>

      {restaurant.description ? (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
          {restaurant.description}
        </p>
      ) : null}

      <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-sm">
        <Rating restaurant={restaurant} />
        <span className="text-[var(--muted)]">
          {hours ? `Idag ${hours}` : "Stängt idag"}
        </span>
      </p>
    </Link>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="mt-10 border-y border-[var(--rule)] py-16 text-center">
      <p className="font-display text-3xl">Inga restauranger matchade.</p>
      <p className="mx-auto mt-3 max-w-sm text-[var(--muted)]">
        {hasFilter
          ? "Pröva en annan sökning, en annan stad eller ta bort filtren."
          : "Det finns inga aktiva restauranger att visa just nu."}
      </p>
      {hasFilter ? (
        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center bg-burp-600 px-6 text-sm font-medium tracking-[var(--tracking-label)] text-white uppercase transition-colors hover:bg-burp-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
        >
          Visa alla restauranger
        </Link>
      ) : null}
    </div>
  );
}
