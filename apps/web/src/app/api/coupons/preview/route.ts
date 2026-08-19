import { NextResponse } from "next/server";
import {
  calculateOrderTotals,
  COUPON_PROBLEM_MESSAGES,
  orderItemInputSchema,
  type CouponProblem,
} from "@burp/core";
import { z } from "zod";
import { resolveCoupon } from "@/lib/coupons";
import { priceRequestedItems } from "@/lib/order-pricing";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Vad en kupongkod är värd för den här varukorgen.
 *
 * Finns för att gästen ska SE rabatten innan hon beställer. Utan den vore
 * kupongfältet ett hopp i mörkret: koden slås in, knappen trycks, och beloppet
 * på notan visar sig först på kvittot.
 *
 * Endpointen räknar men SPARAR INGENTING. Inlösen sker först när ordern läggs,
 * i samma transaktion som raden skrivs — den som frågar här har inte tagit
 * kupongen i anspråk, och två gäster kan fråga om samma sista kupong utan att
 * någon av dem blockerar den andra.
 *
 * Rate limit därför att endpointen annars är en orakelmaskin: en kod i taget,
 * så snabbt någon orkar, tills en fungerar.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(1).max(40),
  items: z.array(orderItemInputSchema).min(1).max(100),
  tip_ore: z.int().min(0).default(0),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`coupon:${ip}`, RATE_LIMITS.couponPreview);
  if (!limit.success) {
    return NextResponse.json(
      { ok: false, detail: "Vänta en stund och försök igen." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.ceil((limit.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, detail: "Förfrågan kunde inte tolkas." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const priced = await priceRequestedItems({
    items: parsed.data.items,
    tipOre: parsed.data.tip_ore,
  });

  if (!priced.ok) {
    return NextResponse.json(
      { ok: false, detail: priced.detail },
      { status: priced.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  const coupon = await resolveCoupon({
    code: parsed.data.code,
    restaurantId: priced.restaurantId,
    currency: priced.currency,
    itemsGrossOre: priced.totals.itemsGrossOre,
    guestId: user?.id ?? null,
  });

  if (!coupon.ok) {
    // Svaret säger VARFÖR koden inte gäller, men aldrig vad kupongen innehåller.
    // "Beställningen når inte upp till kodens minsta belopp" hjälper gästen;
    // att skriva ut gränsen hade gjort endpointen till en kartläsare.
    return NextResponse.json(
      {
        ok: false,
        problem: coupon.problem satisfies CouponProblem,
        detail: COUPON_PROBLEM_MESSAGES[coupon.problem],
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const totals = calculateOrderTotals({
    lines: priced.lines,
    tipOre: parsed.data.tip_ore,
    discountOre: coupon.discountOre,
  });

  return NextResponse.json(
    {
      ok: true,
      discount_ore: coupon.discountOre,
      total_ore: totals.totalOre,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
