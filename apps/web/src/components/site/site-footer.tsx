import Link from "next/link";
import { listCities, listCuisines } from "@/lib/discovery";
import { dictionary, localePath, type Locale } from "@/lib/i18n";

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
 */
export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  const cities = await listCities();
  const cuisines = await listCuisines();

  return (
    <footer className="mt-24 border-t border-[var(--rule)]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href={localePath(locale, "/")} className="font-display text-3xl">
              Burp
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
              {t.site.tagline}
            </p>
          </div>

          <nav aria-labelledby="footer-stader">
            <p id="footer-stader" className="label-caps">
              {t.site.cities}
            </p>
            <ul className="mt-4 space-y-2.5">
              {cities.map((city) => (
                <li key={city.slug}>
                  <Link href={localePath(locale, `/${city.slug}`)} className="link text-sm">
                    {t.site.restaurantsIn(city.name)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-kok">
            <p id="footer-kok" className="label-caps">
              {t.site.cuisines}
            </p>
            <ul className="mt-4 space-y-2.5">
              {/* Åtta räcker. En fot med trettio länkar är en fot ingen läser,
                  och Google fördelar länkvärdet tunnare ju fler det blir. */}
              {cuisines.slice(0, 8).map((cuisine) => (
                <li key={cuisine}>
                  <Link
                    href={localePath(locale, `/?kok=${encodeURIComponent(cuisine)}`)}
                    className="link text-sm"
                  >
                    {cuisine}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-restauranger">
            <p id="footer-restauranger" className="label-caps">
              {t.site.forRestaurants}
            </p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/anslut" className="link text-sm">
                  {t.site.joinBurp}
                </Link>
              </li>
              <li>
                <Link href="/logga-in" className="link text-sm">
                  {t.site.logIn}
                </Link>
              </li>
              <li>
                <Link href="/skapa-konto" className="link text-sm">
                  {t.site.createAccount}
                </Link>
              </li>
              <li>
                <Link href="/konto" className="link text-sm">
                  {t.site.myOrders}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <hr className="rule mt-12" />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="label-caps">© {new Date().getFullYear()} Burp</p>
          <p className="label-caps">
            {cities.length} {cities.length === 1 ? "stad" : "städer"} ·{" "}
            {cuisines.length} {cuisines.length === 1 ? "kök" : "kök"}
          </p>
        </div>
      </div>
    </footer>
  );
}
