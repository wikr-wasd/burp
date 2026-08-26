import type { Metadata } from "next";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { signTableToken, tableQrUrl } from "@burp/core";
import { EmptyState } from "@/components/ui/empty-state";
import { FloorPlanEditor } from "@/components/staff/floor-plan-editor";
import { StaffShell } from "@/components/staff/staff-shell";
import { TableList } from "@/components/staff/table-list";
import { NewTableForm } from "@/components/staff/new-table-form";
import { requireStaff } from "@/lib/auth";
import { dictionary } from "@/lib/i18n";
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
  /** Bordets egenskaper ur den fasta listan i migration 0054. */
  attributes: string[];
  /** Vad bordet kostar extra att boka, i valutans minsta enhet. */
  surchargeOre: number;
}

export default async function TablesPage() {
  const staff = await requireStaff(["owner", "manager"]);
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("tables")
    .select(
      "id, table_number, zone, capacity, status, qr_public_id, floor_plan_id, pos_x, pos_y, rotation, shape, width, height, attributes, surcharge_ore",
    )
    .eq("restaurant_id", staff.restaurantId)
    .neq("status", "ARCHIVED")
    .order("table_number", { ascending: true });

  const { data: floorPlans } = await supabase
    .from("floor_plans")
    .select("id, name, width, height")
    .eq("restaurant_id", staff.restaurantId)
    .order("sort_order", { ascending: true });

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
        attributes: row.attributes ?? [],
        surchargeOre: row.surcharge_ore ?? 0,
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

  const t = dictionary(staff.locale).staff;

  return (
    <StaffShell
      staff={staff}
      current="bord"
      title={t.tables.title}
      intro={t.tables.intro}
      width="narrow"
    >
      <NewTableForm labels={t.tables} />

      {tables.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={QrCode}
            title={t.tables.emptyTitle}
            body={t.tables.emptyBody}
          />
        </div>
      ) : (
        <TableList
          tables={tables}
          labels={t.tables}
          currency={staff.currency}
          attributeLabels={dictionary(staff.locale).booking.attribute}
          tableLabel={t.orderType.table}
          openBillLabel={t.overview.stateOPPEN_NOTA}
        />
      )}

      {/*
        Planritningen kommer efter listan, inte före.

        Listan är det som måste fungera: varje bord behöver en QR-kod, och den
        som just lagt till ett bord ska se koden direkt. Ritningen är det som
        gör Översikten begriplig, och den byggs när borden finns.
      */}
      {tables.length > 0 ? (
        <section className="mt-14 border-t border-[var(--rule)] pt-10">
          <h2 className="font-display text-2xl">{t.tables.planTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.tables.planHint}
          </p>

          <FloorPlanEditor
            labels={t.tables}
            plans={(floorPlans ?? []).map((plan) => ({
              id: plan.id,
              name: plan.name,
              width: plan.width,
              height: plan.height,
            }))}
            tables={(rows ?? []).map((row) => ({
              id: row.id,
              tableNumber: row.table_number,
              zone: row.zone,
              capacity: row.capacity,
              floorPlanId: row.floor_plan_id,
              x: row.pos_x,
              y: row.pos_y,
              rotation: row.rotation,
              shape: row.shape as "ROUND" | "SQUARE" | "RECT",
              width: row.width,
              height: row.height,
            }))}
          />
        </section>
      ) : null}
    </StaffShell>
  );
}
