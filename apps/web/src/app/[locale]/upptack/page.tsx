import type { Metadata } from "next";
import Link from "next/link";
import { MapPinned, Star } from "lucide-react";
import { FoodImage } from "@/components/media/food-image";
import { RestaurantMap, type MapPin } from "@/components/discovery/restaurant-map";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listCities,
  listCuisines,
  openRestaurantIds,
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
 * Kartsidan — burp.se/sv/upptack.
 *
 * Startsidan svarar på "vad finns det?". Den här svarar på "var ligger de?",
 * vilket är den fråga en gäst som står på en gata faktiskt har. Karta och
 * lista sida vid sida, som i mockupen.
 *
 * Listan renderas på servern och är indexerbar. Kartan är det enda som kräver
 * en webbläsare — Leaflet läser `window` när modulen laddas — och laddas
 * därför först i klienten. Sidan fungerar utan den: filtren är länkar och
 * listan står där oavsett.
 *
 * Filtren ligger i URL:en och inte i klientstate, av samma tre skäl som på
 * startsidan: sidan fungerar utan JavaScript, varje filtrerad vy har en egen
 * delbar adress, och Google kan indexera den.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/upptack" },
};

// Öppettider ändras med klockan. Sidan kan inte cachas statiskt när "Öppet nu"
// är ett filter.
export const dynamic = "force-dynamic";

type SortOrder = "betyg" | "namn";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kok?: string; stad?: string; oppet?: string; sortera?: string }>;
}

interface Filters {
  kok?: string;
  stad?: string;
  oppet?: string;
  sortera?: string;
}

/**
 * Bygger sidans URL med ett filter ändrat och resten kvar.
 *
 * `null` i `change` betyder "ta bort filtret" — utelämnad nyckel betyder
 * "lämna som den är". Utan den skillnaden går det inte att skilja "visa alla
 * städer" från "rör inte staden".
 */
function filterHref(
  locale: Locale,
  current: Filters,
  change: Partial<Record<keyof Filters, string | null>>,
): string {
  const params = new URLSearchParams();

  for (const key of ["kok", "stad", "oppet", "sortera"] as const) {
    const value = key in change ? change[key] : current[key];
    if (value) params.set(key, value);
  }

  const query = params.toString();
  return localePath(locale, query ? `/upptack?${query}` : "/upptack");
}

