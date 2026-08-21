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
 * Hur många rader en upptäcktsspalt får bära innan den kapas.
 *
 * Åtta är inte en smaksak. Städerna står i en smal spalt och kan bara växa
 * nedåt; kökstyperna står i en bred spalt som bryts i två och växer alltså
 * bara halva vägen. Samma tak ger därför fyra rader kök mot åtta rader stad
 * i värsta fall — och det är den jämnaste rag listorna kan ge utan att någon
 * av dem kapas hårdare än den behöver.
 */
const FOOTER_LIST_LIMIT = 8;

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
  const [allCities, allCuisines] = await Promise.all([listCities(), listCuisines()]);

  const cities = allCities.slice(0, FOOTER_LIST_LIMIT);
  const cuisines = allCuisines.slice(0, FOOTER_LIST_LIMIT);

  return (
    <footer className="mt-24 border-t border-[var(--rule)] bg-[var(--surface)]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        {/*
          Tolv spalter, och de fyra länkgrupperna delar dem OLIKA.

          Foten stod tidigare som fyra lika breda spalter, och det gav den
          ojämnhet som syns direkt: Kök bar åtta rader medan Städer bar tre och
          de två kontogrupperna två var. En spalt full och tre nästan tomma
          bredvid varandra läser som en sida som inte är klar — inte som ett
          val. Bredden ska följa innehållets mängd, inte tvärtom.

          Kök bryts därför i två kolumner, vilket halverar dess höjd. Gäst och
          restaurang staplas på varandra i en enda spalt, eftersom två länkar
          var aldrig fyllde en egen. Kvar blir fyra block som slutar inom ett
          par rader från varandra.

          Kökets två kolumner ligger med ett SMALARE mellanrum än spalterna
          runt omkring — det är det enda som säger att de hör ihop. Med samma
          mellanrum som resten läses den andra kolumnen som en femte spalt vars
          rubrik någon glömt.
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

          <nav aria-labelledby="footer-stader" className="lg:col-span-3">
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
              {allCities.length > cities.length && (
                <li>
                  <Link href={localePath(locale, "/")} className="link-quiet text-sm">
                    {t.site.allCities}
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          <nav aria-labelledby="footer-kok" className="lg:col-span-3">
            <p id="footer-kok" className="label-caps label-caps-ink">
              {t.site.cuisines}
            </p>
            {/*
              `columns-2` och inte ett rutnät: flerkolumnsflödet fyller spalt
              ett innan spalt två börjar, så bokstavsordningen läses uppifrån
              och ner som i vilken lista som helst. Ett rutnät hade lagt A och
              B bredvid varandra och C och D på raden under.

              Marginalen ligger på varje `li` och inte som `space-y` på listan.
              `space-y` sätter marginal på alla utom det första elementet — det
              första i den ANDRA kolumnen räknas inte som först, får sin
              marginal, och står då en rad för lågt.
            */}
            <ul className="mt-4 -mb-2.5 sm:columns-2 sm:gap-x-6">
              {cuisines.map((cuisine) => (
                <li key={cuisine} className="mb-2.5">
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
            Gästen och restaurangen har var sin rubrik men delar spalt.

            De låg tidigare i samma lista under rubriken "För restauranger",
            och två av fyra länkar där — gästkonto och mina beställningar —
            vände sig till gästen. En rubrik som ljuger om halva sitt innehåll
            är sämre än ingen rubrik: den som letar efter sina beställningar
            läser förbi kolumnen. Rubrikerna är alltså kvar och skilda åt; det
            som ändrats är att de inte längre kostar en tom spalt var.
          */}
          <div className="space-y-8 lg:col-span-2">
            <nav aria-labelledby="footer-gaster">
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

            <nav aria-labelledby="footer-restauranger">
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

          {/*
            Språken satt tidigare som fem versala ord på rad med samma
            mellanrum till globen som till varandra — en ordvälling där det
            inte gick att se var växlaren började. Globen har fått en egen
            distans, och orden ett tunt streck emellan sig.
          */}
          <nav aria-label={t.site.language} className="flex items-center gap-3">
            <Globe size={14} aria-hidden="true" className="shrink-0 text-[var(--muted)]" />
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-0">
              {LOCALES.map((entry, index) => (
                <li key={entry} className="flex items-center">
                  {/*
                    Strecket göms på den smalaste skärmen. Där ryms inte fem
                    språknamn på en rad, och ett radbrytt streck hamnar först
                    på nästa rad med ingenting till vänster om sig. Utan
                    streck bär mellanrummet uppdelningen i stället.
                  */}
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className="mx-3 hidden h-3 w-px bg-[var(--rule)] sm:block"
                    />
                  )}
                  <Link
                    href={localePath(entry, path)}
                    hrefLang={entry}
                    lang={entry}
                    aria-current={entry === locale ? "true" : undefined}
                    className="label-caps link-quiet"
                  >
                    {LOCALE_SHORT_LABELS[entry]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
