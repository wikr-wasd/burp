import Link from "next/link";

/**
 * Startsidan. Placeholder tills Fas 1:s stadsvy och restauranglista finns
 * (byggordningen i docs/ARCHITECTURE.md avsnitt 13).
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-5xl font-bold tracking-tight">Burp</h1>
        <p className="mt-3 text-lg opacity-70">
          Matmarknadsplats och beställning vid bordet.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="font-semibold">Fas 1 pågår</h2>
        <p className="mt-2 text-sm opacity-70">
          Datamodell, avgiftsberäkning och QR-flödet finns på plats. Meny, kassa och dashboard
          byggs härnäst.
        </p>
        <Link
          href="/api/health"
          className="mt-4 inline-block text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
        >
          Systemstatus
        </Link>
      </section>
    </main>
  );
}