export default async function DiscoverPage({ params: routeParams, searchParams }: PageProps) {
  const { locale: raw } = await routeParams;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);

  const params = await searchParams;
  const cuisine = params.kok?.trim() || undefined;
  const city = params.stad?.trim() || undefined;
  const onlyOpen = params.oppet === "1";
  const sort: SortOrder = params.sortera === "namn" ? "namn" : "betyg";

  const [all, cuisines, cities, openIds] = await Promise.all([
    searchRestaurants({ cuisine, city }),
    listCuisines(city),
    listCities(),
    openRestaurantIds(),
  ]);

  const matched = onlyOpen ? all.filter((entry) => openIds.has(entry.id)) : all;

  // Uppslaget sorterar redan på betyg. Bara namnordningen behöver göras här,
  // och den görs med restaurangens språk — inte med serverns.
  const restaurants =
    sort === "namn"
      ? [...matched].sort((a, b) => a.name.localeCompare(b.name, locale))
      : matched;

  /*
   * Bara restauranger med koordinater får en nål.
   *
   * En restaurang utan punkt hamnar i listan men inte på kartan. Alternativet
   * — att sätta nålen i stadens mittpunkt — hade sett rätt ut och skickat
   * gästen fel, vilket är värre än att inte visa något.
   */
  const pins: MapPin[] = restaurants
    .filter(
      (entry): entry is DiscoveryRestaurant & { latitude: number; longitude: number } =>
        entry.latitude !== null && entry.longitude !== null,
    )
    .map((entry) => {
      const hours = todaysHours(entry.openingHours, entry.timeZone);
      const isOpen = openIds.has(entry.id);

      return {
        id: entry.id,
        name: entry.name,
        latitude: entry.latitude,
        longitude: entry.longitude,
        meta: [entry.cuisines.join(" · "), entry.city].filter(Boolean).join(" · "),
        status: isOpen && hours ? t.home.todayHours(hours) : t.home.closedToday,
        isOpen,
        href: localePath(locale, `/r/${entry.citySlug}/${entry.slug}`),
      };
    });

  return (
    <div className="min-h-screen">
      <SiteHeader
        locale={locale}
        path="/upptack"
        breadcrumbs={[
          { label: t.site.discover, href: localePath(locale, "/") },
          { label: t.site.map },
        ]}
      />

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-4xl sm:text-5xl">{t.discover.title}</h1>
        <p className="mt-3 max-w-xl text-[var(--muted)]">{t.discover.intro}</p>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {/*
            "Öppet nu" är ett av/på, inte ett av flera val, och ska därför inte
            se ut som en chip bland chippar. Ett GET-formulär med en knapp och
            inte en länk: `aria-pressed` hör till en knapp, och en länk som
            påstår sig vara nedtryckt läser fel för den som lyssnar på sidan.

            Fungerar utan JavaScript — knappen skickar formuläret, som bär
            resten av filtret i dolda fält.
          */}
          <form method="get" action={localePath(locale, "/upptack")} className="contents">
            {cuisine ? <input type="hidden" name="kok" value={cuisine} /> : null}
            {city ? <input type="hidden" name="stad" value={city} /> : null}
            {params.sortera ? (
              <input type="hidden" name="sortera" value={params.sortera} />
            ) : null}
            {onlyOpen ? null : <input type="hidden" name="oppet" value="1" />}

            <button type="submit" aria-pressed={onlyOpen} className="switch mr-2">
              {t.discover.openNow}
            </button>
          </form>

          <Link
            href={filterHref(locale, params, { stad: null })}
            className={`chip ${!city ? "chip-active" : ""}`}
          >
            {t.home.allCities}
          </Link>
          {cities.map((entry) => (
            <Link
              key={entry.slug}
              href={filterHref(locale, params, { stad: entry.slug })}
              className={`chip ${city === entry.slug ? "chip-active" : ""}`}
            >
              {entry.name}
            </Link>
          ))}
        </div>

        {cuisines.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={filterHref(locale, params, { kok: null })}
              className={`chip ${!cuisine ? "chip-active" : ""}`}
            >
              {t.home.allCuisines}
            </Link>
            {cuisines.map((entry) => (
              <Link
                key={entry}
                href={filterHref(locale, params, { kok: entry })}
                className={`chip ${cuisine === entry ? "chip-active" : ""}`}
              >
                {entry}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="label-caps" aria-live="polite">
            {t.home.hits(restaurants.length)}
          </p>

          {/* Sorteringen är två länkar, inte en select. En select kräver
              JavaScript för att göra något, och sidan ska fungera utan. */}
          <p className="flex items-center gap-3 text-sm">
            <span className="label-caps">{t.discover.sort}</span>
            <Link
              href={filterHref(locale, params, { sortera: null })}
              aria-current={sort === "betyg" ? "true" : undefined}
              className={sort === "betyg" ? "font-medium text-burp-600" : "link"}
            >
              {t.discover.sortRating}
            </Link>
            <Link
              href={filterHref(locale, params, { sortera: "namn" })}
              aria-current={sort === "namn" ? "true" : undefined}
              className={sort === "namn" ? "font-medium text-burp-600" : "link"}
            >
              {t.discover.sortName}
            </Link>
          </p>
        </div>

        {restaurants.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon={MapPinned} title={t.discover.empty} body={t.discover.emptyHint} />
          </div>
        ) : (
          /*
            Listan först i DOM:en, kartan efter.

            På en telefon ligger kartan överst visuellt men läses sist av en
            skärmläsare — en karta är det minst användbara en gäst kan mötas av
            om hen inte kan se den. `order` flyttar den utan att röra
            läsordningen.
          */
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
            <ul className="space-y-3">
              {restaurants.map((restaurant) => (
                <li key={restaurant.id}>
                  <ListCard
                    t={t}
                    locale={locale}
                    restaurant={restaurant}
                    isOpen={openIds.has(restaurant.id)}
                  />
                </li>
              ))}
            </ul>

            <div className="order-first h-[22rem] lg:order-last lg:sticky lg:top-6 lg:h-[calc(100vh-6rem)]">
              <RestaurantMap
                pins={pins}
                label={t.discover.mapLabel}
                emptyLabel={t.discover.mapEmpty}
                failedLabel={t.discover.mapFailed}
              />
            </div>
          </div>
        )}
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}

/**
 * Listans kort — liggande, med liten bild.
 *
 * Skiljer sig från startsidans kort med flit. Där är bilden säljaren och
 * kortet står i ett rutnät; här står listan bredvid en karta och gästen
 * jämför rader. En hel bildyta per rad hade gjort listan tre skärmar lång.
 */
function ListCard({
  t,
  locale,
  restaurant,
  isOpen,
}: {
  t: Dictionary;
  locale: Locale;
  restaurant: DiscoveryRestaurant;
  isOpen: boolean;
}) {
  const hours = todaysHours(restaurant.openingHours, restaurant.timeZone);

  const meta = [
    restaurant.cuisines.join(" · "),
    priceTierLabel(restaurant.priceTier, restaurant.currency),
    restaurant.city,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={localePath(locale, `/r/${restaurant.citySlug}/${restaurant.slug}`)}
      className="card group flex gap-3 p-3 transition-shadow duration-[var(--speed)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
    >
      <div className="w-20 shrink-0 overflow-hidden rounded-[0.5rem]">
        <FoodImage
          src={restaurantImage(restaurant.name, restaurant.city, restaurant.heroImageUrl)}
          alt=""
          ratio="aspect-square"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="truncate font-medium group-hover:text-burp-600">{restaurant.name}</h2>

          {restaurant.ratingCount > 0 && restaurant.ratingAverage !== null ? (
            <span className="flex shrink-0 items-center gap-1 text-sm">
              <Star
                size={13}
                aria-hidden="true"
                className="fill-[var(--star)] text-[var(--star)]"
              />
              <span className="tabular-nums">{restaurant.ratingAverage.toFixed(1)}</span>
              <span className="sr-only">
                {t.home.ratingSummary(
                  restaurant.ratingAverage.toFixed(1),
                  restaurant.ratingCount,
                )}
              </span>
            </span>
          ) : null}
        </div>

        <p className="label-caps mt-0.5 truncate">{meta}</p>

        <p
          className={`mt-1 text-xs font-medium ${
            isOpen ? "text-green-600" : "text-[var(--muted)]"
          }`}
        >
          {isOpen && hours ? t.home.todayHours(hours) : t.home.closedToday}
        </p>
      </div>
    </Link>
  );
}
