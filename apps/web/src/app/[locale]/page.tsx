import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Clock, Star } from "lucide-react";
import { FoodImage } from "@/components/media/food-image";
import { RestaurantMap, type MapPin } from "@/components/discovery/restaurant-map";
import { FocusOnHover } from "@/components/discovery/focus-on-hover";
import { SearchCommand } from "@/components/discovery/search-command";
import { findDishes } from "@/lib/dishes";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
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
  fill,
  isLocale,
  localePath,
  type Dictionary,
  type Locale,
} from "@/lib/i18n";
import { soonestOpening, type SoonestOpening } from "@/lib/next-open";
import { restaurantImage } from "@/lib/placeholder";

/**
 * Startsidan — marknadsplatsens upptäcktsyta (avsnitt 9).
 *
 * Kartan ligger överst och visar varje restaurang som matchar filtret. Beslutat
 * 2026-08-17: den som kommer till burp.se utan att ha skannat en QR-kod frågar
 * "vad finns nära mig", och det svaret är en karta. Sidan hade dessförinnan ett
 * bildcollage där kartan nu ligger, och kartan låg på en egen sida som få hade
 * hittat till.
 *
 * `/upptack` pekar hit sedan dess. Två sidor med samma innehåll är dubblerat
 * innehåll för Google och två ställen att underhålla för oss.
 *
 * Byggd mobilförst. Gästen står oftast på en gata med telefonen i handen, inte
 * vid ett skrivbord, så layouten börjar i en kolumn och breddas uppåt.
 *
 * Sökning och filter är vanliga länkar och ett GET-formulär, inte klientstate.
 * Det gör att sidan fungerar utan JavaScript, att varje filtrerad vy har en
 * egen delbar URL, och att Google kan indexera den. Ett filter som bara finns
 * i minnet ger ingen av de tre sakerna. Kartan är det enda som kräver en
 * webbläsare — allt under den renderas på servern.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Restauranglistan ändras när någon öppnar, stänger eller byter beskrivning —
// inte per sekund. Sidan renderas dock per request eftersom sökningen ligger i
// query-parametrar, och "öppet nu" ändras med klockan.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    kok?: string;
    stad?: string;
    oppet?: string;
    /** Kartans ruta: "syd,väst,nord,öst". Sätts av "Sök i det här området". */
    omrade?: string;
  }>;
}

