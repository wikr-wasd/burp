import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Clock, QrCode, Receipt, Star, UtensilsCrossed } from "lucide-react";
import { FoodImage } from "@/components/media/food-image";
import { RestaurantMap, type MapPin } from "@/components/discovery/restaurant-map";
import { FocusOnHover } from "@/components/discovery/focus-on-hover";
import { formatMoney } from "@burp/core";
import { SearchCommand } from "@/components/discovery/search-command";
import { DishPicker, type PickableDish } from "@/components/discovery/dish-picker";
import { findDishes } from "@/lib/dishes";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import {
  listCities,
  listCuisines,
  openRestaurantIds,
  priceTierLabel,
  restaurantHighlights,
  searchRestaurants,
  todaysHours,
  type DiscoveryRestaurant,
  type DishHighlight,
} from "@/lib/discovery";
import {
  dictionary,
  fill,
  isLocale,
  localePath,
  LOCALE_TAGS,
  type Dictionary,
  type Locale,
} from "@/lib/i18n";
import { soonestOpening, type SoonestOpening } from "@/lib/next-open";
import { isPlaceholder, restaurantImage } from "@/lib/placeholder";

/**
 * Startsidan — marknadsplatsens upptäcktsyta (avsnitt 9).
 *
 * ── Ordningen på sidan ─────────────────────────────────────────────────────
 *
 * Hjälte, karta, filter, lista, "Vid bordet".
 *
 * Kartan låg ÖVERST från 2026-08-17 till 2026-08-28. Skälet var riktigt — den
 * som kommer till burp.se utan att ha skannat en QR-kod frågar "vad finns nära
 * mig" — men svaret levererades som en dämpad grå ruta utan rubrik, före ett
 * enda ord om vad Burp är. En karta är ett verktyg, inte en hälsning, och en
 * förstaskärm som inte säljer mat säljer ingenting.
 *
 * Kartan ligger därför nu direkt under hjälten, som ett eget avsnitt med
 * rubrik. Den är oförändrad i övrigt: samma nålar, samma "sök i det här
 * området", samma koppling till korten.
 *
 * `/upptack` pekar hit sedan flytten 2026-08-17. Två sidor med samma innehåll
 * är dubblerat innehåll för Google och två ställen att underhålla för oss.
 *
 * ── Vad som kräver en webbläsare ───────────────────────────────────────────
 *
 * Sökning och filter är vanliga länkar och ett GET-formulär, inte klientstate.
 * Det gör att sidan fungerar utan JavaScript, att varje filtrerad vy har en
 * egen delbar URL, och att Google kan indexera den. Ett filter som bara finns
 * i minnet ger ingen av de tre sakerna.
 *
 * Kartan och sökförslagen är det enda som kräver en webbläsare. Rörelsen —
 * korten som stiger in, pulsen vid "öppna just nu" — är ren CSS och stannar
 * av sig själv för den som bett om mindre rörelse. Ingen observatör, ingen
 * klientkomponent, ingenting som körs när fliken ligger i bakgrunden.
 *
 * Byggd mobilförst. Gästen står oftast på en gata med telefonen i handen, inte
 * vid ett skrivbord, så layouten börjar i en kolumn och breddas uppåt.
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

  /*
   * Vad man äter på varje ställe.
   *
   * Hämtas EFTER filtret, för de restauranger som faktiskt visas — en fråga
   * för hela listan, inte en per kort. Korten bar tidigare namn, kök, betyg
   * och en beskrivning; allt det säger vad stället är, ingenting vad man äter
   * där. Bilden skulle ha svarat på det och gör det inte, eftersom seed-datan
   * ritar en bokstav i en färgruta.
   */
  const highlights = await restaurantHighlights(restaurants.map((entry) => entry.id));

  /*
   * Rätterna grupperade per RÄTT, inte per stad.
   *
   * `find_dishes` svarar per stad, eftersom det är så en rättsida ser ut. För
   * chipsen är det fel form: "Ćevapi 10 kom · Sarajevo" och "Ćevapi 10 kom ·
   * Mostar" bredvid varandra läses som två rätter. Grupperingen gör dem till
   * ETT val som frågar "var?" när man pekar på det.
   */
  const pickable = groupDishesBySlug(dishes);

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

  /*
   * Hur många av träffarna som har öppet just nu.
   *
   * Står i etiketten över rubriken, med en grön puls framför. En
   * marknadsplats som inte säger något om nuet läser som en katalog någon
   * lade upp en gång — och siffran är redan uträknad, `openIds` hämtas ändå
   * för filtret.
   */
  const openCount = restaurants.filter((entry) => openIds.has(entry.id)).length;

  /*
   * Fyra ställen i hjälten, som bild.
   *
   * Bara när ingenting är filtrerat. Har gästen sökt är hjälten ett verktyg
   * och inte ett skyltfönster, och fyra plockade kort ovanför en lista som
   * redan innehåller dem hade varit samma innehåll två gånger.
   */
  const showcase = hasFilter ? [] : pickShowcase(locale, restaurants, highlights, openIds);

  return (
    <div className="min-h-screen">
      <SiteHeader locale={locale} path="/" />

      {/*
        Sidan i band, och `main` bär inte längre någon egen bredd.

        Hjälten, filterraden och "Vid bordet" går kant i kant med fönstret och
        sätter sin egen inre bredd. En sida där varje avsnitt slutar vid samma
        osynliga 6xl-kant ser ut som ett dokument; band som når ut i kanten ser
        ut som en produkt.
      */}
      <main>
        <Hero
          t={t}
          locale={locale}
          city={city}
          cuisine={cuisine}
          query={query}
          dishes={pickable}
          cityName={activeCity?.name}
          openCount={openCount}
          showcase={showcase}
        />

        {/*
          Kartan — eget avsnitt, direkt under hjälten.

          Den låg överst från 2026-08-17 till 2026-08-28. Frågan den svarar på
          är fortfarande den rätta — "vad finns nära mig" — men en dämpad grå
          ruta är en dålig hälsning, och en karta utan rubrik läser som en
          annons. Den ligger nu först under vikningen med ett namn över sig,
          vilket är där en gäst letar efter den.

          Höjden är satt och inte proportionell: en karta som växer med skärmen
          skjuter listan under vikningen på en bred skärm.
        */}
        <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6" aria-labelledby="karta">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="karta" className="font-display text-2xl">
              {t.home.mapHeading}
            </h2>
            <p className="text-sm text-[var(--muted)]">{t.home.mapHint}</p>
          </div>

          <div className="mt-4 h-[20rem] sm:h-[26rem]">
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
                clusterLabel: t.discover.mapCluster,
              }}
              area={{
                searchLabel: t.discover.mapSearchArea,
                clearLabel: t.discover.mapClearArea,
                param: "omrade",
              }}
              origin={origin}
            />
          </div>
        </section>

        {/*
          Filterraden följer med nedåt.

          Listan under den är lång — nio städer och ett tjugotal ställen — och
          ett filter som bara finns högst upp tvingar den som scrollat halvvägs
          att scrolla tillbaka för att byta stad. Formen ligger i `.filter-bar`
          i globals.css.

          Etiketterna "Stad" och "Kök" är borta ur bilden och kvar för
          skärmläsaren. Raderna börjar med "Alla städer" respektive "Alla kök",
          alltså namnger de sig själva — och en klistrad rad har inte råd med en
          spalt som bara upprepar vad chipsen redan säger.
        */}
        <div className="filter-bar mt-12">
          <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
            <div className="flex items-center gap-3">
              {/* "Öppet nu" är ett av/på och inte ett av flera val — därför ett
                  reglage och inte en chip. Ett GET-formulär, så att det
                  fungerar utan JavaScript. */}
              <form method="get" action={localePath(locale, "/")} className="shrink-0">
                {query ? <input type="hidden" name="q" value={query} /> : null}
                {cuisine ? <input type="hidden" name="kok" value={cuisine} /> : null}
                {city ? <input type="hidden" name="stad" value={city} /> : null}
                {onlyOpen ? null : <input type="hidden" name="oppet" value="1" />}

                <button type="submit" aria-pressed={onlyOpen} className="switch">
                  {t.discover.openNow}
                </button>
              </form>

              <span aria-hidden="true" className="h-6 w-px shrink-0 bg-[var(--rule)]" />

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
            </div>

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
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="font-display text-2xl">
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
                    /* `.reveal` låter kortet stiga in när det kommer i bild.
                       Ren CSS, se globals.css — ingen observatör, ingen
                       klientkod, och ingenting alls i en webbläsare utan
                       stöd. */
                    <li key={restaurant.id} className="reveal">
                      {/* Skalet kopplar kortet till kartan. Kortet självt
                          renderas fortfarande på servern — se FocusOnHover. */}
                      <FocusOnHover id={restaurant.id}>
                        <RestaurantCard
                          t={t}
                          locale={locale}
                          restaurant={restaurant}
                          dishes={highlights.get(restaurant.id) ?? []}
                        />
                      </FocusOnHover>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {restaurants.map((restaurant) => (
                <li key={restaurant.id} className="reveal">
                  <FocusOnHover id={restaurant.id}>
                    <RestaurantCard
                      t={t}
                      locale={locale}
                      restaurant={restaurant}
                      dishes={highlights.get(restaurant.id) ?? []}
                    />
                  </FocusOnHover>
                </li>
              ))}
            </ul>
          )}
        </div>

        <HowItWorks t={t} />
      </main>

      <SiteFooter locale={locale} path="/" />
    </div>
  );
}

