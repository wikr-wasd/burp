import type { Metadata } from "next";
import { GuestHeader } from "@/components/guest/guest-header";
import { AddressList } from "@/components/guest/address-list";
import { requireGuest } from "@/lib/guest";
import { dictionary, requestLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * Gästens sparade adresser.
 *
 * Används av leveransflödet, som ännu inte finns (öppen fråga 2 avgör om
 * leverans sker i egen regi eller via partner). Adresserna går att spara redan
 * nu eftersom schemat och RLS finns — det som saknas är beställningsflödet,
 * inte lagringen.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await requestLocale());

  return {
    title: t.account.addresses,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export interface GuestAddress {
  id: string;
  label: string | null;
  streetAddress: string;
  postalCode: string;
  city: string;
  doorCode: string | null;
  isDefault: boolean;
}

export default async function AddressesPage() {
  const guest = await requireGuest("/konto/adresser");
  const t = dictionary(await requestLocale());
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("addresses")
    .select("id, label, street_address, postal_code, city, door_code, is_default")
    .eq("user_id", guest.userId)
    .order("created_at", { ascending: true });

  const addresses: GuestAddress[] = (rows ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    streetAddress: row.street_address,
    postalCode: row.postal_code,
    city: row.city,
    doorCode: row.door_code,
    isDefault: row.is_default,
  }));

  return (
    <>
      <GuestHeader
        guest={guest}
        current="adresser"
        texts={t.account}
        homeLabel={t.site.home}
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="label-caps">{t.account.label}</p>
        <h1 className="font-display mt-2 text-4xl">{t.account.addresses}</h1>
        <p className="mt-1 text-sm opacity-70">{t.account.addressesIntro}</p>

        <AddressList addresses={addresses} texts={t.account} />
      </main>
    </>
  );
}
