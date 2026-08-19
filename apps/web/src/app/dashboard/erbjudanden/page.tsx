import type { Metadata } from "next";
import Link from "next/link";
import type { CurrencyCode } from "@burp/core";
import { CouponManager, type CouponRow } from "@/components/staff/coupon-manager";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Erbjudanden — restaurangens egna rabattkoder.
 *
 * Plattformsbreda kuponger syns här också, men bara som en upplysning: de ägs
 * av Burp och går inte att ändra härifrån. Att dölja dem hade betytt att
 * personalen inte förstår varför en gäst fick rabatt.
 */

export const metadata: Metadata = {
  title: "Erbjudanden",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const staff = await requireStaff(["owner", "manager"]);
  const supabase = await createClient();

  // RLS ger bara de egna. En plattformsbred kupong syns inte här, och det är
  // avsiktligt: policyn i 0029 släpper bara igenom rader med den egna
  // restaurangen.
  const { data: coupons } = await supabase
    .from("coupons")
    .select(
      "id, code, discount_ore, discount_bps, currency, min_order_ore, max_discount_ore, valid_until, max_redemptions, max_per_guest, is_active, created_at",
    )
    .eq("restaurant_id", staff.restaurantId)
    .order("created_at", { ascending: false });

  const ids = (coupons ?? []).map((coupon) => coupon.id);

  // Antalet inlösen räknas ur loggen och lagras aldrig — samma skäl som
  // lojalitetssaldot (regel 7).
  const { data: redemptions } = ids.length
    ? await supabase.from("coupon_redemptions").select("coupon_id, discount_ore").in("coupon_id", ids)
    : { data: [] as { coupon_id: string; discount_ore: number }[] };

  const usedByCoupon = new Map<string, { count: number; totalOre: number }>();
  for (const row of redemptions ?? []) {
    const current = usedByCoupon.get(row.coupon_id) ?? { count: 0, totalOre: 0 };
    usedByCoupon.set(row.coupon_id, {
      count: current.count + 1,
      totalOre: current.totalOre + row.discount_ore,
    });
  }

  const rows: CouponRow[] = (coupons ?? []).map((coupon) => ({
    id: coupon.id,
    code: coupon.code,
    discountOre: coupon.discount_ore,
    discountBps: coupon.discount_bps,
    minOrderOre: coupon.min_order_ore,
    maxDiscountOre: coupon.max_discount_ore,
    validUntil: coupon.valid_until,
    maxRedemptions: coupon.max_redemptions,
    maxPerGuest: coupon.max_per_guest,
    isActive: coupon.is_active,
    redemptions: usedByCoupon.get(coupon.id)?.count ?? 0,
    redeemedOre: usedByCoupon.get(coupon.id)?.totalOre ?? 0,
  }));

  return (
    <StaffShell
      staff={staff}
      current="erbjudanden"
      title="Erbjudanden"
      intro="Rabattkoder gästen slår in i kassan. Rabatten dras från notan — och därmed även från underlaget för Burps avgift, så ni betalar aldrig avgift på pengar ni inte fick in."
      width="narrow"
    >
      <CouponManager coupons={rows} currency={staff.currency as CurrencyCode} />

      {/*
        Presentkorten ligger på en egen sida och inte här.

        De ser ut som samma sak men är det inte: en kupong är en rabatt som
        sänker notan, ett presentkort är förbetalt värde som sänker vad som ska
        betalas. Skillnaden avgör momsen, och att blanda dem i samma vy hade
        gjort den svår att se.
      */}
      <p className="mt-10 text-sm text-[var(--muted)]">
        Letar du efter presentkort?{" "}
        <Link href="/dashboard/presentkort" className="link">
          De ligger här
        </Link>
        . Ett presentkort är förbetalt värde och inte en rabatt — notan och momsen är
        desamma, det är bara betalningen som ändras.
      </p>
    </StaffShell>
  );
}
