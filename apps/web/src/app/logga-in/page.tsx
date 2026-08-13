import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff, ROLE_HOME } from "@/lib/auth";
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Burp för restauranger</h1>
      <p className="mt-2 text-sm opacity-70">Logga in för att se order och köksskärm.</p>

      <LoginForm next={safeNext(next)} />
    </main>
  );
}

/**
 * Släpper bara igenom interna sökvägar.
 *
 * Utan kontrollen kan `?next=https://angripare.se` göra inloggningssidan till
 * en öppen vidarebefordran, som ser trovärdig ut just för att den ligger på
 * vår domän.
 */
function safeNext(next: string | undefined): string | undefined {
  if (!next) return undefined;
  if (!next.startsWith("/") || next.startsWith("//")) return undefined;
  return next;
}
