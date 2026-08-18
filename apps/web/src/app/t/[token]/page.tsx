import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getActiveMenu } from "@/lib/menu";
import { cardOptionFor } from "@/lib/payments";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { lookupTable } from "@/lib/table-session";
import { MenuOrder } from "@/components/order/menu-order";
import { dictionary, requestLocale } from "@/lib/i18n";

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

  /*
   * Språket kommer från gästens telefon, inte från adressen.
   *
   * Sidan är noindex och ska aldrig hamna i en sökträff, så den behöver ingen
   * egen URL per språk. Och QR-beställning används av turister — en
   * engelsktalande gäst i Sarajevo ska inte mötas av svenska för att
   * produkten råkar vara byggd i Sverige.
   */
  const t = dictionary(await requestLocale());

  const requestHeaders = await headers();
  const limit = rateLimit(`qr:${clientIp(requestHeaders)}`, RATE_LIMITS.qrLookup);
  if (!limit.success) {
    return <TableMessage title={t.table.tooManyTitle} body={t.table.tooManyBody} />;
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
        <TableMessage title={t.table.lockedTitle} body={t.table.lockedBody} />
      );
    }

    return (
      <TableMessage title={t.table.closedTitle} body={t.table.closedBody} />
    );
  }

  const { table } = lookup;

  // Ingen bordssession skapas här. Den kräver en cookie-skrivning, och det får
  // bara ske i en route handler — POST /api/orders gör det när gästen faktiskt
  // beställer.
  const menu = await getActiveMenu(table.restaurantId, table.timeZone);

  // Kortknappen visas bara när restaurangen faktiskt kan ta emot ett kort.
  // Null är inte ett felläge — det är läget i Bosnien och Serbien tills ett
  // lokalt avtal finns, och kontantflödet fungerar hela vägen.
  const card = await cardOptionFor(table.restaurantId);

  if (!menu || menu.categories.length === 0) {
    return (
      <TableMessage title={t.table.noMenuTitle} body={t.table.noMenuBody} />
    );
  }

  return (
    /*
     * `.theme-table` — den enda ytan som följer telefonens mörka läge.
     *
     * Gästen sitter vid ett bord på kvällen, ofta i en mörk lokal. En vit
     * skärm i ansiktet där är inte en detalj utan hela upplevelsen. Resten av
     * produkten är alltid papper; se globals.css och öppen fråga 9.
     */
    <div className="theme-table">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <MenuOrder
          menu={menu}
          restaurantName={table.restaurantName}
          labels={t.menu}
          currency={table.currency}
          timeZone={table.timeZone}
          card={card}
          context={{
            kind: "TABLE",
            tableToken: token.toUpperCase(),
            tableNumber: table.zone
              ? `${table.tableNumber} · ${table.zone}`
              : table.tableNumber,
          }}
        />
      </main>
    </div>
  );
}

function TableMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="theme-table">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="text-[var(--muted)]">{body}</p>
      </main>
    </div>
  );
}
