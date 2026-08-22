"use server";

import { revalidatePath } from "next/cache";
import { formatGiftCardCode, parseAmount, type CurrencyCode } from "@burp/core";
import { requireStaff, staffErrors } from "@/lib/auth";
import { generateGiftCardCode } from "@/lib/gift-cards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { nullableArg } from "@/lib/supabase/types";

/**
 * Presentkort — utgivning och spärr.
 *
 * ⚠️ Kortet gäller hos EN restaurang. Det är inte en produktbegränsning utan
 * hela skälet till att det går att bygga: förbetalt värde som kan lösas in var
 * som helst är utgivning av elektroniska pengar och kräver tillstånd i alla tre
 * marknaderna. Se migration 0030 och docs/OPEN-QUESTIONS.md.
 *
 * Utgivningen går via `issue_gift_card()` med service role, eftersom kortet och
 * dess första transaktion måste skrivas i samma transaktion. Ett kort utan
 * ISSUE-rad har saldo noll och är värdelöst — och det ska inte gå att skapa ens
 * om anropet dör mitt i.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Koden, formaterad som den ska tryckas. Bara vid utgivning. */
  code?: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });

export async function issueGiftCard(input: {
  amount: string;
  email: string;
  note: string;
  expiresAt: string;
}): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);
  const currency = staff.currency as CurrencyCode;

  const amountOre = parseAmount(input.amount, currency);
  if (amountOre === null || amountOre <= 0) {
    return fail(staffErrors(staff).amountUnreadable);
  }

  let expiresAt: string | null = null;
  if (input.expiresAt.trim()) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) return fail(staffErrors(staff).endDateUnreadable);
    expiresAt = parsed.toISOString();
  }

  const admin = createAdminClient();

  /*
   * Koden är 12 tecken ur 32, alltså en rymd på 2^60. En krock är osannolik men
   * inte omöjlig, och det unika indexet gör den till ett fel i stället för till
   * ett kort som skriver över ett annat. Tre försök räcker med råge — samma
   * mönster som `createTable` mot felkod 23505.
   */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateGiftCardCode();

    const { error } = await admin.rpc("issue_gift_card", {
      p_restaurant_id: staff.restaurantId,
      p_code: code,
      p_amount_ore: amountOre,
      p_currency: currency,
      // Tre parametrar som SQL:en tar emot som null. Se `nullableArg`.
      p_expires_at: nullableArg(expiresAt),
      p_email: nullableArg(input.email.trim() || null),
      p_note: nullableArg(input.note.trim() || null),
      p_actor_id: staff.userId,
    });

    if (!error) {
      revalidatePath("/dashboard/presentkort");
      return { ok: true, code: formatGiftCardCode(code) };
    }

    if (error.code !== "23505") return fail(error.message);
  }

  return fail(staffErrors(staff).giftCardCodeFailed);
}

/**
 * Spärrar eller öppnar ett kort.
 *
 * Inte delete: transaktionerna pekar på kortet och är det enda som säger vad
 * det är värt. Ett raderat kort hade gjort gamla order oförklarliga.
 */
export async function setGiftCardActive(
  giftCardId: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requireStaff(["owner", "manager"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("gift_cards")
    .update({ is_active: isActive })
    .eq("id", giftCardId);

  if (error) return fail(error.message);

  revalidatePath("/dashboard/presentkort");
  return { ok: true };
}
