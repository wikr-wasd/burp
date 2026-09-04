import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { needsMfaChallenge } from "@/lib/mfa";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site/site-header";
import { dictionary, requestLocale } from "@/lib/i18n";
import { ChallengeForm } from "./challenge-form";

/**
 * Steg två i inloggningen: engångskoden.
 *
 * Svensk som `/logga-in`, och av samma skäl: här finns ännu ingen person att
 * hämta ett språk ur. `staff.locale` ligger bakom en rad som RLS döljer så
 * länge sessionen står på aal1 — att slå upp den här hade varit att fråga
 * databasen om något den med flit inte svarar på.
 */

export const metadata: Metadata = {
  title: "Verifiera",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function ChallengePage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Utloggad hör hemma i formuläret, inte här.
  if (!user) redirect("/logga-in");

  /*
   * Ingen kod att vänta på? Skicka vidare.
   *
   * Fångar två fall: den som redan matat in koden och backar hit, och den som
   * aldrig registrerat någon faktor men fått adressen på något annat sätt. Att
   * visa ett kodfält för någon som inte har en app hade varit en återvändsgränd
   * utan förklaring.
   */
  if (!(await needsMfaChallenge())) redirect(safeNext(next) ?? "/dashboard");

  /*
   * Språket läses som på inloggningssidan: gästens val först,
   * `Accept-Language` sedan. Personens `staff.locale` finns i databasen men
   * hämtas INTE här — sessionen är ännu inte uppgraderad till aal2, och en
   * fråga mot `staff` i det läget är en fråga vi inte ska behöva ställa för
   * att kunna skriva ut "Steg två".
   */
  const t = dictionary(await requestLocale()).staff.settings;
  const locale = await requestLocale();

  return (
    <>
      <SiteHeader locale={locale} />

      <main className="mx-auto w-full max-w-sm px-6 py-20 sm:py-28">
        <p className="label-caps">{t.challengeStep}</p>
        <h1 className="font-display mt-2 text-4xl">{t.challengeTitle}</h1>
        <p className="mt-3 text-[var(--muted)]">{t.challengeIntro}</p>

        <ChallengeForm next={safeNext(next)} labels={t} />

        <p className="mt-10 text-sm text-[var(--muted)]">
          {t.challengeLost}{" "}
          <Link href="/logga-ut" className="link">
            {t.challengeLogOut}
          </Link>
        </p>
      </main>
    </>
  );
}
