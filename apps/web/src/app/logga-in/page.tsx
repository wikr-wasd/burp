import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff, ROLE_HOME } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";
import { SiteHeader } from "@/components/site/site-header";
import { dictionary, requestLocale } from "@/lib/i18n";
import { LoginForm } from "./login-form";

/**
 * Inloggning för restaurangpersonal.
 *
 * Gäster loggar aldrig in här — QR-beställning kräver inget konto alls. Den
 * här sidan är för ägare, chefer, personal och kockar.
 */

/*
 * Läser `Accept-Language` och inte `staff.locale`.
 *
 * Personalytorna läser språket ur personen — men vid inloggningen finns ingen
 * person än. Sidan är dessutom noindex, alltså samma fall som `/konto`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await requestLocale());

  return {
    title: t.auth.loginTitle,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  // Redan inloggad? Skicka vidare direkt i stället för att visa formuläret.
  const staff = await getStaff();
  if (staff) {
    redirect(safeNext(next) ?? ROLE_HOME[staff.role]);
  }

  const locale = await requestLocale();
  const t = dictionary(locale);

  return (
    <>
      <SiteHeader locale={locale} />

      <main className="mx-auto w-full max-w-sm px-6 py-20 sm:py-28">
        <p className="label-caps">{t.auth.loginLabel}</p>
        <h1 className="font-display mt-2 text-4xl">{t.auth.loginTitle}</h1>
        <p className="mt-3 text-[var(--muted)]">{t.auth.loginBody}</p>

        <LoginForm next={safeNext(next)} labels={t.auth} />

        <p className="mt-10 text-sm text-[var(--muted)]">
          {t.auth.guestHint}{" "}
          <Link href="/" className="link">
            {t.auth.guestLink}
          </Link>
          .
        </p>
      </main>
    </>
  );
}

