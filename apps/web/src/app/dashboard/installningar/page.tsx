import type { Metadata } from "next";
import {
  parseOpeningHours,
  parseOrderPolicy,
  type CurrencyCode,
  type OpeningHours,
  type OrderPolicy,
  type StaffRole,
} from "@burp/core";
import { StaffShell } from "@/components/staff/staff-shell";
import {
  CardPaymentSettings,
  type AccountStatus,
} from "@/components/staff/card-payment-settings";
import { OpeningHoursEditor } from "@/components/staff/opening-hours-editor";
import { PresentationEditor } from "@/components/staff/presentation-editor";
import { OrderPolicyEditor } from "@/components/staff/order-policy-editor";
import { PunchCardEditor } from "@/components/staff/punch-card-editor";
import { StaffManager } from "@/components/staff/staff-manager";
import { requireStaff } from "@/lib/auth";
import { connectableProviders, getPaymentAccounts } from "@/lib/payments";
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
    // En enda literal, inte en hopslagen sträng: Supabase härleder radtypen ur
    // select-uttrycket, och en konkatenering ger `GenericStringError` i stället
    // för kolumnerna.
    .select(
      "opening_hours, order_policy, description, phone, cuisines, price_tier, street_address, postal_code, city, city_slug, slug, latitude, longitude, hero_image_url, punch_card_size, punch_card_max_reward_ore",
    )
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

  /*
   * Betalkontot.
   *
   * Läses med service role därför att `restaurant_payment_accounts` skrivs av
   * servern efter samtal med leverantören — sidan visar bara vad som står där.
   * `getPaymentAccounts` filtrerar själv på restaurangen (regel 5).
   */
  const accounts = await getPaymentAccounts(staff.restaurantId);
  const paymentAccount = accounts[0] ?? null;
  const connectable = connectableProviders(staff.currency);

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
    <StaffShell
      staff={staff}
      current="installningar"
      title="Inställningar"
      intro={staff.restaurantName}
      width="narrow"
    >

        {/*
          Presentationen först.

          Öppettider och orderregler avgör om gäster KAN beställa, men det som
          avgör om de VILL är hur stället presenterar sig. Den redigeraren låg
          inte här alls tidigare — beskrivning, bild, kökstyper och adress gick
          bara att ändra med SQL.
        */}
        {restaurant ? (
          <div className="mt-10">
            <PresentationEditor
              restaurantId={staff.restaurantId}
              restaurantName={staff.restaurantName}
              country={staff.country}
              publicPath={`/r/${restaurant.city_slug}/${restaurant.slug}`}
              initial={{
                description: restaurant.description,
                phone: restaurant.phone,
                cuisines: restaurant.cuisines ?? [],
                priceTier: restaurant.price_tier,
                streetAddress: restaurant.street_address,
                postalCode: restaurant.postal_code,
                city: restaurant.city,
                latitude: restaurant.latitude,
                longitude: restaurant.longitude,
                heroImageUrl: restaurant.hero_image_url,
              }}
            />
          </div>
        ) : null}

        <hr className="rule mt-14" />

        <section className="mt-10">
          <h2 className="font-display text-2xl">Öppettider</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Gäster kan bara beställa när ni är öppna. Flera pass per dag för lunch och kväll.
            Pass över midnatt stöds inte än.
          </p>
          <OpeningHoursEditor initial={hours} />
        </section>

        <hr className="rule mt-14" />

        <section className="mt-10">
          <h2 className="font-display text-2xl">Kortbetalning</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Gästen betalar i sin egen telefon. Avtalet är ert, inte Burps — pengarna går rakt
            in på ert konto.
          </p>
          <CardPaymentSettings
            account={
              paymentAccount
                ? {
                    provider: paymentAccount.provider,
                    status: paymentAccount.status as AccountStatus,
                    currency: paymentAccount.currency as CurrencyCode,
                  }
                : null
            }
            connectable={connectable}
            currency={staff.currency}
            isOwner={staff.role === "owner"}
          />
        </section>

        <hr className="rule mt-14" />

        <section className="mt-10">
          <h2 className="font-display text-2xl">Klippkort</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Tionde besöket bjuder ni på. Räknar besök, inte belopp.
          </p>
          <PunchCardEditor
            initialSize={restaurant?.punch_card_size ?? null}
            initialMaxRewardOre={restaurant?.punch_card_max_reward_ore ?? null}
            currency={staff.currency}
          />
        </section>

        <hr className="rule mt-14" />

        <section className="mt-10">
          <h2 className="font-display text-2xl">Orderregler</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Vad gästen får ändra efter att beställningen lagts, och hur länge.
          </p>
          <OrderPolicyEditor initial={policy} />
        </section>

        {staff.role === "owner" ? (
          <section className="mt-14 border-t border-[var(--rule)] pt-10">
            <h2 className="font-display text-2xl">Personal</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Ägare ser allt. Chef sköter drift och meny. Personal tar order och bord. Kock ser
              bara köksskärmen.
            </p>
            <StaffManager members={members} />
          </section>
        ) : (
          <section className="mt-14 border-t border-[var(--rule)] pt-10">
            <h2 className="font-display text-2xl">Personal</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Bara ägaren kan bjuda in och ändra roller.
            </p>
          </section>
        )}
    </StaffShell>
  );
}
