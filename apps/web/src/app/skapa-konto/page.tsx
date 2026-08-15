import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { redirect } from "next/navigation";
import { getGuest } from "@/lib/guest";
import { safeNext } from "@/lib/safe-redirect";
import { SignUpForm } from "./signup-form";

/**
 * Registrering för gäster.
 *
 * Ett konto krävs aldrig för att beställa — QR-flödet vid bordet och
 * avhämtning fungerar anonymt, och det är avsiktligt (avsnitt 4). Kontot ger
 * beställningshistorik, favoriter, sparade adresser och lojalitetspoäng.
 *
 * Restaurangpersonal registrerar sig inte här. Deras konton skapas av Burp vid
 * onboarding, eftersom en rad i `staff` avgör åtkomsten och den ska inte gå
 * att skaffa själv.
 */

export const metadata: Metadata = {
  title: "Skapa konto",
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignUpPage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  const guest = await getGuest();
  if (guest) redirect(safeNext(next) ?? "/konto");

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-sm px-6 py-20 sm:py-28">
        <p className="label-caps">Gästkonto</p>
        <h1 className="font-display mt-2 text-4xl">Skapa konto</h1>
        <p className="mt-3 text-[var(--muted)]">
          Spara dina beställningar, favoriter och adresser. Du kan beställa utan konto också.
        </p>

        <SignUpForm next={safeNext(next)} />

        <p className="mt-10 text-sm text-[var(--muted)]">
          Har du redan ett konto?{" "}
          <Link href="/logga-in" className="link">
            Logga in
          </Link>
        </p>
      </main>
    </>
  );
}
