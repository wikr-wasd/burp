import type { Metadata } from "next";
import { formatGiftCardCode, type CurrencyCode } from "@burp/core";
import { GiftCardManager, type GiftCardRow } from "@/components/staff/gift-card-manager";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Presentkort.
 *
 * Ligger under Erbjudanden i navigeringen men är en annan sak: ett presentkort
 * är förbetalt värde och inte en rabatt. Att blanda dem i samma vy hade gjort
 * skillnaden svår att se, och den skillnaden är den som avgör hur momsen
 * hanteras.
 */

export const metadata: Metadata = {
  title: "Presentkort",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GiftCardsPage() {
  const staff = await requireStaff(["owner", "manager"]);
  const supabase = await createClient();

  const { data: cards } = await supabase
    .from("gift_cards")
    .select("id, code, expires_at, is_active, issued_to_email, note, created_at")
    .eq("restaurant_id", staff.restaurantId)
    .order("created_at", { ascending: false })
    .limit(200);

  const ids = (cards ?? []).map((card) => card.id);

  /*
   * Saldot räknas ur loggen, aldrig ur ett lagrat tal (regel 7).
   *
   * Raderna hämtas i en fråga och summeras här i stället för att anropa
   * `gift_card_balance()` en gång per kort — tvåhundra kort hade blivit
   * tvåhundra anrop.
   */
  const { data: transactions } = ids.length
    ? await supabase
        .from("gift_card_transactions")
        .select("gift_card_id, kind, amount_ore")
        .in("gift_card_id", ids)
    : { data: [] as { gift_card_id: string; kind: string; amount_ore: number }[] };

  const balanceByCard = new Map<string, number>();
  const issuedByCard = new Map<string, number>();

  for (const row of transactions ?? []) {
    const signed = row.kind === "REDEEM" ? -row.amount_ore : row.amount_ore;
    balanceByCard.set(row.gift_card_id, (balanceByCard.get(row.gift_card_id) ?? 0) + signed);
    if (row.kind === "ISSUE") {
      issuedByCard.set(row.gift_card_id, (issuedByCard.get(row.gift_card_id) ?? 0) + row.amount_ore);
    }
  }

  const rows: GiftCardRow[] = (cards ?? []).map((card) => ({
    id: card.id,
    code: formatGiftCardCode(card.code),
    issuedOre: issuedByCard.get(card.id) ?? 0,
    balanceOre: balanceByCard.get(card.id) ?? 0,
    expiresAt: card.expires_at,
    isActive: card.is_active,
    issuedToEmail: card.issued_to_email,
    note: card.note,
  }));

  return (
    <StaffShell
      staff={staff}
      current="erbjudanden"
      title="Presentkort"
      intro="Förbetalt värde som bara går att lösa in hos er. Saldot räknas ur transaktionerna och lagras aldrig — ett kort kan användas flera gånger tills det är slut."
      width="narrow"
    >
      <GiftCardManager cards={rows} currency={staff.currency as CurrencyCode} />
    </StaffShell>
  );
}