/** Bygger en URL med ett filter satt eller borttaget, och behåller resten. */
function filterHref(
  locale: Locale,
  current: { q?: string; kok?: string; stad?: string; oppet?: string; omrade?: string },
  change: Partial<{ kok: string | null; stad: string | null; oppet: string | null }>,
): string {
  const params = new URLSearchParams();

  // `null` i `change` betyder "ta bort filtret", en utelämnad nyckel "rör det
  // inte". Utan skillnaden går det inte att skilja "visa alla städer" från
  // "lämna staden som den är".
  for (const key of ["q", "kok", "stad", "oppet"] as const) {
    const value = key in change ? change[key as keyof typeof change] : current[key];
    if (value) params.set(key, value);
  }

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
  const onlyOpen = params.oppet === "1";

  /*
   * Området gästen sökte i, om hon tryckte "Sök i det här området".
   *
   * Ligger i ADRESSEN och inte i ett tillstånd, av samma skäl som stad och kök
   * gör det: sökningen ska gå att dela, gå att backa ur, och överleva en
   * omladdning. `parseBounds` returnerar undefined för allt som inte är fyra
   * tal — en manipulerad parameter ska ge hela listan, inte ett fel.
   */
  const bounds = parseBounds(params.omrade);

  /*
   * Var gästen ungefär befinner sig, läst ur IP-adressen.
   *
   * Vercel skickar `x-vercel-ip-latitude` och `-longitude` på varje request.
   * Grovt — stadsnivå, ibland fel stad — men gratis och UTAN att fråga, och det
   * sista är hela poängen: en sajt som ber om platsen i samma sekund den öppnas
   * får nej av de flesta, och webbläsaren tystar sedan frågan för hela
   * domänen. Då kan den som VILLE dela sin plats inte längre göra det.
   *
   * Används bara för att välja var kartan öppnar. Aldrig till avstånd, aldrig
   * till filter: ett avstånd byggt på en IP-gissning vore en siffra som ser
   * exakt ut utan att vara det.
   *
   * Saknas huvudena — lokalt, och hos varje annan värd — väljer kartan i
   * stället den tätaste klungan.
   */
  const origin = ipOrigin(await headers());

  const [matched, cuisines, cities, openIds, dishes] = await Promise.all([
    searchRestaurants({ query, cuisine, city, bounds }),
    listCuisines(city),
    listCities(),
    openRestaurantIds(),
    /*
     * Rätterna: träffar när något söks, annars de vanligaste.
     *
     * Samma funktion åt båda hållen (migration 0059). Chipsen under sökrutan
     * och sökträffarna är samma fråga med och utan filter — och varje rad har
     * en sida, eftersom tröskeln på två restauranger är densamma där.
     */
    findDishes({ query, citySlug: city, limit: query ? 6 : 8 }),
  ]);

  const restaurants = onlyOpen
    ? matched.filter((entry) => openIds.has(entry.id))
    : matched;

  /*
   * Varför är listan tom?
   *
   * Skillnaden mellan "inget matchade" och "allt är stängt" är hela
   * skillnaden mellan en återvändsgränd och ett besked. `matched` är
   * träffarna FÖRE öppettidsfiltret, så frågan går att besvara exakt:
   * finns det träffar men ingen av dem öppen, är det klockan som stänger
   * listan och ingenting annat.
   */
  const closedOnly = onlyOpen && matched.length > 0 && restaurants.length === 0;

  // Vad öppnar först? Räknas bara när svaret ska visas — annars är det sju
  // dagars slingor per träff i onödan.
  const soonest = closedOnly
    ? soonestOpening(
        matched.map((entry) => ({
          name: entry.name,
          openingHours: entry.openingHours,
          timeZone: entry.timeZone,
        })),
        new Date(),
      )
    : null;

  const activeCity = cities.find((entry) => entry.slug === city);
  const hasFilter = Boolean(query || cuisine || city || onlyOpen);

  /*
   * Bara restauranger med koordinater får en nål.
   *
   * En restaurang utan punkt hamnar i listan men inte på kartan. Alternativet —
   * att sätta nålen i stadens mittpunkt — hade sett rätt ut och skickat gästen
   * fel, vilket är värre än att inte visa något.
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
        {/*
          Kartan högst upp, före rubriken.

          Den som kommer till burp.se utan att ha skannat en QR-kod frågar "vad
          finns nära mig". Svaret är en karta, inte en ingress.

          Den stod en kort stund i en egen kolumn vid sidan av listan, så att
          nålen som tänds när man pekar på ett kort skulle synas. Den ordningen
          är återtagen: kartan hör hemma överst, och synken får vara det den är
          — en detalj för den som råkar ha båda i bild.

          Höjden är satt och inte proportionell: en karta som växer med skärmen
          skjuter listan under vikningen på en bred skärm.
        */}
        <section className="mt-6 h-[20rem] sm:h-[24rem]">
          <RestaurantMap
            pins={pins}
            label={t.discover.mapLabel}
            emptyLabel={closedOnly ? t.discover.mapClosed : t.discover.mapEmpty}
            failedLabel={t.discover.mapFailed}
            texts={{
              locate: t.discover.mapLocate,
              locating: t.discover.mapLocating,
              locateFailed: t.discover.mapLocateFailed,
              youAreHere: t.discover.mapYouAreHere,
              distanceAway: t.discover.mapDistanceAway,
            }}
            area={{
              searchLabel: t.discover.mapSearchArea,
              clearLabel: t.discover.mapClearArea,
              param: "omrade",
            }}
            origin={origin}
          />
        </section>

        <Hero
          t={t}
          locale={locale}
          city={city}
          cuisine={cuisine}
          query={query}
          cityName={activeCity?.name}
        />

        <div className="mt-8 space-y-px">
          {/* "Öppet nu" är ett av/på och inte ett av flera val — därför ett
              reglage och inte en chip. Ett GET-formulär, så att det fungerar
              utan JavaScript. */}
          <form method="get" action={localePath(locale, "/")} className="pb-2">
            {query ? <input type="hidden" name="q" value={query} /> : null}
            {cuisine ? <input type="hidden" name="kok" value={cuisine} /> : null}
            {city ? <input type="hidden" name="stad" value={city} /> : null}
            {onlyOpen ? null : <input type="hidden" name="oppet" value="1" />}

            <button type="submit" aria-pressed={onlyOpen} className="switch">
              {t.discover.openNow}
            </button>
          </form>

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

        {/*
          Rätterna står FÖRE restauranglistan när något söks.

          Den som skriver "punjene paprike" letar efter rätten, inte efter ett
          namn — och rättsidan svarar på frågan "var får jag den, och vad
          kostar den" bättre än en lista över ställen gör.
        */}
        {dishes.length > 0 ? (
          <nav aria-label={t.home.dishHits} className="mt-6">
            <p className="label-caps">{query ? t.home.dishHits : t.home.popularDishes}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {dishes.map((dish) => (
                <li key={`${dish.citySlug}-${dish.slug}`}>
                  <Link
                    href={localePath(locale, `/${dish.citySlug}/ratt/${dish.slug}`)}
                    className="chip"
                  >
                    {dish.name}
                    <span className="ml-1.5 opacity-60">
                      {dish.city} · {dish.restaurants}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {restaurants.length === 0 ? (
          <EmptyState
            t={t}
            locale={locale}
            hasFilter={hasFilter}
            closedOnly={closedOnly}
            soonest={soonest}
            // Samma sökning utan öppettidsfiltret. Den gamla knappen tog
            // bort ALLA filter, alltså även staden och köket gästen valt —
            // vilket är att slänga frågan i stället för att svara på den.
            withClosedHref={localePath(locale, "/") + queryWithoutOpen(params)}
          />
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
                    {/* Skalet kopplar kortet till kartan. Kortet självt
                        renderas fortfarande på servern — se FocusOnHover. */}
                    <FocusOnHover id={restaurant.id}>
                      <RestaurantCard t={t} locale={locale} restaurant={restaurant} />
                    </FocusOnHover>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant) => (
              <li key={restaurant.id}>
                <FocusOnHover id={restaurant.id}>
                  <RestaurantCard t={t} locale={locale} restaurant={restaurant} />
                </FocusOnHover>
              </li>
            ))}
          </ul>
        )}
      </main>

      <SiteFooter locale={locale} path="/" />
    </div>
  );
}

