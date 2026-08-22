import type { Metadata } from "next";
import Link from "next/link";
import { BurpMark } from "@/components/ui/burp-mark";
import { dictionary, requestLocale } from "@/lib/i18n";

/**
 * Kvittot på att kontot raderades.
 *
 * Egen sida och inte ett meddelande på kontosidan, av den enkla anledningen att
 * kontosidan inte längre går att nå — sessionen är borta och `requireGuest`
 * hade skickat gästen till inloggningen. Att avsluta en radering med ett
 * inloggningsformulär läser som att något gick fel.
 *
 * Sidan kräver ingen inloggning och innehåller ingenting om den som var här.
 *
 * Den renderas per request sedan den fick fem språk. Statisk kan den inte vara:
 * `Accept-Language` är en del av svaret, och en cachad version hade visat det
 * första språket någon råkade komma med till alla efter honom.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await requestLocale());

  return {
    title: t.account.erasedTitle,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function AccountErasedPage() {
  const t = dictionary(await requestLocale());

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <Link href="/" aria-label={t.site.home}>
        <BurpMark size="sm" />
      </Link>

      <h1 className="font-display mt-8 text-4xl">{t.account.erasedTitle}</h1>

      <p className="mt-4 text-[var(--muted)]">{t.account.erasedBody}</p>

      <p className="mt-4 text-[var(--muted)]">{t.account.erasedAgain}</p>

      <Link href="/" className="btn btn-primary mt-8">
        {t.account.toHome}
      </Link>
    </main>
  );
}
