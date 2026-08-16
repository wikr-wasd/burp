import type { Metadata } from "next";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { signTableToken, tableQrUrl } from "@burp/core";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffHeader } from "@/components/staff/staff-header";
import { TableList } from "@/components/staff/table-list";
import { NewTableForm } from "@/components/staff/new-table-form";
import { requireStaff } from "@/lib/auth";
import { publicEnv, serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Bord och QR-koder (avsnitt 11).
 *
 * QR-koderna renderas som SVG på servern. Det ger tre saker: skarp utskrift i
 * valfri storlek, ingenting som behöver laddas från ett CDN, och en signatur
 * som aldrig lämnar servern i annan form än den färdiga bilden.
 */

export const metadata: Metadata = {
  title: "Bord",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface TableWithQr {
  id: string;
  tableNumber: string;
  zone: string | null;
  capacity: number | null;
  status: string;
  url: string;
  qrSvg: string;
  hasOpenSession: boolean;
}

export default async function TablesPage() {
  const staff = await requireStaff(["owner", "manager"]);
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("tables")
    .select("id, table_number, zone, capacity, status, qr_public_id")
    .eq("restaurant_id", staff.restaurantId)
    .neq("status", "ARCHIVED")
    .order("table_number", { ascending: true });

  const { data: openSessions } = await supabase
    .from("table_sessions")
    .select("table_id")
    .eq("restaurant_id", staff.restaurantId)
    .eq("status", "OPEN");

  const openTableIds = new Set((openSessions ?? []).map((session) => session.table_id));
  const secret = serverEnv().QR_TOKEN_SECRET;

  const tables: TableWithQr[] = await Promise.all(
    (rows ?? []).map(async (row) => {
      const token = await signTableToken(row.qr_public_id, secret);
      const url = tableQrUrl(token, publicEnv.NEXT_PUBLIC_SITE_URL);

      return {
        id: row.id,
        tableNumber: row.table_number,
        zone: row.zone,
        capacity: row.capacity,
        status: row.status,
        url,
        qrSvg: await QRCode.toString(url, {
          type: "svg",
          margin: 1,
          // Hög felkorrigering: dekalen ska fungera även repad eller med en
          // fläck på. Kostar täthet men koden är kort nog att ha råd med det.
          errorCorrectionLevel: "H",
        }),
        hasOpenSession: openTableIds.has(row.id),
      };
    }),
  );

  return (
    <>
      <StaffHeader staff={staff} current="bord" />

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="font-display text-4xl">Bord och QR-koder</h1>
        <p className="mt-1 text-sm opacity-70">
          Skriv ut koden och sätt den på bordet. Koden är statisk och behöver aldrig bytas.
        </p>

        <NewTableForm />

        {tables.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={QrCode}
              title="Inga bord ännu"
              body="Lägg till det första ovan. Varje bord får en egen QR-kod att skriva ut och sätta på bordet."
            />
          </div>
        ) : (
          <TableList tables={tables} />
        )}
      </main>
    </>
  );
}
