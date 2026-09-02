import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { dictionary, requestLocale } from "@/lib/i18n";
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

/*
 * Sidan läser `Accept-Language`, som `/konto` och QR-sidan, och är därför
 * noindex.
 *
 * Den var indexerad utan språk i adressen, vilket är den kombination CLAUDE.md
 * varnar för: Google indexerar en URL och inte en cookie, så bara en
 * språkversion hade kunnat nå sökresultaten. Alternativet vore att flytta
 * sidan under `[locale]`, men ingen letar efter "skapa konto" i en sökmotor —
 * hit kommer man från sidfoten och från /anslut.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await requestLocale());

  return {
    title: t.auth.signUpTitle,
    robots: { index: false, follow: true },
  };
}

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignUpPage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  const guest = await getGuest();
  if (guest) redirect(safeNext(next) ?? "/konto");

  const locale = await requestLocale();
  const t = dictionary(locale);

  return (
    <>
      <SiteHeader locale={locale} />

      <main className="mx-auto w-full max-w-sm px-6 py-20 sm:py-28">
        <p className="label-caps">{t.auth.signUpLabel}</p>
        <h1 className="font-display mt-2 text-4xl">{t.auth.signUpTitle}</h1>
        <p className="mt-3 text-[var(--muted)]">{t.auth.signUpBody}</p>

        <SignUpForm next={safeNext(next)} labels={t.auth} />

        <p className="mt-10 text-sm text-[var(--muted)]">
          {t.auth.haveAccount}{" "}
          <Link href="/logga-in" className="link">
            {t.auth.loginTitle}
          </Link>
        </p>
      </main>
    </>
  );
}
