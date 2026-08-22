import { after, NextResponse } from "next/server";
import {
  assertClientTotalMatches,
  calculateFee,
  calculateOrderTotals,
  COUPON_PROBLEM_MESSAGES,
  createOrderSchema,
  DEFAULT_FEE_BASE,
  GIFT_CARD_PROBLEM_MESSAGES,
  punchCardReward,
  parseOpeningHours,
  parseOrderPolicy,
  PriceMismatchError,
  SCHEDULE_PROBLEM_MESSAGES,
  statusAfterPlacement,
  validateScheduledFor,
} from "@burp/core";
import { resolveCoupon } from "@/lib/coupons";
import { serverEnv } from "@/lib/env";
import { resolveGiftCard } from "@/lib/gift-cards";
import { priceRequestedItems } from "@/lib/order-pricing";
import { getPunchCard } from "@/lib/punch-cards";
import { rememberGuestOrder } from "@/lib/guest-orders";
import { requestLocale } from "@/lib/i18n";
import { notifyNewOrder } from "@/lib/notify";
import { getCardAccount, paymentProvider, PaymentProviderError } from "@/lib/payments";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { nullableArg, type TableInsert } from "@/lib/supabase/types";
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
  const limit = await rateLimit(`order:${ip}`, RATE_LIMITS.orderCreate);
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

  /* ── 2. Räkna om priset från menyn, inte från klienten ─────────────────── */

  // Första passet, utan rabatt: kupongen behöver veta vad varukorgen är värd
  // innan den kan räknas.
  const priced = await priceRequestedItems({
    items: input.items,
    tipOre: input.tip_ore,
    expectedRestaurantId: restaurantId || null,
  });

  if (!priced.ok) {
    return problem(priced.status, priced.title, priced.detail, undefined,
      priced.code ? { code: priced.code } : undefined);
  }

  restaurantId = priced.restaurantId;

  /* ── 3. Kupongen ───────────────────────────────────────────────────────── */

  let couponId: string | null = null;
  let discountOre = 0;

  if (input.coupon_code) {
    const coupon = await resolveCoupon({
      code: input.coupon_code,
      restaurantId,
      currency: priced.currency,
      itemsGrossOre: priced.totals.itemsGrossOre,
      guestId,
    });

    if (!coupon.ok) {
      // Koden är gästens fel eller kampanjens slut, aldrig ett serverfel.
      return problem(409, "Koden gäller inte", COUPON_PROBLEM_MESSAGES[coupon.problem], undefined, {
        code: coupon.problem,
      });
    }

    couponId = coupon.couponId;
    discountOre = coupon.discountOre;
  }

  /* ── 3b. Klippkortet ───────────────────────────────────────────────────── */

  /*
   * Belöningen är en RABATT och inte ett betalmedel: restaurangen bjuder på
   * måltiden, alltså blir den aldrig fakturerad. Notan sjunker, och därmed
   * också momsen och Burps avgiftsunderlag — vilket är rätt, eftersom
   * restaurangen inte fick in några pengar att betala avgift på.
   */
  let punchCardRewardOre = 0;

  if (input.use_punch_card) {
    const state = await getPunchCard(restaurantId, guestId);

    if (!state?.isEarned) {
      return problem(
        409,
        "Klippkortet är inte fullt",
        state
          ? `Det är ${state.remaining} besök kvar till nästa gratis måltid.`
          : "Klippkort kräver att du är inloggad hos en restaurang som har ett.",
      );
    }

    punchCardRewardOre = punchCardReward({
      itemsGrossOre: priced.totals.itemsGrossOre,
      discountOre,
      maxRewardOre: state.maxRewardOre,
    });

    discountOre += punchCardRewardOre;
  }

  const totals = discountOre
    ? calculateOrderTotals({ lines: priced.lines, tipOre: input.tip_ore, discountOre })
    : priced.totals;

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

  /* ── 5. Betalvägen ─────────────────────────────────────────────────────── */

  /*
   * Kort och kontant lägger ordern i olika status, och det är avsiktligt.
   *
   * En kontantorder är lagd direkt: gästen betalar i kassan efteråt och köket
   * ska börja laga. En kortorder skapas som DRAFT och lyfts till PLACED först
   * när betalningen bekräftats av leverantörens webhook. Köket ska aldrig se en
   * obetald order — den som stänger telefonen mitt i betalningen ska inte ha
   * fått mat tillagad.
   */
  /*
   * Presentkortet dras FÖRST, och det är avsiktligt.
   *
   * Kortet är betalmedel och inte rabatt: ordersumman, momsen och Burps
   * avgiftsunderlag står kvar orörda. Det som sjunker är beloppet leverantören
   * ska debitera — och det måste vara känt innan intenten skapas, annars
   * debiteras gästen för hela notan och kortet blir en gåva till oss.
   */
  const giftCard = input.gift_card_code
    ? await resolveGiftCard({
        code: input.gift_card_code,
        restaurantId,
        currency: priced.currency,
        amountDueOre: totals.totalOre,
      })
    : null;

  if (giftCard && !giftCard.ok) {
    return problem(
      409,
      "Presentkortet gäller inte",
      GIFT_CARD_PROBLEM_MESSAGES[giftCard.problem],
      undefined,
      { code: giftCard.problem },
    );
  }

  const giftCardOre = giftCard?.ok ? giftCard.appliedOre : 0;
  const amountDueOre = totals.totalOre - giftCardOre;

  // Täcker presentkortet hela notan behövs ingen leverantör alls.
  const cardAccount =
    input.payment_method === "CARD" && amountDueOre > 0
      ? await getCardAccount(restaurantId)
      : null;

  if (input.payment_method === "CARD" && amountDueOre > 0 && !cardAccount) {
    // Klienten visar bara kortknappen när kontot finns, men den som anropar
    // API:t direkt har aldrig sett gränssnittet.
    return problem(
      409,
      "Kortbetalning är inte tillgänglig",
      "Restaurangen tar inte emot kort ännu. Beställ och betala på plats i stället.",
    );
  }

  /*
   * En kortorder skapas som utkast. Ett presentkort som täcker hela notan gör
   * det också — inlösen sker efter att ordern finns, och köket ska inte se
   * ordern förrän betalningen är bokförd.
   */
  const paysUpfront = cardAccount !== null || (giftCardOre > 0 && amountDueOre === 0);
  const orderStatus = paysUpfront ? "DRAFT" : statusAfterPlacement(policy.autoAccept);

  /* ── 6. Skriv allt i en transaktion ────────────────────────────────────── */

  const { data: order, error: writeError } = await supabase.rpc("place_order", {
    p_payload: {
      idempotency_key: input.idempotency_key,
      restaurant_id: restaurantId,
      guest_id: guestId,
      table_id: tableId,
      table_session_id: tableSessionId,
      type: input.type,
      status: orderStatus,
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
      // Raderna byggs ur menyn, inte ur klientens request. Namn och pris
      // sparas som ögonblicksbild — ändras menyn i morgon ska gårdagens kvitto
      // fortfarande visa vad gästen faktiskt betalade.
      lines: priced.lines.map((line, index) => ({
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

  if (writeError || typeof order !== "string") {
    return problem(500, "Beställningen kunde inte sparas", writeError?.message ?? "Okänt fel.");
  }

  /*
   * Gästens språk fryses på ordern.
   *
   * Notisbrevet skrivs långt efter att gästen lämnat sidan, och då finns ingen
   * `Accept-Language` kvar att läsa. Utan den här raden hade jobbet fått gissa
   * — rimligen på restaurangens land, alltså bosniska till en tysk turist i
   * Sarajevo. Det är precis den gästen avhämtning finns för.
   *
   * Skrivs efter `place_order` och inte i den, och det är ett medvetet
   * undantag från "allt i en transaktion". Att lägga in kolumnen i funktionen
   * hade betytt att hela dess kropp skrivs om i den här migrationen — hundra
   * rader duplicerad logik för ett fält. Priset för att låta bli är litet och
   * känt: går skrivningen inte igenom blir kolumnen null, och `null` är redan
   * definierat som "okänt, gissa på landet". Ordern, priset och kvittot rörs
   * inte av det.
   *
   * Att en anonym gäst kan skriva i `orders` ser fel ut vid en snabb läsning
   * och är det inte: `supabase` är här service role (rad 66), samma klient som
   * lade ordern. Gästens egen session har ingen update-rättighet alls — se
   * kontrollen i `verify-schema-tests.sql`.
   */
  await supabase
    .from("orders")
    .update({ guest_locale: await requestLocale() })
    .eq("id", order);

  /*
   * Inlösenraden.
   *
   * Räkningen görs om i databasen under lås, och det är inte överdrivet:
   * mellan att `resolveCoupon` räknade och att ordern skrevs kan någon annan ha
   * tagit den sista kupongen. Faller den här har ordern redan lagts — då
   * avbryts den, eftersom en order lagd på ett pris gästen inte får ha är
   * värre än en order som inte blev av.
   */
  if (couponId) {
    const { error: redeemError } = await supabase.rpc("redeem_coupon", {
      p_coupon_id: couponId,
      p_order_id: order,
      // Null för en anonym bordsgäst. Generatorn typar varje funktions-
      // parameter som icke-nullbar; SQL:en gör det inte. Se `nullableArg`.
      p_guest_id: nullableArg(guestId),
      p_discount_ore: discountOre,
    });

    if (redeemError) {
      await supabase
        .from("orders")
        .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
        .eq("id", order);

      return problem(409, "Koden gäller inte", "Koden hann ta slut. Försök igen utan den.");
    }
  }

  /*
   * Klippkortets uttag.
   *
   * Räkningen görs om i databasen under lås av samma skäl som kupongens: två
   * beställningar från samma konto samtidigt skulle annars kunna lösa ut samma
   * belöning två gånger, och restaurangen bjuda på två måltider för tio besök.
   */
  if (input.use_punch_card) {
    const { error: punchError } = await supabase.rpc("redeem_punch_card", {
      p_restaurant_id: restaurantId,
      p_guest_id: nullableArg(guestId),
      p_order_id: order,
      p_reward_ore: punchCardRewardOre,
    });

    if (punchError) {
      await supabase
        .from("orders")
        .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
        .eq("id", order);

      return problem(
        409,
        "Klippkortet gick inte att lösa ut",
        "Belöningen hann tas ut på en annan beställning. Försök igen.",
      );
    }
  }

  // Kvittosidan för avhämtning har varken bordssession eller inloggning att gå
  // på. Cookien är det som gör att gästen kan se sin egen order — och bara sin
  // egen. Bordsflödet har redan sin `table_session_id` och behöver den inte.
  if (input.type !== "TABLE") {
    await rememberGuestOrder(order);
  }

  /* ── 7. Presentkortet löses in ─────────────────────────────────────────── */

  if (giftCardOre > 0) {
    /*
     * Saldot läses om under lås i databasen. Mellan att `resolveGiftCard`
     * räknade och att raden skrivs kan samma kort ha använts vid ett annat
     * bord — det är hela poängen med att kontrollen finns två gånger.
     */
    const { data: giftPayment, error: giftError } = await supabase.rpc("redeem_gift_card", {
      p_code: input.gift_card_code!,
      p_order_id: order,
      p_amount_ore: giftCardOre,
    });

    if (giftError || typeof giftPayment !== "string") {
      await supabase
        .from("orders")
        .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
        .eq("id", order);

      return problem(
        409,
        "Presentkortet gäller inte",
        "Presentkortets saldo räckte inte längre. Försök igen utan det.",
      );
    }

    /*
     * Täcker kortet hela notan är ordern betald här och nu. Det finns ingen
     * webhook som kommer och lyfter den — och en order som ligger kvar i DRAFT
     * är en order köket aldrig får se.
     */
    if (amountDueOre === 0) {
      const { error: confirmError } = await supabase.rpc("confirm_order_payment", {
        p_payment_id: giftPayment,
        p_method: "gift_card",
      });

      if (confirmError) {
        return problem(500, "Beställningen kunde inte läggas", confirmError.message);
      }

      after(() => notifyNewOrder(order));

      return NextResponse.json(
        {
          order_id: order,
          status: statusAfterPlacement(policy.autoAccept),
          total_ore: totals.totalOre,
          gift_card_ore: giftCardOre,
        },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  /* ── 8. Kortbetalningen initieras ──────────────────────────────────────── */

  if (cardAccount) {
    let intent;
    try {
      intent = await paymentProvider(cardAccount.provider).createIntent({
        orderId: order,
        restaurantId,
        // Det som återstår efter presentkortet, inte hela notan.
        amountOre: amountDueOre,
        currency: cardAccount.currency,
        // Burps avgift dras ur betalningen hos de leverantörer som kan det.
        // Dricksen ingår aldrig i underlaget — den är gästens pengar till
        // personalen (regel 8).
        applicationFeeOre: fee.feeOre,
        idempotencyKey: input.idempotency_key,
        account: cardAccount,
        description: `Burp ${order.slice(0, 8)}`,
      });
    } catch (error) {
      // Ordern ligger kvar som DRAFT. Den syns inte för köket och städas av
      // intentens egen utgång — men gästen ska få veta att det inte gick.
      const detail =
        error instanceof PaymentProviderError
          ? error.message
          : "Betalningen kunde inte startas. Försök igen eller betala på plats.";
      return problem(502, "Betalningen kunde inte startas", detail);
    }

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        order_id: order,
        restaurant_id: restaurantId,
        amount_ore: amountDueOre,
        provider: cardAccount.provider,
        provider_reference: intent.reference,
        status: intent.status,
        // Samma nyckel som ordern och som leverantörens intent. Ett dubbeltryck
        // ger en order, en intent och en betalningsrad.
        idempotency_key: input.idempotency_key,
        /*
         * `currency` saknas med flit.
         *
         * Kolumnen är `not null` utan default sedan migration 0026, men fylls
         * av triggern `payments_set_currency` ur ORDERN. Kommentaren i
         * migrationen säger det rakt ut: "Aldrig satt av anroparen — en
         * betalning i annan valuta än sin order går inte att stämma av."
         *
         * Typgeneratorn kan inte veta att en trigger fyller fältet, så den
         * kräver det här. Casten är därför inte ett kringgående av regeln utan
         * av generatorns blinda fläck.
         */
      } as TableInsert<"payments">)
      .select("id")
      .single();

    if (paymentError || !payment) {
      return problem(500, "Betalningen kunde inte sparas", paymentError?.message ?? "Okänt fel.");
    }

    // Ingen notis här. Köket får sitt brev av webhooken när pengarna kommit in.
    return NextResponse.json(
      {
        order_id: order,
        status: orderStatus,
        total_ore: totals.totalOre,
        gift_card_ore: giftCardOre,
        payment: {
          id: payment.id,
          provider: cardAccount.provider,
          amount_ore: amountDueOre,
          client_secret: intent.clientSecret,
          ...intent.clientContext,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  }

  /*
   * Notisen till restaurangen.
   *
   * `after()` kör efter att svaret gått iväg. Gästen ska inte vänta på ett
   * SMTP-anrop för att få veta att beställningen gick igenom, och en
   * leverantör som hänger får inte fördröja bekräftelsen vid bordet.
   *
   * Ett rent `void notifyNewOrder(...)` hade sett likadant ut lokalt men
   * inte fungerat på Vercel: instansen fryser när svaret är skickat och
   * brevet hade avbrutits mitt i. `after()` håller den vid liv.
   */
  after(() => notifyNewOrder(order));

  return NextResponse.json(
    { order_id: order, status: orderStatus, total_ore: totals.totalOre },
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
