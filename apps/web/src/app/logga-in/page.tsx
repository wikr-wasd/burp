import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff, ROLE_HOME } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";
import { SiteHeader } from "@/components/site/site-header";
import { LoginForm } from "./login-form";

/**
 * Inloggning för restaurangpersonal.
 *
 * Gäster loggar aldrig in här — QR-beställning kräver inget konto alls. Den
 * här sidan är för ägare, chefer, personal och kockar.
 */

export const metadata: Metadata = {
  title: "Logga in",
  robots: { index: false, follow: false },
};

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

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-sm px-6 py-20 sm:py-28">
        <p className="label-caps">För restauranger</p>
        <h1 className="font-display mt-2 text-4xl">Logga in</h1>
        <p className="mt-3 text-[var(--muted)]">
          Order, köksskärm, meny och statistik för din restaurang.
        </p>

        <LoginForm next={safeNext(next)} />

        <p className="mt-10 text-sm text-[var(--muted)]">
          Är du gäst? Du behöver inget konto för att beställa —{" "}
          <Link href="/" className="link">
            skanna QR-koden vid bordet
          </Link>
          .
        </p>
      </main>
    </>
  );
}

