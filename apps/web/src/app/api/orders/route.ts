import { NextResponse } from "next/server";
import {
  assertClientTotalMatches,
  buildPricedLines,
  calculateFee,
  calculateOrderTotals,
  createOrderSchema,
  DEFAULT_FEE_BASE,
  parseOpeningHours,
  parseOrderPolicy,
  PriceMismatchError,
  SCHEDULE_PROBLEM_MESSAGES,
  statusAfterPlacement,
  validateScheduledFor,
} from "@burp/core";
import { serverEnv } from "@/lib/env";
import { rememberGuestOrder } from "@/lib/guest-orders";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateTableSession, lookupTable } from "@/lib/table-session";

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

  // Är gästen inloggad knyts ordern till kontot så att den syns under "Mina
  // beställningar" och kan ge lojalitetspoäng. Bordsbeställningar är oftast
  // anonyma och får då guest_id null — det är avsiktligt (avsnitt 4).
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const guestId = user?.id ?? null;

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

    // Notan öppnas här, inte när koden skannades. En route handler får skriva
    // cookies; en server component får det inte. Finns redan en öppen nota vid
    // bordet läggs ordern på den — flera gäster delar nota.
    tableSessionId = await getOrCreateTableSession(lookup.table);
  } else {
    // Avhämtning och leverans härleder restaurangen ur menyraderna, som ändå
    // måste tillhöra en och samma restaurang (kontrolleras i steg 2).
    // Öppettiderna kan därför inte kontrolleras här — restaurangen är ännu
    // okänd. Kontrollen ligger i stället i steg 4, när den är känd.
    restaurantId = "";
  }

  /* ── 2. Hämta katalogen ────────────────────────────────────────────────── */

  const menuItemIds = [...new Set(input.items.map((item) => item.menu_item_id))];

  const { data: menuItems, error: menuError } = await supabase
    .from("menu_items")
    .select("id, restaurant_id, name, price_ore, vat_rate_bps, is_available, status")
    .in("id", menuItemIds);

  if (menuError || !menuItems || menuItems.length !== menuItemIds.length) {
    return problem(400, "Okänd menyrad", "En eller flera rätter finns inte längre.");
  }

  // Grupperna hämtas per RÄTT, inte per valt tillval. Det är den kopplingen
  // som avgör vilka tillval som faktiskt får väljas — hämtas tillvalen bara på
  // sina egna id:n går det att hänga ett tillval från en annan rätt på ordern.
  const { data: optionGroups, error: groupsError } = await supabase
    .from("option_groups")
    .select("id, menu_item_id, name, min_select, max_select")
    .in("menu_item_id", menuItemIds);

  if (groupsError || !optionGroups) {
    return problem(500, "Menyn kunde inte läsas", "Försök igen.");
  }

  const { data: options, error: optionsError } = optionGroups.length
    ? await supabase
        .from("options")
        .select("id, option_group_id, name, price_ore, is_available")
        .in(
          "option_group_id",
          optionGroups.map((group) => group.id),
        )
    : { data: [], error: null };

  if (optionsError || !options) {
    return problem(500, "Menyn kunde inte läsas", "Försök igen.");
  }

  /* ── 3. Räkna om priset från menyn, inte från klienten ─────────────────── */

  const built = buildPricedLines(input.items, {
    menuItems: menuItems.map((row) => ({
      id: row.id,
      restaurantId: row.restaurant_id,
      name: row.name,
      priceOre: row.price_ore,
      vatRateBps: row.vat_rate_bps,
      isAvailable: row.is_available,
      status: row.status,
    })),
    optionGroups: optionGroups.map((row) => ({
      id: row.id,
      menuItemId: row.menu_item_id,
      name: row.name,
      minSelect: row.min_select,
      maxSelect: row.max_select,
    })),
    options: options.map((row) => ({
      id: row.id,
      optionGroupId: row.option_group_id,
      name: row.name,
      priceOre: row.price_ore,
      isAvailable: row.is_available,
    })),
  });

  if (!built.ok) {
    // 409 för sådant som ändrats sedan gästen laddade menyn, 400 för sådant
    // som aldrig var giltigt.
    const status =
      built.error.code === "ITEM_UNAVAILABLE" || built.error.code === "OPTION_UNAVAILABLE"
        ? 409
        : 400;
    return problem(status, "Beställningen kan inte läggas", built.error.message, undefined, {
      code: built.error.code,
    });
  }

  if (restaurantId && built.restaurantId !== restaurantId) {
    return problem(400, "Fel restaurang", "Rätterna hör inte till det här bordet.");
  }
  restaurantId = built.restaurantId;

  const totals = calculateOrderTotals({ lines: built.lines, tipOre: input.tip_ore });

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
    .select("id, status, order_policy, fee_override_bps, fee_base, opening_hours")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant || restaurant.status !== "ACTIVE") {
    return problem(409, "Restaurangen tar inte emot order", "Försök igen senare.");
  }

  // Bordsflödet kontrollerade redan öppettiderna i `lookupTable`. Avhämtning
  // och leverans gick förbi den kontrollen, eftersom restaurangen inte var känd
  // förrän menyraderna slagits upp. Utan den här går det att beställa mat att
  // hämta från ett stängt kök.
  if (input.type !== "TABLE" && !input.scheduled_for) {
    const { data: isOpen, error: openError } = await supabase.rpc("is_restaurant_open", {
      p_restaurant_id: restaurantId,
    });

    if (openError) {
      return problem(500, "Kunde inte läsa öppettiderna", "Försök igen.");
    }

    if (!isOpen) {
      return problem(
        409,
        "Restaurangen är stängd",
        "Beställningar går bara att lägga under öppettiderna.",
      );
    }
  }

  const policy = parseOrderPolicy(restaurant.order_policy);

  if (input.scheduled_for) {
    if (!policy.allowScheduledOrders) {
      return problem(
        409,
        "Förbeställning stängd",
        "Restaurangen tar inte emot beställningar i förväg.",
      );
    }

    // Klienten föreslår en hämttid, servern avgör. Utan den här kontrollen går
    // det att beställa till en stängd timme, till en tid köket omöjligt hinner
    // till, eller godtyckligt långt fram i tiden.
    const problemCode = validateScheduledFor(new Date(input.scheduled_for), {
      openingHours: parseOpeningHours(restaurant.opening_hours),
      prepTimeMinutes: policy.prepTimeMinutes,
      now: new Date(),
    });

    if (problemCode) {
      return problem(409, "Tiden går inte att välja", SCHEDULE_PROBLEM_MESSAGES[problemCode], undefined, {
        code: problemCode,
      });
    }
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
      guest_id: guestId,
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
      // Raderna byggs ur `built.lines`, inte ur klientens request. Namn och
      // pris sparas som ögonblicksbild — ändras menyn i morgon ska gårdagens
      // kvitto fortfarande visa vad gästen faktiskt betalade.
      lines: built.lines.map((line, index) => ({
        menu_item_id: line.menuItemId,
        name_snapshot: line.name,
        unit_price_ore: line.unitPriceOre,
        vat_rate_bps: line.vatRateBps,
        quantity: line.quantity,
        line_gross_ore: totals.lines[index]!.grossOre,
        note: input.items[index]?.note ?? null,
        options: line.options.map((option) => ({
          option_id: option.optionId,
          name_snapshot: option.name,
          price_ore: option.priceOre,
        })),
      })),
    },
  });

  if (writeError) {
    return problem(500, "Beställningen kunde inte sparas", writeError.message);
  }

  // Kvittosidan för avhämtning har varken bordssession eller inloggning att gå
  // på. Cookien är det som gör att gästen kan se sin egen order — och bara sin
  // egen. Bordsflödet har redan sin `table_session_id` och behöver den inte.
  if (input.type !== "TABLE" && typeof order === "string") {
    await rememberGuestOrder(order);
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
