import { NextResponse } from "next/server";
import {
  assertClientTotalMatches,
  calculateFee,
  calculateOrderTotals,
  createOrderSchema,
  DEFAULT_FEE_BASE,
  parseOrderPolicy,
  PriceMismatchError,
  statusAfterPlacement,
  type PricedLine,
} from "@burp/core";
import { serverEnv } from "@/lib/env";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentTableSessionId, lookupTable } from "@/lib/table-session";

/**
 * Skapar en order.
 *
 * Den bärande regeln (avsnitt 12): KLIENTEN SKICKAR ALDRIG IN ETT PRIS.
 * Requesten säger bara vilka rätter och tillval som beställs. Servern hämtar
 * priserna ur menyn, räknar summan med @burp/core och avvisar ordern om
 * klientens egen uträkning avviker.
 *
 * Själva skrivningen sker i en Postgres-funktion (`place_order`) så att order,
 * orderrader, avgift och händelselogg hamnar i samma transaktion. Att skriva
 * dem i följd härifrån skulle kunna lämna en order utan avgiftsrad om anropet
 * dör mitt i.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`order:${ip}`, RATE_LIMITS.orderCreate);
  if (!limit.success) {
    return problem(429, "För många beställningar", "Vänta en stund och försök igen.", {
      "Retry-After": String(Math.ceil((limit.reset - Date.now()) / 1000)),
    });
  }

  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(400, "Ogiltig beställning", "Beställningen kunde inte tolkas.", undefined, {
      issues: parsed.error.issues,
    });
  }
  const input = parsed.data;

  const supabase = createAdminClient();

  /* ── 1. Vilken restaurang gäller det? ──────────────────────────────────── */

  let restaurantId: string;
  let tableId: string | null = null;
  let tableSessionId: string | null = null;

  if (input.type === "TABLE") {
    const lookup = await lookupTable(input.table_token!);
    if (!lookup.ok) {
      return problem(
        lookup.reason === "CLOSED" ? 409 : 404,
        "Bordet kan inte ta emot beställningar",
        lookup.reason === "CLOSED"
          ? "Restaurangen är stängd."
          : "Bordskoden är ogiltig eller bordet är låst.",
      );
    }
    restaurantId = lookup.table.restaurantId;
    tableId = lookup.table.tableId;
    tableSessionId = await currentTableSessionId();
  } else {
    // Avhämtning och leverans härleder restaurangen ur menyraderna, som ändå
    // måste tillhöra en och samma restaurang (kontrolleras i steg 2).
    restaurantId = "";
  }

  /* ── 2. Hämta menyn och kontrollera att raderna får beställas ──────────── */

  const menuItemIds = [...new Set(input.items.map((item) => item.menu_item_id))];
  const optionIds = [...new Set(input.items.flatMap((item) => item.options.map((o) => o.option_id)))];

  const { data: menuItems, error: menuError } = await supabase
    .from("menu_items")
    .select("id, restaurant_id, name, price_ore, vat_rate_bps, is_available, status")
    .in("id", menuItemIds);

  if (menuError || !menuItems || menuItems.length !== menuItemIds.length) {
    return problem(400, "Okänd menyrad", "En eller flera rätter finns inte längre.");
  }

  const restaurantIds = new Set(menuItems.map((item) => item.restaurant_id));
  if (restaurantIds.size !== 1) {
    return problem(
      400,
      "Blandade restauranger",
      "En order kan bara innehålla rätter från en restaurang.",
    );
  }

  const menuRestaurantId = menuItems[0]!.restaurant_id;
  if (restaurantId && menuRestaurantId !== restaurantId) {
    return problem(400, "Fel restaurang", "Rätterna hör inte till det här bordet.");
  }
  restaurantId = menuRestaurantId;

  const unavailable = menuItems.filter(
    (item) => !item.is_available || item.status !== "PUBLISHED",
  );
  if (unavailable.length > 0) {
    return problem(
      409,
      "Slut för dagen",
      `${unavailable.map((item) => item.name).join(", ")} går inte att beställa just nu.`,
    );
  }

  const { data: options, error: optionsError } = optionIds.length
    ? await supabase
        .from("options")
        .select("id, name, price_ore, option_group_id, is_available")
        .in("id", optionIds)
    : { data: [], error: null };

  if (optionsError || !options || options.length !== optionIds.length) {
    return problem(400, "Okänt tillval", "Ett eller flera tillval finns inte längre.");
  }

  /* ── 3. Räkna om priset från menyn, inte från klienten ─────────────────── */

  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const optionById = new Map(options.map((option) => [option.id, option]));

  const lines: PricedLine[] = input.items.map((item) => {
    const menuItem = menuById.get(item.menu_item_id)!;
    return {
      menuItemId: menuItem.id,
      name: menuItem.name,
      unitPriceOre: menuItem.price_ore,
      quantity: item.quantity,
      vatRateBps: menuItem.vat_rate_bps,
      options: item.options.map((selected) => {
        const option = optionById.get(selected.option_id)!;
        return { optionId: option.id, name: option.name, priceOre: option.price_ore };
      }),
    };
  });

  const totals = calculateOrderTotals({ lines, tipOre: input.tip_ore });

  if (input.client_total_ore !== undefined) {
    try {
      assertClientTotalMatches(totals, input.client_total_ore);
    } catch (error) {
      if (error instanceof PriceMismatchError) {
        // Priset har antingen ändrats i menyn medan gästen handlade, eller så
        // har någon manipulerat requesten. Båda ska stoppa ordern och synas.
        return problem(409, "Priset har ändrats", "Ladda om menyn och försök igen.", undefined, {
          server_total_ore: totals.totalOre,
        });
      }
      throw error;
    }
  }

  /* ── 4. Restaurangens regler och avgift ────────────────────────────────── */

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, status, order_policy, fee_override_bps, fee_base")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant || restaurant.status !== "ACTIVE") {
    return problem(409, "Restaurangen tar inte emot order", "Försök igen senare.");
  }

  const policy = parseOrderPolicy(restaurant.order_policy);

  if (input.scheduled_for && !policy.allowScheduledOrders) {
    return problem(
      409,
      "Förbeställning stängd",
      "Restaurangen tar inte emot beställningar i förväg.",
    );
  }

  const fee = calculateFee(
    totals,
    (restaurant.fee_base as typeof DEFAULT_FEE_BASE | null) ?? DEFAULT_FEE_BASE,
    restaurant.fee_override_bps ?? serverEnv().BURP_DEFAULT_FEE_BPS,
  );

  /* ── 5. Skriv allt i en transaktion ────────────────────────────────────── */

  const { data: order, error: writeError } = await supabase.rpc("place_order", {
    p_payload: {
      idempotency_key: input.idempotency_key,
      restaurant_id: restaurantId,
      table_id: tableId,
      table_session_id: tableSessionId,
      type: input.type,
      status: statusAfterPlacement(policy.autoAccept),
      note: input.note ?? null,
      scheduled_for: input.scheduled_for ?? null,
      items_gross_ore: totals.itemsGrossOre,
      items_vat_ore: totals.itemsVatOre,
      vat_by_rate: totals.vatByRate,
      delivery_fee_ore: totals.deliveryFeeOre,
      discount_ore: totals.discountOre,
      tip_ore: totals.tipOre,
      total_ore: totals.totalOre,
      fee_base: fee.base,
      fee_bps: fee.bps,
      fee_base_amount_ore: fee.baseAmountOre,
      fee_ore: fee.feeOre,
      lines: input.items.map((item, index) => ({
        menu_item_id: item.menu_item_id,
        // Namn och pris sparas som ögonblicksbild. Ändras menyn i morgon ska
        // gårdagens kvitto fortfarande visa vad gästen faktiskt betalade.
        name_snapshot: menuById.get(item.menu_item_id)!.name,
        unit_price_ore: menuById.get(item.menu_item_id)!.price_ore,
        vat_rate_bps: menuById.get(item.menu_item_id)!.vat_rate_bps,
        quantity: item.quantity,
        line_gross_ore: totals.lines[index]!.grossOre,
        note: item.note ?? null,
        options: item.options.map((selected) => ({
          option_id: selected.option_id,
          name_snapshot: optionById.get(selected.option_id)!.name,
          price_ore: optionById.get(selected.option_id)!.price_ore,
        })),
      })),
    },
  });

  if (writeError) {
    return problem(500, "Beställningen kunde inte sparas", writeError.message);
  }

  return NextResponse.json(
    { order_id: order, status: statusAfterPlacement(policy.autoAccept), total_ore: totals.totalOre },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

/** RFC 9457-liknande felsvar. Enhetligt format gör klientkoden enklare. */
function problem(
  status: number,
  title: string,
  detail: string,
  headers?: Record<string, string>,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { title, detail, status, ...extra },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}
