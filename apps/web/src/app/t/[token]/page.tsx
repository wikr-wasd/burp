import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveMenu } from "@/lib/menu";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { lookupTable } from "@/lib/table-session";
import { MenuOrder } from "@/components/order/menu-order";

/**
 * QR-landningssidan — burp.se/t/R7K2M9X4TB (avsnitt 4.2).
 *
 * Det här är Burps viktigaste sida. Gästen har precis skannat en dekal, sitter
 * vid ett bord och har ingen app, inget konto och inget tålamod. Sidan är
 * serverrenderad utan klientJS för första vyn av just den anledningen.
 *
 * Flödet:
 *   1. Rate limit på IP  — påhittade koder ska inte vara gratis att prova
 *   2. Verifiera HMAC    — utan databasslagning
 *   3. Slå upp bordet    — restaurang, öppettider, låsning
 *   4. Sätt session      — cookie mot `table_sessions`
 *   5. Visa menyn
 */

export const dynamic = "force-dynamic";

// Sidan får aldrig indexeras. Den är knuten till ett fysiskt bord och skulle i
// en sökträff ge en främling en giltig bordssession.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function TablePage({ params }: PageProps) {
  const { token } = await params;

  const requestHeaders = await headers();
  const limit = rateLimit(`qr:${clientIp(requestHeaders)}`, RATE_LIMITS.qrLookup);
  if (!limit.success) {
    return <TableMessage title="För många försök" body="Vänta en stund och skanna koden igen." />;
  }

  const lookup = await lookupTable(token);

  if (!lookup.ok) {
    // Ogiltig signatur och okänt bord ger avsiktligt samma svar. Skulle de
    // skilja sig kunde sidan användas som orakel för att kartlägga vilka koder
    // som existerar.
    if (lookup.reason === "INVALID_TOKEN" || lookup.reason === "UNKNOWN_TABLE") {
      notFound();
    }

    if (lookup.reason === "TABLE_LOCKED") {
      return (
        <TableMessage
          title="Bordet tar inte emot beställningar"
          body="Prata med personalen så hjälper de dig."
        />
      );
    }

    return (
      <TableMessage
        title="Restaurangen är stängd"
        body="Beställningar går bara att lägga under öppettiderna."
      />
    );
  }

  const { table } = lookup;

  // Ingen bordssession skapas här. Den kräver en cookie-skrivning, och det får
  // bara ske i en route handler — POST /api/orders gör det när gästen faktiskt
  // beställer.
  const menu = await getActiveMenu(table.restaurantId, table.timeZone);

  if (!menu || menu.categories.length === 0) {
    return (
      <TableMessage
        title="Ingen meny just nu"
        body="Restaurangen har inte publicerat någon meny för den här tiden. Prata med personalen."
      />
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <MenuOrder
        menu={menu}
        restaurantName={table.restaurantName}
        currency={table.currency}
        timeZone={table.timeZone}
        context={{
          kind: "TABLE",
          tableToken: token.toUpperCase(),
          tableNumber: table.zone
            ? `${table.tableNumber} · ${table.zone}`
            : table.tableNumber,
        }}
      />
    </main>
  );
}

function TableMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="text-[var(--muted)]">{body}</p>
    </main>
  );
}
