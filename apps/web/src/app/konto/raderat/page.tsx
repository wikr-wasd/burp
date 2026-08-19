import type { Metadata } from "next";
import Link from "next/link";
import { BurpMark } from "@/components/ui/burp-mark";

/**
 * Kvittot på att kontot raderades.
 *
 * Egen sida och inte ett meddelande på kontosidan, av den enkla anledningen att
 * kontosidan inte längre går att nå — sessionen är borta och `requireGuest`
 * hade skickat gästen till inloggningen. Att avsluta en radering med ett
 * inloggningsformulär läser som att något gick fel.
 *
 * Sidan kräver ingen inloggning och innehåller ingenting om den som var här.
 */

export const metadata: Metadata = {
  title: "Kontot är raderat",
  robots: { index: false, follow: false },
};

export default function AccountErasedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <Link href="/" aria-label="Burp — till startsidan">
        <BurpMark size="sm" />
      </Link>

      <h1 className="font-display mt-8 text-4xl">Kontot är raderat</h1>

      <p className="mt-4 text-[var(--muted)]">
        Din profil, dina adresser och dina favoriter är borta, och ingenting hos oss pekar längre
        ut dig. Beställningarna finns kvar hos restaurangerna som bokföringsunderlag, utan
        koppling till dig.
      </p>

      <p className="mt-4 text-[var(--muted)]">
        Du kan beställa igen när du vill — vid bordet behövs inget konto alls.
      </p>

      <Link href="/" className="btn btn-primary mt-8">
        Till startsidan
      </Link>
    </main>
  );
}
