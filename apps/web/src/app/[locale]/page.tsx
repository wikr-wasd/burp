import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Search, Star } from "lucide-react";
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
  /*
   * Collaget i hjälten ersätter det tidigare "utvalda" uppslaget.
   *
   * Två stora bildblock före rutnätet blev för mycket — gästen fick scrolla
   * förbi bilder för att komma till listan med bilder. Hjälten gör nu jobbet
   * att locka, och rutnätet jobbet att låta välja.
   *
   * Döljs vid filtrering: har gästen redan sökt är tre godtyckliga bilder i
   * vägen för svaret.
   */
  const showcase = hasFilter ? [] : restaurants.slice(0, 3);

  /*
   * Ogrupperad lista vid sökning, grupperad per stad annars.
   *
   * Alternativet — sektioner som "Högst betyg" och "Nyast" — hade visat samma
   * restauranger flera gånger. Med ett tjugotal ställen gör upprepning en sajt
   * tommare, inte fylligare. Staden är den indelning gästen faktiskt bryr sig
   * om: man äter där man står.
   *
   * Vid aktivt filter grupperas inget. Har gästen redan sökt är en rubrik per
   * stad bara en rad mellan hen och svaret.
   */
  const byCity = hasFilter
    ? []
    : [...new Map(restaurants.map((r) => [r.citySlug, r.city])).entries()]
        .map(([slug, name]) => ({
          slug,
          name,
          restaurants: restaurants.filter((r) => r.citySlug === slug),
        }))
        // Störst utbud först. En stad med ett enda ställe överst får
        // marknadsplatsen att se tunnare ut än den är.
        .sort((a, b) => b.restaurants.length - a.restaurants.length);

  return (
    <div className="min-h-screen">
      <SiteHeader locale={locale} path="/" />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Hero
          t={t}
          locale={locale}
          showcase={showcase}
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

        <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
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
        ) : byCity.length > 0 ? (
          byCity.map((group) => (
            <section key={group.slug} className="mt-12 first:mt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="font-display text-2xl">{group.name}</h3>
                <Link
                  href={localePath(locale, `/${group.slug}`)}
                  className="link text-sm whitespace-nowrap"
                >
                  {t.home.seeAllIn(group.name)}
                </Link>
              </div>

              <ul className="mt-5 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {group.restaurants.map((restaurant) => (
                  <li key={restaurant.id}>
                    <RestaurantCard t={t} locale={locale} restaurant={restaurant} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant) => (
              <li key={restaurant.id}>
                <RestaurantCard t={t} locale={locale} restaurant={restaurant} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}

/**
 * Förstaskärmen.
 *
 * Sidan var textbaserad ända tills gästen scrollade — rubrik, ingress,
 * sökfält. Det är svagast möjliga första intryck för en matmarknadsplats:
 * det som säljer mat är bilder på mat, och de låg alla under vikningen.
 *
 * Nu ligger tre restauranger som ett förskjutet collage bredvid rubriken, och
 * ovanför den på mobilen. Bilderna är riktiga länkar till riktiga
 * restauranger, inte dekor — den som lockas av en bild ska kunna klicka på
 * den. Förskjutningen är avsiktlig: tre lika stora rutor i rad läser som en
 * annons, tre i otakt läser som ett uppslag.
 */
function Hero({
  t,
  locale,
  city,
  cuisine,
  query,
  cityName,
  showcase,
}: {
  t: Dictionary;
  locale: Locale;
  city?: string;
  cuisine?: string;
  query?: string;
  cityName?: string;
  /** Restauranger att visa i collaget. Tom lista döljer det helt. */
  showcase: readonly DiscoveryRestaurant[];
}) {
  return (
    <section className="pt-10 sm:pt-14">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        {/* Bilderna först i DOM:en på mobil, men textkolumnen först på stora
            skärmar. `order` flyttar dem visuellt utan att röra läsordningen
            för skärmläsare mer än nödvändigt. */}
        {showcase.length > 0 ? (
          <div className="order-first grid grid-cols-3 gap-3 lg:order-last lg:gap-4">
            {showcase.map((restaurant, index) => (
              <Link
                key={restaurant.id}
                href={localePath(locale, `/r/${restaurant.citySlug}/${restaurant.slug}`)}
                className={`group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-burp-600 ${
                  // Mittenbilden sjunker ned, de yttre lyfts. Otakten är det
                  // som gör det till ett uppslag i stället för en bannerrad.
                  index === 1 ? "mt-8 lg:mt-12" : ""
                }`}
              >
                <FoodImage
                  src={restaurantImage(
                    restaurant.name,
                    restaurant.city,
                    restaurant.heroImageUrl,
                  )}
                  alt=""
                  ratio="aspect-[3/4]"
                  priority={index === 0}
                />
                <span className="label-caps mt-2 block truncate group-hover:text-burp-600">
                  {restaurant.name}
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        <div>
          <p className="label-caps">{t.home.label}</p>

          <h1 className="font-display mt-3 text-[2.75rem] leading-[1.02] sm:text-6xl">
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

          {/*
            Fältet är byggstenen `.field`, inte en egen linje.

            Hjälten ritade tidigare en understruken rad ur den redaktionella
            formen. Den var vacker och stod ensam om att vara det: varje annat
            fält i produkten — QR-menyns sökruta, inloggningen, menyredigeraren
            — är en rundad ruta. Ett fält som ser unikt ut på startsidan lär
            gästen fel form.
          */}
          <form
            action={localePath(locale, "/")}
            method="get"
            role="search"
            className="mt-8 flex max-w-xl gap-2"
          >
            {/* Sökningen ska inte tappa vald stad eller kökstyp. */}
            {city ? <input type="hidden" name="stad" value={city} /> : null}
            {cuisine ? <input type="hidden" name="kok" value={cuisine} /> : null}

            <label htmlFor="q" className="sr-only">
              {t.home.searchLabel}
            </label>
            <div className="relative flex-1">
              <Search
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]"
              />
              {/* `.field-search` bär indraget för ikonen. En Tailwind-klass för
                  samma sak hade slagits ut tyst — olagrad CSS vinner över
                  lagrad, oavsett ordning. Se kommentaren i globals.css. */}
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query ?? ""}
                placeholder={t.home.searchPlaceholder}
                autoComplete="off"
                className="field field-search"
              />
            </div>
            <button type="submit" className="btn btn-primary shrink-0">
              {t.home.searchButton}
            </button>
          </form>

          {/* Ligger kvar även när formuläret är tomt — utan den ser fältet ut
              att söka i något odefinierat. */}
          <p className="mt-2 max-w-xl text-xs text-[var(--muted)]">{t.home.searchHint}</p>
        </div>
      </div>
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
 * Ett filter. Byggstenen `.chip` i `globals.css`, samma som QR-menyns
 * avdelningar — gästen ska lära sig formen en gång, inte en gång per yta.
 *
 * Filtret var tidigare en understruken etikett ur den redaktionella formen.
 * Den läste som en tidningsavdelning, vilket var meningen då, men gick inte
 * att skilja från en rubrik i den nuvarande formen.
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
      className={`chip ${active ? "chip-active" : ""}`}
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
      <Star size={14} aria-hidden="true" className="inline fill-[var(--star)] text-[var(--star)]" />{" "}
      <span className="tabular-nums">{restaurant.ratingAverage.toFixed(1)}</span>
      <span className="text-[var(--muted)]"> ({restaurant.ratingCount})</span>
      <span className="sr-only">
        {t.home.ratingSummary(restaurant.ratingAverage.toFixed(1), restaurant.ratingCount)}
      </span>
    </span>
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
  const open = Boolean(hours);

  return (
    <Link
      href={localePath(locale, `/r/${restaurant.citySlug}/${restaurant.slug}`)}
      className="card group flex h-full flex-col overflow-hidden transition-shadow duration-[var(--speed)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
    >
      {/* Bilden går kant i kant med kortet — `overflow-hidden` på kortet
          klipper hörnen åt den, i stället för att bilden bär sin egen radie
          och de två råkar skilja sig med en pixel. */}
      <div className="relative">
        <FoodImage
          src={restaurantImage(restaurant.name, restaurant.city, restaurant.heroImageUrl)}
          alt=""
        />

        {/* Öppetmärket ligger på bilden, där ögat redan är. Grönt för öppet,
            neutralt för stängt — stängt är ingen varning, bara en upplysning. */}
        <span
          className={`badge absolute top-3 left-3 backdrop-blur ${
            open
              ? "bg-green-600/90 text-white"
              : "bg-[var(--surface)]/90 text-[var(--muted)]"
          }`}
        >
          <Clock size={12} aria-hidden="true" />
          {open ? t.home.todayHours(hours!) : t.home.closedToday}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg group-hover:text-burp-600">
            {restaurant.name}
          </h3>
          <span className="shrink-0 text-sm">
            <Rating t={t} restaurant={restaurant} />
          </span>
        </div>

        <p className="label-caps mt-1">{meta(restaurant)}</p>

        {restaurant.description ? (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
            {restaurant.description}
          </p>
        ) : null}
      </div>
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
