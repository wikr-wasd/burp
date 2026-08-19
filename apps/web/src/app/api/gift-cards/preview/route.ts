import { NextResponse } from "next/server";
import {
  GIFT_CARD_PROBLEM_MESSAGES,
  orderItemInputSchema,
  type GiftCardProblem,
} from "@burp/core";
import { z } from "zod";
import { resolveGiftCard } from "@/lib/gift-cards";
import { priceRequestedItems } from "@/lib/order-pricing";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Hur mycket av ett presentkort som räcker till den här varukorgen.
 *
 * Räknar men SPARAR INGENTING. Kortet dras först när ordern läggs, i samma
 * transaktion som saldot läses om under lås — den som bara frågar vad kortet är
 * värt ska inte binda upp saldot för någon annan vid ett annat bord.
 *
 * Rate limit av samma skäl som kupongerna, fast starkare: ett presentkort är
 * ett värdepapper, och endpointen svarar på om en kod finns. Kodrymden är 2^60,
 * men en gräns kostar ingenting och gör frågan meningslös att ställa i skala.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(4).max(40),
  items: z.array(orderItemInputSchema).min(1).max(100),
  tip_ore: z.int().min(0).default(0),
  discount_ore: z.int().min(0).default(0),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`giftcard:${ip}`, RATE_LIMITS.giftCardPreview);
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
    discountOre: parsed.data.discount_ore,
  });

  if (!priced.ok) {
    return NextResponse.json(
      { ok: false, detail: priced.detail },
      { status: priced.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const card = await resolveGiftCard({
    code: parsed.data.code,
    restaurantId: priced.restaurantId,
    currency: priced.currency,
    amountDueOre: priced.totals.totalOre,
  });

  if (!card.ok) {
    return NextResponse.json(
      {
        ok: false,
        problem: card.problem satisfies GiftCardProblem,
        detail: GIFT_CARD_PROBLEM_MESSAGES[card.problem],
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      // Vad kortet betalar av just den här notan, och vad som finns kvar på
      // det efteråt. Saldot i sig visas inte förrän koden är rätt — annars är
      // endpointen en saldoförfrågan för vem som helst.
      applied_ore: card.appliedOre,
      balance_ore: card.balanceOre,
      due_ore: priced.totals.totalOre - card.appliedOre,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
