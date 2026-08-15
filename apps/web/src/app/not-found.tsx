import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { DEFAULT_LOCALE, dictionary, localePath, LOCALES } from "@/lib/i18n";

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
 * Priset är att språket inte kan väljas. Sidan visar därför båda — vilket ändå
 * är rimligare här än någon annanstans, eftersom en trasig adress lika gärna
 * kan ha nåtts av en gäst som aldrig valt språk.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader locale={DEFAULT_LOCALE} />

      <main className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6 sm:py-32">
        <p className="label-caps">404</p>

        {LOCALES.map((locale, index) => {
          const t = dictionary(locale);

          return (
            <div key={locale} className={index === 0 ? "mt-3" : "mt-10"}>
              <h1
                lang={locale}
                className={
                  index === 0
                    ? "font-display text-5xl sm:text-6xl"
                    : "font-display text-3xl text-[var(--muted)]"
                }
              >
                {t.errors.notFoundTitle}
              </h1>
              <p
                lang={locale}
                className="mx-auto mt-4 max-w-md leading-relaxed text-[var(--muted)]"
              >
                {t.errors.notFoundBody}
              </p>
            </div>
          );
        })}

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {LOCALES.map((locale) => (
            <Link
              key={locale}
              href={localePath(locale, "/")}
              hrefLang={locale}
              className={locale === DEFAULT_LOCALE ? "btn btn-primary" : "btn btn-secondary"}
            >
              {dictionary(locale).errors.notFoundAction}
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
