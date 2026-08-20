import Link from "next/link";
import { Globe } from "lucide-react";
import { BurpMark } from "@/components/ui/burp-mark";
import { listCities, listCuisines } from "@/lib/discovery";
import {
  dictionary,
  localePath,
  LOCALE_SHORT_LABELS,
  LOCALES,
  type Locale,
} from "@/lib/i18n";

/**
 * Sidfoten — marknadsplatsens karta.
 *
 * Gör två saker samtidigt. För gästen: en väg vidare när sidan tagit slut,
 * i stället för en återvändsgränd som tvingar fram bakåtknappen. För Google:
 * interna länkar till varje stad och varje kökstyp från varenda sida, vilket
 * är hur landningssidorna faktiskt blir hittade.
 *
 * Länkarna hämtas ur databasen i stället för att skrivas i koden. En ny stad
 * ska dyka upp i foten samma dag den första restaurangen där öppnar — inte
 * nästa gång någon råkar redigera den här filen.
 *
 * Länkarna är `.link-quiet` och inte `.link`. I brödtext ska en länk sticka ut
 * ur meningen; här är varenda rad en länk, och femton röda understrykningar i
 * rad blir en vägg som konkurrerar med maten ovanför.
 */
export async function SiteFooter({
  locale,
  /**
   * Sidan vi står på, utan språkprefix — samma prop som sidhuvudet tar.
   *
   * Språkraden längst ned måste peka på SAMMA sida i det andra språket. En
   * växlare som kastar gästen till startsidan mitt i ett besök är värre än
   * ingen växlare, och det gäller lika mycket i foten som i huvudet.
   */
  path = "/",
}: {
  locale: Locale;
  path?: string;
}) {
  const t = dictionary(locale);
  const cities = await listCities();
  const cuisines = await listCuisines();

  return (
    <footer className="mt-24 border-t border-[var(--rule)] bg-[var(--surface)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {/*
          Tolv spalter, inte fyra lika breda.

          Vinjetten och tagline är produktens tes och stod tidigare klämd på en
          fjärdedel, med radbrytning mitt i meningen. Den får en tredjedel nu;
          de fyra länklistorna är korta och klarar sig på två spalter var.
        */}
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link
              href={localePath(locale, "/")}
              aria-label={t.site.home}
              className="inline-block transition-opacity duration-[var(--speed)] hover:opacity-80"
            >
              <BurpMark size="lg" />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
              {t.site.tagline}
            </p>
          </div>

          <nav aria-labelledby="footer-stader" className="lg:col-span-2">
            <p id="footer-stader" className="label-caps label-caps-ink">
              {t.site.cities}
            </p>
            <ul className="mt-4 space-y-2.5">
              {cities.map((city) => (
                <li key={city.slug}>
                  <Link
                    href={localePath(locale, `/${city.slug}`)}
                    className="link-quiet text-sm"
                  >
                    {t.site.restaurantsIn(city.name)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-kok" className="lg:col-span-2">
            <p id="footer-kok" className="label-caps label-caps-ink">
              {t.site.cuisines}
            </p>
            <ul className="mt-4 space-y-2.5">
              {/* Åtta räcker. En fot med trettio länkar är en fot ingen läser,
                  och Google fördelar länkvärdet tunnare ju fler det blir. */}
              {cuisines.slice(0, 8).map((cuisine) => (
                <li key={cuisine}>
                  <Link
                    href={localePath(locale, `/?kok=${encodeURIComponent(cuisine)}`)}
                    className="link-quiet text-sm"
                  >
                    {cuisine}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/*
            Gästen och restaurangen fick var sin spalt.

            De låg tidigare i samma lista under rubriken "För restauranger",
            och två av fyra länkar där — gästkonto och mina beställningar —
            vände sig till gästen. En rubrik som ljuger om halva sitt innehåll
            är sämre än ingen rubrik: den som letar efter sina beställningar
            läser förbi kolumnen.
          */}
          <nav aria-labelledby="footer-gaster" className="lg:col-span-2">
            <p id="footer-gaster" className="label-caps label-caps-ink">
              {t.site.forGuests}
            </p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/skapa-konto" className="link-quiet text-sm">
                  {t.site.createAccount}
                </Link>
              </li>
              <li>
                <Link href="/konto" className="link-quiet text-sm">
                  {t.site.myOrders}
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="footer-restauranger" className="lg:col-span-2">
            <p id="footer-restauranger" className="label-caps label-caps-ink">
              {t.site.forRestaurants}
            </p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/anslut" className="link-quiet text-sm">
                  {t.site.joinBurp}
                </Link>
              </li>
              <li>
                <Link href="/logga-in" className="link-quiet text-sm">
                  {t.site.logIn}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <hr className="rule mt-14" />

        {/*
          Understa raden bar tidigare en räknare: "7 städer · 4 kök".

          Den gjorde två fel samtidigt. Orden var hårdkodad svenska mitt i en
          fot som renderas på fem språk — en tysk gäst läste "7 städer · 4 kök"
          under sin tyska sida. Och siffran marknadsför det som ännu är litet;
          en marknadsplats som räknar upp sig själv innan den är stor ber om
          att bli jämförd med en som är det.

          Språkraden är nyttigare på samma plats. Den som skrollat igenom en
          lång restauranglista ska inte behöva skrolla tillbaka till huvudet
          för att byta språk.
        */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <p className="label-caps">© {new Date().getFullYear()} Burp</p>

          <nav
            aria-label={t.site.language}
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <Globe size={14} aria-hidden="true" className="text-[var(--muted)]" />
            {LOCALES.map((entry) => (
              <Link
                key={entry}
                href={localePath(entry, path)}
                hrefLang={entry}
                lang={entry}
                aria-current={entry === locale ? "true" : undefined}
                className="label-caps link-quiet"
              >
                {LOCALE_SHORT_LABELS[entry]}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
