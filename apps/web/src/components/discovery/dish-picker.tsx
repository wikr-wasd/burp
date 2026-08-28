import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { fill, localePath, type Locale } from "@/lib/i18n";

/**
 * "Vad är du sugen på?" — utan att skriva ett ord.
 *
 * ── Varför det här och inte ett eget guidat block ───────────────────────────
 *
 * Rättchipsen under sökrutan VAR redan steg ett i ett sådant flöde. Ett andra
 * block bredvid dem hade ställt samma fråga två gånger med olika utseende, och
 * den sortens dubblett är hur en startsida blir en samling avdelningar i
 * stället för en sida.
 *
 * Så chipsen fick steg två i stället. En rätt som finns i flera städer fälls
 * ut till städerna; en som bara finns i en går direkt dit. Ingen mellansida,
 * ingen fråga gästen redan besvarat.
 *
 * ── Varför `<details>` och inte en klientkomponent ──────────────────────────
 *
 * Första utkastet var `"use client"` med `useState`, och en rätt i flera
 * städer blev en `<button>`. En knapp utan klientkod är en död knapp, och
 * startsidan renderas och används annars helt utan sådan. Samma skäl som
 * språkväljaren i sidhuvudet har: webbläsaren fäller ut och stänger en
 * `<details>` själv, och en skärmläsare vet vad den är.
 *
 * ── Varför städerna ligger med från början ──────────────────────────────────
 *
 * Servern har dem redan — `find_dishes` grupperar per stad, så uppslaget är
 * gjort. Att hämta dem vid klicket hade betytt en väntan mitt i ett val som
 * ska kännas som att peka på en meny.
 */

export interface PickableDish {
  slug: string;
  name: string;
  /** Städerna rätten finns i, flest ställen först. */
  cities: { citySlug: string; city: string; restaurants: number }[];
}

export function DishPicker({
  locale,
  dishes,
  heading,
  whereHeading,
  citiesLabel,
}: {
  locale: Locale;
  dishes: readonly PickableDish[];
  heading: string;
  /** Bär `{dish}`. */
  whereHeading: string;
  /** "3 städer". Bär `{n}`. */
  citiesLabel: string;
}) {
  if (dishes.length === 0) return null;

  return (
    <nav aria-label={heading} className="mt-6">
      <p className="label-caps">{heading}</p>

      <ul className="mt-2 flex flex-wrap gap-2">
        {dishes.map((dish) => {
          const only = dish.cities.length === 1 ? dish.cities[0]! : null;
          const total = dish.cities.reduce((sum, entry) => sum + entry.restaurants, 0);

          /*
           * En stad — gå dit. Flera — fråga vilken.
           *
           * En länk när svaret är givet och en utfällning när det inte är det.
           * Att göra allt till utfällningar hade tagit ifrån gästen
           * möjligheten att öppna i en ny flik, och det är just den gästen som
           * jämför tre ställen mot varandra.
           */
          return (
            <li key={dish.slug}>
              {only ? (
                <Link
                  href={localePath(locale, `/${only.citySlug}/ratt/${dish.slug}`)}
                  className="chip"
                >
                  {dish.name}
                  <span className="ml-1.5 opacity-60">
                    {only.city} · {only.restaurants}
                  </span>
                </Link>
              ) : (
                <details className="relative">
                  <summary className="chip cursor-pointer list-none">
                    {dish.name}
                    <span className="ml-1.5 opacity-60">
                      {fill(citiesLabel, { n: String(dish.cities.length) })} · {total}
                    </span>
                    <ChevronDown size={14} aria-hidden="true" className="ml-1 opacity-60" />
                  </summary>

                  <nav
                    aria-label={fill(whereHeading, { dish: dish.name })}
                    className="card absolute left-0 z-20 mt-1 flex min-w-44 flex-col p-1"
                  >
                    <p className="label-caps px-3 pt-1 pb-2">
                      {fill(whereHeading, { dish: dish.name })}
                    </p>

                    {dish.cities.map((entry) => (
                      <Link
                        key={entry.citySlug}
                        href={localePath(locale, `/${entry.citySlug}/ratt/${dish.slug}`)}
                        className="min-h-11 content-center rounded-[0.5rem] px-3 text-sm whitespace-nowrap hover:bg-[var(--background)]"
                      >
                        {entry.city}
                        <span className="ml-1.5 opacity-60">{entry.restaurants}</span>
                      </Link>
                    ))}
                  </nav>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
