import type { Metadata } from "next";
import { holdsTable, parseReservationPolicy } from "@burp/core";
import { StaffShell } from "@/components/staff/staff-shell";
import { BookingBoard, type BookingRow } from "@/components/staff/booking-board";
import { requireStaff } from "@/lib/auth";
import { dictionary, LOCALE_TAGS } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * Dagens bokningar.
 *
 * ── Varför fönstret börjar i går ────────────────────────────────────────────
 *
 * Ett pass som börjar 18:00 och slutar efter midnatt är en kväll, inte två.
 * Skulle listan börja vid dagens första sekund försvinner sällskapet som satte
 * sig 23:30 klockan tolv — mitt under deras måltid.
 *
 * ── Varför karensen räknas här och inte hämtas ──────────────────────────────
 *
 * `holdsTable()` i @burp/core avgör om bokningen fortfarande håller sitt bord.
 * Samma regel finns i `reservation_slots()` (migration 0054), och de två MÅSTE
 * hållas i takt — precis som `loyalty_balance()` och `calculateBalance()`.
 * Att i stället läsa svaret ur databasen hade krävt ett anrop till per rad.
 */

export const metadata: Metadata = {
  title: "Bokningar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Hur långt fram listan visar. En vecka är vad ett pass planeras på. */
const HORIZON_DAYS = 7;

export default async function BookingsPage() {
  const staff = await requireStaff(["owner", "manager", "staff"]);
  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("reservation_policy")
    .eq("id", staff.restaurantId)
    .maybeSingle();

  const policy = parseReservationPolicy(restaurant?.reservation_policy);

  const from = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const until = new Date(Date.now() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  /*
   * RLS avgör vad som syns; filtret på restaurangen står här ändå.
   *
   * `reservations_select_staff` släpper bara igenom den egna restaurangen, men
   * en fråga som förlitar sig på policyn ensam blir fel den dag någon lånar
   * koden till en yta med en bredare policy.
   */
  const { data } = await supabase
    .from("reservations")
    .select(
      "id, starts_at, party_size, guest_name, guest_phone, note, status, seated_at, tables!inner (table_number, zone)",
    )
    .eq("restaurant_id", staff.restaurantId)
    .gte("starts_at", from.toISOString())
    .lte("starts_at", until.toISOString())
    .order("starts_at", { ascending: true });

  const now = new Date();

  const rows: BookingRow[] = (data ?? []).map((row) => {
    const table = row.tables as unknown as { table_number: string; zone: string | null };

    return {
      id: row.id,
      startsAt: row.starts_at as string,
      tableNumber: table.table_number,
      zone: table.zone,
      partySize: row.party_size,
      guestName: row.guest_name,
      guestPhone: row.guest_phone,
      note: row.note,
      status: row.status,
      released: !holdsTable(
        {
          status: row.status,
          startsAt: new Date(row.starts_at as string),
          seatedAt: row.seated_at ? new Date(row.seated_at) : null,
        },
        policy,
        now,
      ),
    };
  });

  const t = dictionary(staff.locale);

  return (
    <StaffShell
      staff={staff}
      current="bokningar"
      title={t.staff.section.bokningar}
      intro={policy.enabled ? t.staff.bookings.intro : t.staff.bookings.disabled}
      width="narrow"
    >
      <BookingBoard
        rows={rows}
        timeZone={staff.timeZone}
        localeTag={LOCALE_TAGS[staff.locale]}
        labels={t.staff.bookings}
        statusLabels={t.booking.status}
      />
    </StaffShell>
  );
}
