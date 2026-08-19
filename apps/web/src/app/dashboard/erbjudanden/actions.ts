"use server";

import { revalidatePath } from "next/cache";
import { normalizeCouponCode, parseAmount, type CurrencyCode } from "@burp/core";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Restaurangens egna erbjudanden.
 *
 * Skrivs med personalens egen session, inte med service role: policyerna i
 * migration 0029 släpper bara igenom rader där `restaurant_id` är den egna och
 * `funded_by = 'RESTAURANT'`. Restaurangen kan alltså inte skapa en kupong som
 * Burp får betala — det avgörs i databasen och inte här.
 *
 * Beloppet kommer in som text och tolkas i restaurangens valuta. "1200" i ett
 * serbiskt fält är 1200 dinarer, inte 12,00, och den kunskapen ligger i
 * @burp/core just för att inte spridas ut i formulär.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });

function done(): ActionResult {
  revalidatePath("/dashboard/erbjudanden");
  return { ok: true };
}

export interface CouponInput {
  code: string;
  /** "PERCENT" eller "AMOUNT". Aldrig båda — en kupong ger en sorts rabatt. */
  kind: "PERCENT" | "AMOUNT";
  /** Procent som text, t.ex. "25". Bara för PERCENT. */
  percent: string;
  /** Belopp som text i restaurangens valuta. Bara för AMOUNT. */
  amount: string;
  /** Tak för procentrabatten, som text. Tomt = inget tak. */
  maxDiscount: string;
  minOrder: string;
  validUntil: string;
  maxRedemptions: string;
  maxPerGuest: string;
}

export async function createCoupon(input: CouponInput): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);
  const currency = staff.currency as CurrencyCode;

  const code = normalizeCouponCode(input.code);
  if (code.length < 3 || code.length > 32) {
    return fail("Koden ska vara 3–32 tecken, bara bokstäver och siffror.");
  }

  const row: Record<string, unknown> = {
    restaurant_id: staff.restaurantId,
    code,
    // Restaurangens egen kampanj. Policyn i 0029 tillåter inget annat härifrån.
    funded_by: "RESTAURANT",
    max_per_guest: toCount(input.maxPerGuest) ?? 1,
  };

  if (input.kind === "PERCENT") {
    const percent = Number(input.percent.replace(",", "."));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return fail("Procentsatsen ska vara mellan 1 och 100.");
    }
    // Baspunkter, som allt annat i procent i produkten. 25 % = 2500.
    row["discount_bps"] = Math.round(percent * 100);

    if (input.maxDiscount.trim()) {
      const cap = parseAmount(input.maxDiscount, currency);
      if (cap === null || cap <= 0) return fail("Taket gick inte att tolka.");
      row["max_discount_ore"] = cap;
    }
  } else {
    const amount = parseAmount(input.amount, currency);
    if (amount === null || amount <= 0) return fail("Beloppet gick inte att tolka.");
    row["discount_ore"] = amount;
    row["currency"] = currency;
  }

  if (input.minOrder.trim()) {
    const min = parseAmount(input.minOrder, currency);
    if (min === null || min < 0) return fail("Minsta ordersumma gick inte att tolka.");
    row["min_order_ore"] = min;
  }

  if (input.validUntil.trim()) {
    const until = new Date(input.validUntil);
    if (Number.isNaN(until.getTime())) return fail("Slutdatumet gick inte att tolka.");
    row["valid_until"] = until.toISOString();
  }

  const maxRedemptions = toCount(input.maxRedemptions);
  if (maxRedemptions !== null) row["max_redemptions"] = maxRedemptions;

  const supabase = await createClient();
  const { error } = await supabase.from("coupons").insert(row);

  if (error) {
    // 23505 = det unika indexet på (restaurant_id, code).
    if (error.code === "23505") return fail("Koden finns redan hos er.");
    return fail(error.message);
  }

  return done();
}

/**
 * Stänger av en kupong.
 *
 * Inte delete: inlösenraderna pekar på kupongen och behöver den för att gå att
 * läsa i efterhand. En avstängd kupong slutar gälla direkt; en raderad hade
 * gjort gamla order oförklarliga.
 */
export async function setCouponActive(couponId: string, isActive: boolean): Promise<ActionResult> {
  await requireStaff(["owner", "manager"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("coupons")
    .update({ is_active: isActive })
    .eq("id", couponId);

  return error ? fail(error.message) : done();
}

/** Tolkar ett antal. Tom sträng betyder "ingen gräns" och ger null. */
function toCount(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
