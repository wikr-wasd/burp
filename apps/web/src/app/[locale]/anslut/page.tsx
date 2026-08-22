import type { Metadata } from "next";
import Link from "next/link";
import { ApplicationForm } from "@/components/site/application-form";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { dictionary, isLocale, localePath, type Locale } from "@/lib/i18n";
import { getGuest } from "@/lib/guest";

/**
 * Anslut din restaurang.
 *
 * Låg utanför språksegmentet fram till 2026-08-22, med motiveringen att sidan
 * vänder sig till en restaurangägare och att personalytorna är svenska. Det
 * var fel slutsats av ett riktigt skäl: den som läser den här sidan är ännu
 * INTE personal någonstans. Hon är en restauratör i Sarajevo, Zagreb eller
 * Belgrad som aldrig hört talas om Burp, och det här är den enda vägen in.
 *
 * Ett svenskt formulär fylls inte i av henne. Och till skillnad från kvittona
 * räcker inte `Accept-Language`: sidan är indexerad och länkad från varje
 * sidfot, så den behöver en egen adress per språk för att kunna hittas på
 * rätt språk i en sökning. Det är hela skälet till att språket ligger i URL:en
 * och inte i en cookie.
 *
 * `/anslut` utan prefix finns kvar och skickar vidare på `Accept-Language`.
 */

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);

  return {
    title: t.join.metaTitle,
    description: t.join.metaDescription,
    alternates: { canonical: localePath(locale, "/anslut") },
    openGraph: {
      title: `${t.join.metaTitle} | Burp`,
      description: t.join.metaDescription,
      url: localePath(locale, "/anslut"),
      type: "website",
    },
  };
}

// Sidan visar olika saker för den som är inloggad och den som inte är det.
// Cachad hade den visat "skapa ett konto först" för någon som just gjort det.
export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: PageProps) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "sv";
  const t = dictionary(locale);

  const guest = await getGuest();

  // Vart inloggningen ska skicka tillbaka. Prefixet måste med — annars tappar
  // hon språket i samma sekund som hon loggar in, mitt i en ansökan.
  const back = encodeURIComponent(localePath(locale, "/anslut"));

  return (
    <>
      <SiteHeader locale={locale} path="/anslut" />

      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <p className="label-caps">{t.join.eyebrow}</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">{t.join.title}</h1>

        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
          {t.join.intro}
        </p>

        {guest ? (
          <ApplicationForm locale={locale} texts={t.join} countryNames={t.country} />
        ) : (
          /*
           * Ansökan kräver ett konto, och det ska sägas innan formuläret —
           * inte efter att någon fyllt i tolv fält. Kontot är det som blir
           * ägare till restaurangen och det Burp svarar på.
           */
          <div className="card mt-8 p-6">
            <h2 className="font-display text-2xl">{t.join.accountTitle}</h2>
            <p className="mt-3 text-[var(--muted)]">{t.join.accountBody}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/skapa-konto?next=${back}`} className="btn btn-primary">
                {t.join.createAccount}
              </Link>
              <Link href={`/logga-in?next=${back}`} className="btn btn-secondary">
                {t.join.haveAccount}
              </Link>
            </div>
          </div>
        )}
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
