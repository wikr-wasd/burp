import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { needsMfaChallenge } from "@/lib/mfa";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site/site-header";
import { DEFAULT_LOCALE } from "@/lib/i18n";
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

  return (
    <>
      <SiteHeader locale={DEFAULT_LOCALE} />

      <main className="mx-auto w-full max-w-sm px-6 py-20 sm:py-28">
        <p className="label-caps">Steg två</p>
        <h1 className="font-display mt-2 text-4xl">Verifiera</h1>
        <p className="mt-3 text-[var(--muted)]">
          Öppna din autentiseringsapp och skriv in den sexsiffriga koden för Burp.
        </p>

        <ChallengeForm next={safeNext(next)} />

        <p className="mt-10 text-sm text-[var(--muted)]">
          Har du bytt telefon och inte längre tillgång till koden? Kontakta Burp
          — vi kan ta bort din andra faktor, och det loggas.{" "}
          <Link href="/logga-ut" className="link">
            Logga ut
          </Link>
        </p>
      </main>
    </>
  );
}