/**
 * Hjälten — det första en besökare ser.
 *
 * Låg tidigare UNDER kartan och var därför en rubrik man scrollade förbi.
 * Ordningen vändes 2026-08-28: kartan svarar på "vad finns nära mig", vilket
 * är rätt fråga, men en dämpad grå ruta är en dålig hälsning och säger
 * ingenting om vad Burp är. Hjälten ligger först, kartan direkt under.
 *
 * Två spalter från `lg` och uppåt. Vänster är orden och sökningen, höger fyra
 * ställen som bild — hjälten bar ett collage en gång, och det som var fel med
 * det var inte bilderna utan att de inte gick att klicka på. De här gör det,
 * och de bär namn, rätt och pris.
 *
 * Under `lg` blir bildspalten en rulle under chipsen i stället för att ligga
 * före dem. Gästen står på en gata med telefonen i handen: sökrutan ska ligga
 * ovanför vikningen, inte fyra bilder.
 */
function Hero({
  t,
  locale,
  city,
  cuisine,
  query,
  dishes,
  cityName,
  openCount,
  showcase,
}: {
  t: Dictionary;
  locale: Locale;
  city?: string;
  cuisine?: string;
  query?: string;
  /** Rätter att äta i stället för en ingress om tjänsten. */
  dishes: readonly PickableDish[];
  cityName?: string;
  /** Hur många av träffarna som har öppet just nu. */
  openCount: number;
  /** Fyra ställen som bild. Tom när något är filtrerat. */
  showcase: readonly ShowcaseItem[];
}) {
  return (
    /*
     * `relative z-30` på bandet.
     *
     * Filterraden under är `sticky` med `z-20` och bildar därmed en egen
     * stackningskontext. Utan det här skulle sökförslagen — som fälls ut nedåt
     * ur fältet — hamna bakom den klistrade raden så fort listan är kort nog
     * att de överlappar.
     */
    <section className="hero-band relative z-30">
      <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-4 pt-10 pb-12 sm:px-6 lg:grid-cols-12 lg:pt-16 lg:pb-16">
        <div className="lg:col-span-7">
          <p className="label-caps flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t.home.label}</span>

            {/*
              Räknaren står här och inte som ett eget block.

              En marknadsplats som inte säger något om nuet läser som en katalog
              någon lade upp en gång. Pulsen framför siffran är grön, som allt
              annat som bekräftar — se `.dot-live` i globals.css.
            */}
            {openCount > 0 ? (
              <span className="label-caps-ink flex items-center gap-1.5">
                <span className="dot-live" aria-hidden="true" />
                {fill(t.home.openNowCount, { n: String(openCount) })}
              </span>
            ) : null}
          </p>

          <h1 className="font-display mt-3 text-[2.5rem] leading-[1.02] sm:text-6xl">
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

            Sökrutan svarar medan man skriver. Formuläret ligger kvar inuti
            komponenten: den vägen fungerar utan JavaScript, ger en adress som
            går att dela, och är vad Google följer. Förslagen ligger ovanpå —
            de ersätter ingenting.
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

          {/*
            Mat direkt under sökrutan.

            Hjälten säger vad Burp ÄR. Det är rätt en gång, för den som aldrig
            varit här — men det svarar inte på varför man skulle stanna. Raden
            under gör det: riktiga rätter som verkligen finns i närheten.

            Väljaren är också hela "vad är du sugen på"-flödet. Ett eget guidat
            block bredvid den hade ställt samma fråga två gånger med olika
            utseende, och den sortens dubblett är hur en startsida blir en
            samling avdelningar i stället för en sida.
          */}
          <DishPicker
            locale={locale}
            dishes={dishes}
            heading={query ? t.home.dishHits : t.home.popularDishes}
            whereHeading={t.home.whereDish}
            citiesLabel={t.home.inCities}
          />
        </div>

        {showcase.length > 0 ? (
          <div className="lg:col-span-5">
            <Showcase t={t} locale={locale} items={showcase} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Ett ställe i hjältens bildspalt. */
interface ShowcaseItem {
  id: string;
  name: string;
  city: string;
  href: string;
  image: string;
  currency: DiscoveryRestaurant["currency"];
  /** Översta raden ur menyn. Null för en restaurang utan publicerad meny. */
  dish: DishHighlight | null;
}

/**
 * Hjältens bildspalt.
 *
 * Byggd för fotografier. Där restaurangen inte laddat upp något ritar
 * `/bild/[namn]` en tallrik i en varm ton — inte en tom ruta — och texten
 * ovanpå bär ändå namnet, rätten och priset. Ytan är alltså hel idag och
 * blir vacker den dagen bilderna kommer, vilket är ordningen man vill ha den
 * i: en restaurang som fotograferat sin mat ska alltid se bättre ut än en
 * som inte gjort det.
 *
 * Rulle på smala skärmar, rutnät från `lg`. `snap-x` gör att rullen stannar
 * på en hel bild i stället för mitt i en — utan den känns en horisontell
 * lista på en telefon trasig.
 */
function Showcase({
  t,
  locale,
  items,
}: {
  t: Dictionary;
  locale: Locale;
  items: readonly ShowcaseItem[];
}) {
  return (
    <section aria-labelledby="skyltfonster">
      <h2 id="skyltfonster" className="label-caps">
        {t.home.showcaseLabel}
      </h2>

      <ul className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-2 lg:px-0 [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            className="w-[62%] max-w-[15rem] shrink-0 snap-start lg:w-auto lg:max-w-none"
          >
            <Link
              href={item.href}
              className="card group relative block overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
            >
              <FoodImage src={item.image} alt="" ratio="aspect-[4/3]" />

              {/* Mörkningen är byggstenen `.media-scrim` — genomskinlig upptill
                  så att maten syns, nästan svart nertill så att texten går att
                  läsa. En jämn platta över hela bilden hade dämpat motivet,
                  vilket är precis vad den inte får göra. */}
              <div className="media-scrim absolute inset-x-0 bottom-0 p-3">
                <p className="font-display truncate text-sm text-white">{item.name}</p>

                {item.dish ? (
                  <p className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-white/85">
                    <span className="min-w-0 truncate">{item.dish.name}</span>
                    {/* Restaurangens EGEN valuta. Ett kort i Novi Sad som visar
                        KM är värre än inget pris alls. */}
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(item.dish.priceOre, item.currency, LOCALE_TAGS[locale])}
                    </span>
                  </p>
                ) : (
                  <p className="mt-0.5 truncate text-xs text-white/85">{item.city}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Väljer ut ställena till hjältens bildspalt.
 *
 * Ordningen är: riktig bild före platshållare, öppet före stängt, högst betyg
 * sist av kriterierna. Att låta fotografiet väga tyngst är avsiktligt — det är
 * spalten som ska sälja, och den restaurang som lagt tid på sina bilder ska
 * tjäna på det.
 *
 * Färre än två ställen ger ingen spalt alls. En ensam bild bredvid rubriken
 * läser som en annons någon glömt att fylla på.
 */
function pickShowcase(
  locale: Locale,
  restaurants: readonly DiscoveryRestaurant[],
  highlights: Map<string, DishHighlight[]>,
  openIds: ReadonlySet<string>,
): ShowcaseItem[] {
  if (restaurants.length < 2) return [];

  const ranked = [...restaurants].sort((a, b) => {
    const scoreOf = (entry: DiscoveryRestaurant) =>
      (isPlaceholder(restaurantImage(entry.name, entry.city, entry.heroImageUrl)) ? 0 : 4) +
      (openIds.has(entry.id) ? 2 : 0);

    const difference = scoreOf(b) - scoreOf(a);
    if (difference !== 0) return difference;

    return (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0);
  });

  return ranked.slice(0, 4).map((entry) => ({
    id: entry.id,
    name: entry.name,
    city: entry.city,
    href: localePath(locale, `/r/${entry.citySlug}/${entry.slug}`),
    image: restaurantImage(entry.name, entry.city, entry.heroImageUrl),
    currency: entry.currency,
    dish: highlights.get(entry.id)?.[0] ?? null,
  }));
}

/**
 * "Vid bordet" — det enda på startsidan som förklarar vad Burp gör som ingen
 * annan.
 *
 * Startsidan listade restauranger och sa i en ingress att man kan beställa med
 * en QR-kod. Den meningen är hela produkten, och den stod som en bisats. Här
 * står den som tre steg, sist på sidan: den som scrollat igenom listan har
 * sett VAD som finns, och får då veta vad som händer när hen kommer dit.
 *
 * Inga knappar, med flit. Man kan inte skanna en dekal härifrån, och en knapp
 * som inte leder någonstans är ett skal.
 */
function HowItWorks({ t }: { t: Dictionary }) {
  const steps = [
    { Icon: QrCode, title: t.home.howStep1, body: t.home.howStep1Body },
    { Icon: UtensilsCrossed, title: t.home.howStep2, body: t.home.howStep2Body },
    { Icon: Receipt, title: t.home.howStep3, body: t.home.howStep3Body },
  ];

  return (
    /* Samma varma tvättning som hjälten, inte den vita ytan. Sidfoten under
       är redan `--surface`; två vita band med en grå remsa emellan hade sett
       ut som ett misstag i marginalen. Bandet ramar i stället in sidan: samma
       ton överst och underst. */
    <section className="hero-band mt-20 border-t border-[var(--rule)]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <p className="label-caps">{t.home.howLabel}</p>
        <h2 className="font-display mt-2 text-3xl">{t.home.howTitle}</h2>

        <ol className="mt-9 grid gap-8 sm:grid-cols-3">
          {steps.map(({ Icon, title, body }) => (
            <li key={title} className="reveal flex gap-4">
              <span className="step-mark" aria-hidden="true">
                <Icon size={20} />
              </span>
              <div>
                <p className="font-display text-base">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * En rad filterchippar.
 *
 * Etiketten ("Stad", "Kök") är borta ur bilden och kvar i `aria-label`. Raden
 * börjar med "Alla städer" respektive "Alla kök" och namnger därmed sig själv,
 * och filterraden är klistrad sedan 2026-08-28 — en rad som följer med nedåt
 * har inte råd med en spalt som upprepar vad chipsen redan säger.
 */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="-mr-4 flex min-w-0 flex-1 gap-1 overflow-x-auto py-1 pr-4 sm:-mr-6 sm:pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label={label}
    >
      {children}
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
  dishes,
}: {
  t: Dictionary;
  locale: Locale;
  restaurant: DiscoveryRestaurant;
  /** Några rätter ur menyn, i restaurangens egen ordning. Kan vara tom. */
  dishes: readonly DishHighlight[];
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

        {/*
          Menyn, inte bilden.

          Tre rader ur menyn med pris svarar på "vad äter man här och vad
          kostar det" — den fråga kortet inte kunde svara på. De ligger nederst
          och pressas ner av `mt-auto`, så att korten radar upp sina priser i
          linje även när beskrivningarna är olika långa.

          Priset formateras med restaurangens EGEN valuta. Ett kort i Novi Sad
          som visar KM är värre än inget pris alls.
        */}
        {dishes.length > 0 ? (
          <ul className="mt-auto space-y-1 pt-3">
            {dishes.map((dish) => (
              <li
                key={dish.name}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-[var(--muted)]">{dish.name}</span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(dish.priceOre, restaurant.currency, LOCALE_TAGS[locale])}
                </span>
              </li>
            ))}
          </ul>
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

/**
 * Slår ihop `find_dishes` per rätt.
 *
 * Funktionen svarar per stad, för det är formen en rättsida har. Chipsen
 * behöver den andra formen: ett val per rätt, med städerna som ett andra steg.
 * Ordningen behålls — den är antal ställen fallande, satt i SQL — och
 * städerna inom varje rätt ärver den.
 */
function groupDishesBySlug(
  rows: readonly { slug: string; name: string; citySlug: string; city: string; restaurants: number }[],
): PickableDish[] {
  const bySlug = new Map<string, PickableDish>();

  for (const row of rows) {
    const existing = bySlug.get(row.slug);
    const city = { citySlug: row.citySlug, city: row.city, restaurants: row.restaurants };

    if (existing) existing.cities.push(city);
    else bySlug.set(row.slug, { slug: row.slug, name: row.name, cities: [city] });
  }

  return [...bySlug.values()];
}