/**
 * Rubriken och sökningen, under kartan.
 *
 * Bar tidigare ett collage av tre restaurangbilder bredvid rubriken. Det sålde
 * mat, men svarade på fel fråga för den som just kommit till sajten — och
 * kartan ovanför gör det jobbet nu. Rutnätet under bär bilderna ändå.
 *
 * Rubriken är mindre än den var. Den konkurrerar inte längre om förstaskärmen,
 * den namnger vad man tittar på.
 */
function Hero({
  t,
  locale,
  city,
  cuisine,
  query,
  cityName,
}: {
  t: Dictionary;
  locale: Locale;
  city?: string;
  cuisine?: string;
  query?: string;
  cityName?: string;
}) {
  return (
    <section className="pt-8">
      <div>
        <p className="label-caps">{t.home.label}</p>

        <h1 className="font-display mt-2 text-[2.25rem] leading-[1.05] sm:text-5xl">
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
          {/*
            Sökrutan svarar medan man skriver.

            Formuläret ligger kvar inuti komponenten: den vägen fungerar utan
            JavaScript, ger en adress som går att dela, och är vad Google
            följer. Förslagen ligger ovanpå — de ersätter ingenting.
          */}
          <SearchCommand
            locale={locale}
            city={city}
            cuisine={cuisine}
            initialQuery={query}
            labels={{
              placeholder: t.home.searchPlaceholder,
              label: t.home.searchLabel,
              button: t.home.searchButton,
              searching: t.home.searching,
              empty: t.home.suggestEmpty,
              dishes: t.home.dishHits,
              restaurants: t.home.restaurantHits,
              cities: t.home.cityHits,
            }}
          />

          {/* Ligger kvar även när formuläret är tomt — utan den ser fältet ut
              att söka i något odefinierat. */}
          <p className="mt-2 max-w-xl text-xs text-[var(--muted)]">{t.home.searchHint}</p>
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

/**
 * Samma frågesträng, utan öppettidsfiltret.
 *
 * Byggs för hand i stället för med `URLSearchParams` för att ordningen ska
 * vara densamma varje gång — en adress som byter parameterordning ser ut som
 * en ny sida för både gästen och cachen.
 */
function queryWithoutOpen(params: {
  q?: string;
  kok?: string;
  stad?: string;
}): string {
  const kept: string[] = [];
  if (params.q?.trim()) kept.push(`q=${encodeURIComponent(params.q.trim())}`);
  if (params.kok?.trim()) kept.push(`kok=${encodeURIComponent(params.kok.trim())}`);
  if (params.stad?.trim()) kept.push(`stad=${encodeURIComponent(params.stad.trim())}`);

  return kept.length > 0 ? `?${kept.join("&")}` : "";
}

/**
 * Tomma listan.
 *
 * Tre olika tomheter, och de får inte se likadana ut:
 *
 * - **Inget alls finns** — nyss uppstartad plattform.
 * - **Filtren tömde listan** — sök, stad eller kök gav ingen träff.
 * - **Allt är stängt** — träffarna finns, klockan är fel.
 *
 * Den sista rapporterades som en bugg 2026-08-24: "Öppet nu" klockan halv två
 * på natten gav "Inga restauranger matchade", kartan sa att ingen träff hade
 * någon kartnål, och räknaren sa noll. Allt tre var formellt sant och
 * tillsammans obegripliga — de beskriver ett datafel, och det fanns inget.
 */
function EmptyState({
  t,
  locale,
  hasFilter,
  closedOnly,
  soonest,
  withClosedHref,
}: {
  t: Dictionary;
  locale: Locale;
  hasFilter: boolean;
  /** Är öppettidsfiltret det ENDA som tömde listan? */
  closedOnly: boolean;
  /** Vilken av träffarna som öppnar först, om någon har öppettider alls. */
  soonest: SoonestOpening | null;
  /** Samma sökning med öppettidsfiltret borttaget — och bara det. */
  withClosedHref: string;
}) {
  if (closedOnly) {
    return (
      <div className="mt-10 border-y border-[var(--rule)] py-16 text-center">
        <p className="font-display text-3xl">{t.home.closedNowTitle}</p>
        <p className="mx-auto mt-3 max-w-sm text-[var(--muted)]">
          {/*
            Veckodagen behåller sin versal ur ordboken. Tyskan skriver dem med
            stor bokstav, och en gemenisering här hade gjort "samstag" av
            "Samstag" — samma avvägning som QR-sidan gör.
          */}
          {soonest === null
            ? t.home.closedNowUnknown
            : soonest.daysAhead === 0
              ? fill(t.home.closedNowNext, {
                  restaurant: soonest.name,
                  time: soonest.opens,
                })
              : fill(t.home.closedNowNextOn, {
                  restaurant: soonest.name,
                  day: t.weekday[soonest.day],
                  time: soonest.opens,
                })}
        </p>
        <Link href={withClosedHref} className="btn btn-primary mt-7">
          {t.home.showClosedToo}
        </Link>
      </div>
    );
  }

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

/**
 * Läser kartans ruta ur adressen: "syd,väst,nord,öst".
 *
 * Returnerar undefined för allt som inte är fyra tal inom giltiga gradtal. En
 * manipulerad parameter ska ge hela listan — inte ett fel, och inte en tom
 * sida. Rutan är ett filter gästen valde, inte en identitet någon bevisar.
 */
function parseBounds(
  raw: string | undefined,
): { minLat: number; minLng: number; maxLat: number; maxLng: number } | undefined {
  if (!raw) return undefined;

  const parts = raw.split(",").map((part) => Number.parseFloat(part));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return undefined;

  const [minLat, minLng, maxLat, maxLng] = parts as [number, number, number, number];

  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return undefined;
  if (minLat >= maxLat || minLng >= maxLng) return undefined;

  return { minLat, minLng, maxLat, maxLng };
}

/**
 * Gästens ungefärliga plats ur begärans huvuden.
 *
 * Bara Vercels egna. Att läsa `x-forwarded-for` och slå upp den mot en
 * geodatabas hade varit ett beroende till, en kostnad per uppslag och en
 * personuppgift att motivera — för att välja var en karta öppnar.
 *
 * Returnerar undefined så fort något inte stämmer. En trasig gissning ska
 * falla tillbaka på tätaste klungan, inte flytta kartan till Atlanten.
 */
function ipOrigin(head: Headers): { latitude: number; longitude: number } | undefined {
  const latitude = Number.parseFloat(head.get("x-vercel-ip-latitude") ?? "");
  const longitude = Number.parseFloat(head.get("x-vercel-ip-longitude") ?? "");

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;

  return { latitude, longitude };
}
