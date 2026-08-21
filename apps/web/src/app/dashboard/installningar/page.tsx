import type { Metadata } from "next";
import {
  parseOpeningHours,
  parseOrderPolicy,
  type CurrencyCode,
  type OpeningHours,
  type OrderPolicy,
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
import { PushToggle } from "@/components/staff/push-toggle";
import { requireStaff } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { connectableProviders, getPaymentAccounts } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { dictionary } from "@/lib/i18n";

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
  const d = dictionary(staff.locale);
  const t = d.staff;

  return (
    <StaffShell
      staff={staff}
      current="installningar"
      title={t.section.installningar}
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
              labels={t.settings}
            />
          </div>
        ) : null}

        <hr className="rule mt-14" />

        <section className="mt-10">
          <h2 className="font-display text-2xl">{t.settings.hoursTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.settings.hoursHint}
          </p>
          <OpeningHoursEditor initial={hours} weekdayLabels={d.weekday} labels={t.settings} />
        </section>

        <hr className="rule mt-14" />

        <section className="mt-10">
          <h2 className="font-display text-2xl">{t.settings.cardTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.settings.cardHint}
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
            labels={t.settings}
          />
        </section>

        <hr className="rule mt-14" />

        <section className="mt-10">
          <h2 className="font-display text-2xl">{t.settings.notifyTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.settings.notifyHint}
          </p>
          <PushToggle
            vapidPublicKey={publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
            labels={t.settings}
          />
        </section>

        <hr className="rule mt-14" />

        <section className="mt-10">
          <h2 className="font-display text-2xl">{t.settings.punchTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.settings.punchHint}
          </p>
          <PunchCardEditor
            initialSize={restaurant?.punch_card_size ?? null}
            initialMaxRewardOre={restaurant?.punch_card_max_reward_ore ?? null}
            currency={staff.currency}
            labels={t.settings}
          />
        </section>

        <hr className="rule mt-14" />

        <section className="mt-10">
          <h2 className="font-display text-2xl">{t.settings.policyTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.settings.policyHint}
          </p>
          <OrderPolicyEditor initial={policy} statusLabels={t.status} labels={t.settings} />
        </section>

    </StaffShell>
  );
}
