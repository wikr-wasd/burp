import type { Metadata } from "next";
import Link from "next/link";
import { FoodImage } from "@/components/media/food-image";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import {
  listCities,
  listCuisines,
  priceTierLabel,
  searchRestaurants,
  todaysHours,
  type DiscoveryRestaurant,
} from "@/lib/discovery";
import {
  dictionary,
  isLocale,
  localePath,
  type Dictionary,
  type Locale,
} from "@/lib/i18n";
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
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; kok?: string; stad?: string }>;
}

/** Bygger en URL med ett filter satt eller borttaget, och behåller resten. */
function filterHref(
  locale: Locale,
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
  return localePath(locale, queryString ? `/?${queryString}` : "/");
}

export default async function HomePage({ params: routeParams, searchParams }: PageProps) {
  const { locale: raw } = await routeParams;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);

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
    <div className="min-h-screen">
      <SiteHeader locale={locale} path="/" />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Hero
          t={t}
          city={city}
          cuisine={cuisine}
          query={query}
          cityName={activeCity?.name}
        />

        <div className="mt-8 space-y-px">
          <FilterRow label={t.home.city}>
            <Chip href={filterHref(locale, params, { stad: null })} active={!city}>
              {t.home.allCities}
            </Chip>
            {cities.map((entry) => (
              <Chip
                key={entry.slug}
                href={filterHref(locale, params, { stad: entry.slug })}
                active={city === entry.slug}
              >
                {entry.name}
              </Chip>
            ))}
          </FilterRow>

          {cuisines.length > 0 ? (
            <FilterRow label={t.home.cuisine}>
              <Chip href={filterHref(locale, params, { kok: null })} active={!cuisine}>
                {t.home.allCuisines}
              </Chip>
              {cuisines.map((entry) => (
                <Chip
                  key={entry}
                  href={filterHref(locale, params, { kok: entry })}
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
            {activeCity ? t.city.title(activeCity.name) : t.home.allRestaurants}
          </h2>
          <p className="label-caps" aria-live="polite">
            {t.home.hits(restaurants.length)}
          </p>
        </div>

        {query || cuisine ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            {query ? (
              <>
                {t.home.searchedFor}: <span className="text-[var(--foreground)]">{query}</span>
              </>
            ) : null}
            {query && cuisine ? " · " : null}
            {cuisine ? (
              <>
                {t.home.cuisine}: <span className="text-[var(--foreground)]">{cuisine}</span>
              </>
            ) : null}
          </p>
        ) : null}

        {restaurants.length === 0 ? (
          <EmptyState t={t} locale={locale} hasFilter={hasFilter} />
        ) : (
          <>
            {showFeature ? <FeaturedCard t={t} locale={locale} restaurant={featured} /> : null}

            <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {(showFeature ? rest : restaurants).map((restaurant) => (
                <li key={restaurant.id}>
                  <RestaurantCard t={t} locale={locale} restaurant={restaurant} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}

function Hero({
  t,
  city,
  cuisine,
  query,
  cityName,
}: {
  t: Dictionary;
  city?: string;
  cuisine?: string;
  query?: string;
  cityName?: string;
}) {
  return (
    <section className="pt-10 sm:pt-14">
      <p className="label-caps">{t.home.label}</p>

      <h1 className="font-display mt-3 max-w-3xl text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-7xl">
        {cityName ? (
          t.home.headlineCity(cityName)
        ) : (
          <>
            {t.home.headline[0]}{" "}
            <span className="text-burp-600">{t.home.headline[1]}</span>.
          </>
        )}
      </h1>

      <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--muted)] sm:text-lg">
        {t.home.intro}
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
          {t.home.searchLabel}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query ?? ""}
          placeholder={t.home.searchPlaceholder}
          autoComplete="off"
          className="min-h-12 flex-1 bg-transparent text-lg outline-none placeholder:text-[var(--muted)] focus-visible:placeholder:opacity-60"
        />
        <button
          type="submit"
          className="min-h-12 shrink-0 px-2 text-sm font-medium tracking-[var(--tracking-label)] uppercase transition-colors hover:text-burp-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
        >
          {t.home.searchButton}
        </button>
      </form>

      {/* Ligger kvar även när formuläret är tomt — utan den ser fältet ut att
          söka i något odefinierat. */}
      <p className="mt-2 max-w-xl text-xs text-[var(--muted)]">
        {t.home.searchHint}
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

function Rating({ t, restaurant }: { t: Dictionary; restaurant: DiscoveryRestaurant }) {
  if (restaurant.ratingCount === 0 || restaurant.ratingAverage === null) {
    return <span className="text-[var(--muted)]">{t.home.noRatings}</span>;
  }

  return (
    <span>
      <span aria-hidden="true" className="text-burp-600">
        ★
      </span>{" "}
      <span className="tabular-nums">{restaurant.ratingAverage.toFixed(1)}</span>
      <span className="text-[var(--muted)]"> ({restaurant.ratingCount})</span>
      <span className="sr-only">
        {t.home.ratingSummary(restaurant.ratingAverage.toFixed(1), restaurant.ratingCount)}
      </span>
    </span>
  );
}

/** Uppslaget: bild till vänster, text till höger på breda skärmar. */
function FeaturedCard({
  t,
  locale,
  restaurant,
}: {
  t: Dictionary;
  locale: Locale;
  restaurant: DiscoveryRestaurant;
}) {
  const hours = todaysHours(restaurant.openingHours, restaurant.timeZone);

  return (
    <Link
      href={localePath(locale, `/r/${restaurant.citySlug}/${restaurant.slug}`)}
      className="group mt-8 grid gap-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-burp-600 lg:grid-cols-2 lg:items-center lg:gap-10"
    >
      <FoodImage
        src={restaurantImage(restaurant.name, restaurant.city, restaurant.heroImageUrl)}
        alt=""
        ratio="aspect-[3/2]"
        priority
      />

      <div>
        <p className="label-caps text-burp-600">{t.home.featured}</p>

        <h3 className="font-display mt-2 text-4xl sm:text-5xl">{restaurant.name}</h3>

        <p className="mt-3 text-sm text-[var(--muted)]">{meta(restaurant)}</p>

        {restaurant.description ? (
          <p className="mt-4 max-w-prose leading-relaxed text-[var(--muted)]">
            {restaurant.description}
          </p>
        ) : null}

        <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Rating t={t} restaurant={restaurant} />
          <span className="text-[var(--muted)]">
            {hours ? t.home.todayHours(hours) : t.home.closedToday}
          </span>
        </p>

        <span className="mt-6 inline-block border-b-2 border-burp-600 pb-0.5 text-sm font-medium tracking-[var(--tracking-label)] text-burp-600 uppercase">
          {t.home.seeMenu}
        </span>
      </div>
    </Link>
  );
}

function RestaurantCard({
  t,
  locale,
  restaurant,
}: {
  t: Dictionary;
  locale: Locale;
  restaurant: DiscoveryRestaurant;
}) {
  const hours = todaysHours(restaurant.openingHours, restaurant.timeZone);

  return (
    <Link
      href={localePath(locale, `/r/${restaurant.citySlug}/${restaurant.slug}`)}
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
        <Rating t={t} restaurant={restaurant} />
        <span className="text-[var(--muted)]">
          {hours ? t.home.todayHours(hours) : t.home.closedToday}
        </span>
      </p>
    </Link>
  );
}

function EmptyState({
  t,
  locale,
  hasFilter,
}: {
  t: Dictionary;
  locale: Locale;
  hasFilter: boolean;
}) {
  return (
    <div className="mt-10 border-y border-[var(--rule)] py-16 text-center">
      <p className="font-display text-3xl">{t.home.emptyTitle}</p>
      <p className="mx-auto mt-3 max-w-sm text-[var(--muted)]">
        {hasFilter ? t.home.emptyFiltered : t.home.emptyAll}
      </p>
      {hasFilter ? (
        <Link href={localePath(locale, "/")} className="btn btn-primary mt-7">
          {t.home.showAll}
        </Link>
      ) : null}
    </div>
  );
}
