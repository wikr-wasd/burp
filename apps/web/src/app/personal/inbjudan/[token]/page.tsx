import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BurpMark } from "@/components/ui/burp-mark";
import { AcceptInvitation } from "@/components/staff/accept-invitation";
import { getGuest } from "@/lib/guest";

/**
 * Den inbjudna löser in sin länk.
 *
 * Ligger utanför `/dashboard` med flit: den som klickar är ännu inte personal,
 * och proxyn hade skickat hen till inloggningen med en `next` som pekar på en
 * yta hon inte får se. Här går det att förklara vad som händer först.
 *
 * Sidan säger inte vilken restaurang inbjudan gäller innan den lösts in. Länken
 * kan ha hamnat fel, och en sida som skyltar med restaurangens namn för den som
 * inte äger adressen ger bort mer än den behöver.
 */

export const metadata: Metadata = {
  title: "Inbjudan",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({ params }: PageProps) {
  const { token } = await params;
  const guest = await getGuest();

  /*
   * Inte inloggad? Då är det inloggningen som saknas, inte inbjudan.
   *
   * `next` tar tillbaka hen hit efteråt, och den som saknar konto hittar
   * "Skapa konto" därifrån. Att lösa in kräver att adressen stämmer, så ett
   * nyskapat konto med fel adress kommer ändå inte in.
   */
  if (!guest) {
    redirect(`/logga-in?next=${encodeURIComponent(`/personal/inbjudan/${token}`)}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <Link href="/" aria-label="Burp — till startsidan">
        <BurpMark size="sm" />
      </Link>

      <h1 className="font-display mt-8 text-4xl">Du har blivit inbjuden</h1>

      <p className="mt-4 text-[var(--muted)]">
        Du är inloggad som <strong>{guest.email}</strong>. Inbjudan gäller bara den adress den
        skickades till — stämmer den inte behöver du logga in med rätt konto.
      </p>

      <AcceptInvitation token={token} />

      {/* Ett formulär får inte ligga i ett stycke — webbläsaren stänger
          stycket åt en och layouten spricker. Därför en rad med två delar. */}
      <div className="mt-8 flex flex-wrap items-baseline gap-1 text-sm text-[var(--muted)]">
        <span>Fel konto?</span>
        <form action="/logga-ut" method="post">
          <button type="submit" className="link underline">
            Logga ut
          </button>
        </form>
        <span>och försök igen.</span>
      </div>
    </main>
  );
}
