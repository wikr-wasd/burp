import type { Metadata } from "next";
import { Download } from "lucide-react";
import { GuestHeader } from "@/components/guest/guest-header";
import { DeleteAccount } from "@/components/guest/delete-account";
import { requireGuest } from "@/lib/guest";

/**
 * Mina uppgifter — kopia och radering (GDPR artikel 15, 17 och 20).
 *
 * Två saker på samma sida, och det är avsiktligt: den som funderar på att
 * radera sitt konto ska se att det går att ta med sig uppgifterna först. Att
 * gömma exporten någon annanstans hade gjort valet mellan att stanna och att
 * förlora sin historik.
 */

export const metadata: Metadata = {
  title: "Mina uppgifter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const guest = await requireGuest("/konto/uppgifter");

  return (
    <>
      <GuestHeader guest={guest} current="uppgifter" />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="label-caps">Mitt konto</p>
        <h1 className="font-display mt-2 text-4xl">Mina uppgifter</h1>

        <section className="mt-8">
          <h2 className="font-display text-2xl">Hämta en kopia</h2>
          <p className="mt-2 text-[var(--muted)]">
            Allt Burp har om dig i en fil: ditt konto, dina adresser, alla beställningar med
            rader, dina omdömen, favoriter, poäng, kuponger och klippkort. Filen är JSON och går
            att läsa både av dig och av ett annat program.
          </p>

          {/*
            Vanlig länk och inget formulär. Nedladdningen är en GET som inte
            ändrar någonting, och en länk går att högerklicka, spara och öppna i
            en ny flik — vilket är precis vad man vill göra med en fil.
          */}
          <a href="/api/konto/export" download className="btn btn-secondary mt-4">
            <Download size={16} aria-hidden="true" />
            Hämta mina uppgifter
          </a>
        </section>

        <section className="mt-10 border-t border-[var(--rule)] pt-8">
          <h2 className="font-display text-2xl">Radera mitt konto</h2>
          <p className="mt-2 text-[var(--muted)]">
            Ditt konto, din profil, dina adresser och dina favoriter tas bort. Det går inte att
            ångra.
          </p>

          {/*
            Undantaget sägs rakt ut, före knappen.

            Det är den vanligaste missuppfattningen om radering, och en gäst som
            upptäcker efteråt att beställningarna finns kvar har all rätt att bli
            arg. Att de gör det beror inte på att vi vill behålla dem — kvitton
            och moms måste sparas enligt lag — och det som står kvar går inte
            längre att koppla till dig.
          */}
          <div className="card mt-4 p-4 text-sm">
            <p className="font-medium">Det här står kvar, utan dig</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
              <li>
                Dina beställningar och kvitton, som bokföringsunderlag hos restaurangen. De
                slutar peka på dig.
              </li>
              <li>
                Betygen du satt. Texten du skrev och bilden du laddade upp tas bort; siffran
                står kvar utan avsändare.
              </li>
              <li>Dina poäng och klippkort försvinner — de går inte att använda av någon.</li>
            </ul>
          </div>

          <DeleteAccount />
        </section>
      </main>
    </>
  );
}
