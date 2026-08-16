import type { Metadata } from "next";
import Link from "next/link";
import { ApplicationForm } from "@/components/site/application-form";
import { SiteHeader } from "@/components/site/site-header";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { getGuest } from "@/lib/guest";

/**
 * Anslut din restaurang.
 *
 * Ligger utanför språksegmentet med flit. Sidan vänder sig till en
 * restaurangägare, inte till en gäst, och personalytorna är svenska — se
 * CLAUDE.md. Att prefixa den hade gett två adresser för samma svenska sida.
 *
 * Sidan indexeras däremot: den är hur restauranger hittar hit, och en
 * marknadsplats som inte går att hitta som restaurang växer inte.
 */

export const metadata: Metadata = {
  title: "Anslut din restaurang",
  description:
    "Ta emot beställningar via QR-kod vid bordet och för avhämtning. Egen sida med meny, bilder, öppettider och vägbeskrivning.",
  alternates: { canonical: "/anslut" },
};

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const guest = await getGuest();

  return (
    <>
      <SiteHeader locale={DEFAULT_LOCALE} />

      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <p className="label-caps">För restauranger</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">
          Anslut din restaurang
        </h1>

        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
          Egen sida med meny, bilder, öppettider och vägbeskrivning — och
          beställning direkt från bordet med en QR-kod. Gästen behöver varken
          app eller konto.
        </p>

        {guest ? (
          <ApplicationForm />
        ) : (
          /*
           * Ansökan kräver ett konto, och det ska sägas innan formuläret —
           * inte efter att någon fyllt i tolv fält. Kontot är det som blir
           * ägare till restaurangen och det Burp svarar på.
           */
          <div className="card mt-8 p-6">
            <h2 className="font-display text-2xl">Skapa ett konto först</h2>
            <p className="mt-3 text-[var(--muted)]">
              Kontot blir ägare till restaurangen och är det vi svarar på. Det
              tar en halv minut.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/skapa-konto?next=%2Fanslut" className="btn btn-primary">
                Skapa konto
              </Link>
              <Link href="/logga-in?next=%2Fanslut" className="btn btn-secondary">
                Jag har redan ett
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
