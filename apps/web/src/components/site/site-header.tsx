import Link from "next/link";

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

export function SiteHeader({ breadcrumbs = [] }: { breadcrumbs?: readonly Breadcrumb[] }) {
  return (
    <header className="border-b border-[var(--rule)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          aria-label="Burp — till startsidan"
          className="font-display text-3xl leading-none text-[var(--foreground)] transition-colors duration-[var(--speed)] hover:text-burp-600"
        >
          Burp
        </Link>

        {/*
          Ingen landsrad här.

          Burp listar inte länder, den listar restauranger. Vilket land en
          restaurang ligger i syns där det spelar roll — i valutan på notan och
          i momsen på menyraden — och är i övrigt gästens minsta bekymmer.
          Rubriker som räknar upp marknader talar om plattformen i stället för
          om maten.
        */}
        <Link href="/logga-in" className="link min-h-11 content-center text-sm">
          För restauranger
        </Link>
      </div>

      {breadcrumbs.length > 0 ? (
        <div className="border-t border-[var(--rule)]">
          <nav
            aria-label="Brödsmulor"
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
