import type { Metadata } from "next";
import { Download } from "lucide-react";
import { GuestHeader } from "@/components/guest/guest-header";
import { DeleteAccount } from "@/components/guest/delete-account";
import { requireGuest } from "@/lib/guest";
import { dictionary, requestLocale } from "@/lib/i18n";

/**
 * Mina uppgifter — kopia och radering (GDPR artikel 15, 17 och 20).
 *
 * Två saker på samma sida, och det är avsiktligt: den som funderar på att
 * radera sitt konto ska se att det går att ta med sig uppgifterna först. Att
 * gömma exporten någon annanstans hade gjort valet mellan att stanna och att
 * förlora sin historik.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await requestLocale());

  return {
    title: t.account.details,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const guest = await requireGuest("/konto/uppgifter");
  const t = dictionary(await requestLocale());

  return (
    <>
      <GuestHeader
        guest={guest}
        current="uppgifter"
        texts={t.account}
        homeLabel={t.site.home}
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="label-caps">{t.account.label}</p>
        <h1 className="font-display mt-2 text-4xl">{t.account.details}</h1>

        <section className="mt-8">
          <h2 className="font-display text-2xl">{t.account.exportTitle}</h2>
          <p className="mt-2 text-[var(--muted)]">{t.account.exportBody}</p>

          {/*
            Vanlig länk och inget formulär. Nedladdningen är en GET som inte
            ändrar någonting, och en länk går att högerklicka, spara och öppna i
            en ny flik — vilket är precis vad man vill göra med en fil.
          */}
          <a href="/api/konto/export" download className="btn btn-secondary mt-4">
            <Download size={16} aria-hidden="true" />
            {t.account.exportButton}
          </a>
        </section>

        <section className="mt-10 border-t border-[var(--rule)] pt-8">
          <h2 className="font-display text-2xl">{t.account.deleteTitle}</h2>
          <p className="mt-2 text-[var(--muted)]">{t.account.deleteBody}</p>

          {/*
            Undantaget sägs rakt ut, före knappen.

            Det är den vanligaste missuppfattningen om radering, och en gäst som
            upptäcker efteråt att beställningarna finns kvar har all rätt att bli
            arg. Att de gör det beror inte på att vi vill behålla dem — kvitton
            och moms måste sparas enligt lag — och det som står kvar går inte
            längre att koppla till dig.
          */}
          <div className="card mt-4 p-4 text-sm">
            <p className="font-medium">{t.account.remainsTitle}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
              <li>{t.account.remainsOrders}</li>
              <li>{t.account.remainsRatings}</li>
              <li>{t.account.remainsPoints}</li>
            </ul>
          </div>

          <DeleteAccount texts={t.account} />
        </section>
      </main>
    </>
  );
}
