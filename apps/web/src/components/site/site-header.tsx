import Link from "next/link";
import { Search } from "lucide-react";
import { BurpMark } from "@/components/ui/burp-mark";
import { dictionary, localePath, LOCALE_LABELS, LOCALES, type Locale } from "@/lib/i18n";

/**
 * Sidhuvudet — ett enda, på varje publik sida.
 *
 * Innan det här fanns ritade varje sida sitt eget: startsidan hade vinjetten i
 * antikva, stadssidan hade "Burp" i fet grotesk, och inloggningen hade inget
 * alls. Tre sidor, tre produkter. Ett gemensamt sidhuvud är inte en
 * kodstädning — det är skillnaden mellan att gästen känner igen sig och att
 * hen undrar om hen hamnat rätt.
 *
 * QR-sidan vid bordet har medvetet inget sidhuvud. Där har gästen redan
 * bestämt sig, sitter framför maten, och varje länk bort från menyn är en
 * länk bort från beställningen.
 */

export interface Breadcrumb {
  label: string;
  /** Utelämnas för den sista smulan — den man redan står på. */
  href?: string;
}

export function SiteHeader({
  locale,
  breadcrumbs = [],
  /** Sökvägen utan språkprefix, så språkväljaren kan peka på samma sida. */
  path = "/",
}: {
  locale: Locale;
  breadcrumbs?: readonly Breadcrumb[];
  path?: string;
}) {
  const t = dictionary(locale);

  return (
    <header className="border-b border-[var(--rule)]">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
        <Link
          href={localePath(locale, "/")}
          aria-label={t.site.home}
          className="text-[var(--foreground)] transition-opacity duration-[var(--speed)] hover:opacity-80"
        >
          <BurpMark size="md" />
        </Link>

        {/*
          Ingen landsrad här.

          Burp listar inte länder, den listar restauranger. Vilket land en
          restaurang ligger i syns där det spelar roll — i valutan på notan och
          i momsen på menyraden — och är i övrigt gästens minsta bekymmer.
          Rubriker som räknar upp marknader talar om plattformen i stället för
          om maten.
        */}

        {/*
          Sökrutan i sidhuvudet, inte bara på startsidan.

          Den som står på en restaurangsida och inser att hen vill ha något
          annat hade tidigare bara bakåtknappen. Formuläret är ett vanligt GET
          mot startsidan: det fungerar utan JavaScript, ger en delbar URL och
          kan indexeras — samma tre skäl som startsidans egen sökning.

          Döljs under `lg`. På en telefon är sidhuvudet till för att ta sig
          hem, och startsidans fält ligger ändå ovanför vikningen.
        */}
        <form
          action={localePath(locale, "/")}
          method="get"
          role="search"
          className="relative hidden max-w-sm flex-1 lg:block"
        >
          <label htmlFor="site-search" className="sr-only">
            {t.site.searchLabel}
          </label>
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            id="site-search"
            name="q"
            type="search"
            autoComplete="off"
            placeholder={t.site.searchPlaceholder}
            className="field field-search field-soft"
          />
        </form>

        {/* `ml-auto` och inte `justify-between` på raden: sökrutan försvinner
            under lg, och utan den skulle högergruppen glida in mot mitten. */}
        <div className="ml-auto flex items-center gap-4">
          <nav aria-label={t.site.mainNav} className="hidden items-center gap-4 sm:flex">
            <Link
              href={localePath(locale, "/")}
              aria-current={path === "/" ? "page" : undefined}
              className={`min-h-11 content-center text-sm font-medium ${
                path === "/" ? "text-burp-600" : ""
              }`}
            >
              {t.site.discover}
            </Link>
            <Link
              href={localePath(locale, "/upptack")}
              aria-current={path === "/upptack" ? "page" : undefined}
              className={`min-h-11 content-center text-sm font-medium ${
                path === "/upptack" ? "text-burp-600" : ""
              }`}
            >
              {t.site.map}
            </Link>
          </nav>

          {/* Språkvalet pekar på SAMMA sida i det andra språket, inte på
              startsidan. En växlare som kastar gästen till roten mitt i ett
              besök är värre än ingen växlare. */}
          <nav aria-label={t.site.language} className="flex items-center gap-2">
            {LOCALES.map((entry) => (
              <Link
                key={entry}
                href={localePath(entry, path)}
                hrefLang={entry}
                aria-current={entry === locale ? "true" : undefined}
                className={`label-caps min-h-11 content-center ${
                  entry === locale ? "text-burp-600" : "hover:text-[var(--foreground)]"
                }`}
              >
                {LOCALE_LABELS[entry]}
              </Link>
            ))}
          </nav>

          <Link href="/logga-in" className="link min-h-11 content-center text-sm whitespace-nowrap">
            {t.site.logIn}
          </Link>

          {/*
            Den enda knappen i sidhuvudet, och den pekar på /anslut.

            Sidhuvudet hade tidigare en enda länk — "För restauranger" — som
            gick till inloggningen. Den vände sig alltså till restauranger som
            redan var med. Den som ännu inte är det är den som ska värvas, och
            hen hittade ingen väg in utan att leta i sidfoten.
          */}
          <Link
            href="/anslut"
            className="btn btn-primary btn-pill hidden whitespace-nowrap sm:inline-flex"
          >
            {t.site.becomePartner}
          </Link>
        </div>
      </div>

      {breadcrumbs.length > 0 ? (
        <div className="border-t border-[var(--rule)]">
          <nav
            aria-label={t.site.breadcrumbs}
            className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 px-4 py-2.5 sm:px-6"
          >
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.label} className="flex items-center gap-x-2">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-[var(--rule)]">
                    /
                  </span>
                ) : null}

                {crumb.href ? (
                  <Link href={crumb.href} className="label-caps hover:text-burp-600">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="label-caps text-[var(--foreground)]" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
