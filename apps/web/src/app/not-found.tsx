import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { DEFAULT_LOCALE, dictionary, localePath, LOCALES, LOCALE_SHORT_LABELS } from "@/lib/i18n";

/**
 * 404 för hela sajten.
 *
 * Utan den här möts gästen av Next:s standardsida — svartvit, på engelska och
 * utan en enda länk vidare. Den ser inte ut som saknat innehåll utan som en
 * trasig sajt.
 *
 * VIKTIGT: sidan är avsiktligt statisk. Ingen `headers()`, ingen databas.
 *
 * Första versionen läste Accept-Language för språket och renderade sidfoten,
 * som frågar databasen efter städer. Båda gör svaret dynamiskt, och då hinner
 * Next skicka statusraden innan sidan är klar — svaret blev **200**. En 404
 * som svarar 200 är värre än ingen 404 alls: Google indexerar den som riktigt
 * innehåll, och varje felstavad adress blir en tunn sida i sökresultaten.
 * Röktestet fångade det direkt.
 *
 * Priset är att språket inte kan väljas — sidan vet inte vem som kom.
 *
 * Med två språk stod båda utskrivna i sin helhet. Med fem blir det fem stycken
 * text om samma sak, och en vägg av upprepning hjälper ingen. Sidan säger det
 * därför en gång på standardspråket, upprepar RUBRIKEN kort på de andra så att
 * en tysk gäst känner igen sig, och lämnar vägen vidare till språkraden.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader locale={DEFAULT_LOCALE} />

      <main className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6 sm:py-32">
        <p className="label-caps">404</p>

        <h1 lang={DEFAULT_LOCALE} className="font-display mt-3 text-5xl sm:text-6xl">
          {dictionary(DEFAULT_LOCALE).errors.notFoundTitle}
        </h1>
        <p
          lang={DEFAULT_LOCALE}
          className="mx-auto mt-4 max-w-md leading-relaxed text-[var(--muted)]"
        >
          {dictionary(DEFAULT_LOCALE).errors.notFoundBody}
        </p>

        {/* Samma besked, kort, på de andra språken. Tillräckligt för att en
            gäst ska förstå att sidan saknas och inte att sajten är trasig. */}
        <p className="mx-auto mt-8 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
          {LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map((locale, index) => (
            <span key={locale} lang={locale}>
              {index > 0 ? " · " : ""}
              {dictionary(locale).errors.notFoundTitle}
            </span>
          ))}
        </p>

        <div className="mt-10">
          <Link href={localePath(DEFAULT_LOCALE, "/")} className="btn btn-primary">
            {dictionary(DEFAULT_LOCALE).errors.notFoundAction}
          </Link>
        </div>

        {/* Språkraden är också vägen vidare: varje namn leder till startsidan
            på det språket. Fem knappar som alla betyder "gå hem" hade sagt
            mindre och tagit mer plats. */}
        <nav
          aria-label={dictionary(DEFAULT_LOCALE).site.language}
          className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2"
        >
          {LOCALES.map((locale) => (
            <Link
              key={locale}
              href={localePath(locale, "/")}
              hrefLang={locale}
              lang={locale}
              className={`label-caps ${
                locale === DEFAULT_LOCALE ? "text-burp-600" : "hover:text-[var(--foreground)]"
              }`}
            >
              {LOCALE_SHORT_LABELS[locale]}
            </Link>
          ))}
        </nav>
      </main>
    </>
  );
}
