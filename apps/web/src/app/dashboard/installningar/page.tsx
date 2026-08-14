import type { Metadata } from "next";
import {
  parseOpeningHours,
  parseOrderPolicy,
  type OpeningHours,
  type OrderPolicy,
  type StaffRole,
} from "@burp/core";
import { StaffHeader } from "@/components/staff/staff-header";
import { OpeningHoursEditor } from "@/components/staff/opening-hours-editor";
import { OrderPolicyEditor } from "@/components/staff/order-policy-editor";
import { StaffManager } from "@/components/staff/staff-manager";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Restaurangens inställningar (avsnitt 11).
 *
 * Öppettider och orderregler ligger här därför att de avgör om gäster kan
 * beställa alls. En restaurang som inte kan ändra sina egna öppettider kan
 * inte drivas.
 */

export const metadata: Metadata = {
  title: "Inställningar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface StaffMember {
  id: string;
  userId: string;
  email: string | null;
  fullName: string | null;
  role: StaffRole;
  isActive: boolean;
  isSelf: boolean;
}

export default async function SettingsPage() {
  const staff = await requireStaff(["owner", "manager"]);
  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("opening_hours, order_policy")
    .eq("id", staff.restaurantId)
    .single();

  const hours: OpeningHours = parseOpeningHours(restaurant?.opening_hours);
  const policy: OrderPolicy = parseOrderPolicy(restaurant?.order_policy);

  const { data: staffRows } = await supabase
    .from("staff")
    .select("id, user_id, role, is_active")
    .eq("restaurant_id", staff.restaurantId)
    .order("created_at", { ascending: true });

  /*
   * E-postadresserna ligger i `auth.users`, som RLS inte når. Admin-klienten
   * används enbart för att slå upp namn och adress för personer som redan
   * finns i den här restaurangens personallista — listan i sig kommer från
   * den RLS-skyddade frågan ovan, så ingen extra data exponeras.
   */
  const profileIds = (staffRows ?? []).map((row) => row.user_id);
  const contacts = new Map<string, { email: string | null; fullName: string | null }>();

  if (profileIds.length > 0) {
    const adminClient = createAdminClient();
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .in("id", profileIds);

    for (const profile of profiles ?? []) {
      contacts.set(profile.id, { email: profile.email, fullName: profile.full_name });
    }
  }

  const members: StaffMember[] = (staffRows ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: contacts.get(row.user_id)?.email ?? null,
    fullName: contacts.get(row.user_id)?.fullName ?? null,
    role: row.role as StaffRole,
    isActive: row.is_active,
    isSelf: row.user_id === staff.userId,
  }));

  return (
    <>
      <StaffHeader staff={staff} current="dashboard" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold">Inställningar</h1>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Öppettider</h2>
          <p className="mt-1 text-sm opacity-70">
            Gäster kan bara beställa när ni är öppna. Flera pass per dag för lunch och kväll.
            Pass över midnatt stöds inte än.
          </p>
          <OpeningHoursEditor initial={hours} />
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-semibold">Orderregler</h2>
          <p className="mt-1 text-sm opacity-70">
            Vad gästen får ändra efter att beställningen lagts, och hur länge.
          </p>
          <OrderPolicyEditor initial={policy} />
        </section>

        {staff.role === "owner" ? (
          <section className="mt-12">
            <h2 className="text-lg font-semibold">Personal</h2>
            <p className="mt-1 text-sm opacity-70">
              Ägare ser allt. Chef sköter drift och meny. Personal tar order och bord. Kock ser
              bara köksskärmen.
            </p>
            <StaffManager members={members} />
          </section>
        ) : (
          <section className="mt-12">
            <h2 className="text-lg font-semibold">Personal</h2>
            <p className="mt-1 text-sm opacity-70">
              Bara ägaren kan bjuda in och ändra roller.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
