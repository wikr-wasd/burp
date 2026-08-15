import { NextResponse } from "next/server";
import { canGuestEdit, parseOrderPolicy, type EditAction } from "@burp/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { currentTableSessionId } from "@/lib/table-session";
import { guestOwnsOrder } from "@/lib/guest-orders";

/**
 * Gästen ändrar sin lagda order (avsnitt 5.2).
 *
 * Det här är den saknade halvan av orderreglerna. Restaurangen har kunnat
 * ställa in ändringsfönster och vad som får ändras sedan början, men ingen kod
 * anropade reglerna — inställningarna var verkningslösa.
 *
 * Två saker avgörs här, i den ordningen:
 *
 *   1. ÄGARSKAP. Vem får röra ordern? En anonym bordsgäst legitimerar sig med
 *      bordssessionens cookie, en avhämtningsgäst med sin egen cookie, en
 *      inloggad med sitt konto. Utan det räcker det att gissa ett order-id.
 *   2. REGLERNA. Får ändringen göras just nu? Det avgör `canGuestEdit` med
 *      restaurangens egen policy — samma funktion som klienten använder för
 *      att visa eller dölja knappar.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Context {
  params: Promise<{ id: string }>;
}

/** Avbryt ordern, eller ta bort en rad ur den. */
export async function PATCH(request: Request, context: Context) {
  const { id: orderId } = await context.params;

  const body = (await request.json().catch(() => null)) as
    | { action?: string; order_item_id?: string }
    | null;

  const action = body?.action;
  if (action !== "CANCEL" && action !== "REMOVE_ITEM") {
    return problem(400, "Okänd åtgärd", "Ange CANCEL eller REMOVE_ITEM.");
  }

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, restaurant_id, status, placed_at, guest_id, table_session_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    return problem(404, "Ordern hittades inte", "Kontrollera länken.");
  }

  /* ── 1. Ägarskap ───────────────────────────────────────────────────────── */

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sessionId = await currentTableSessionId();

  const owns =
    (order.guest_id !== null && order.guest_id === user?.id) ||
    (order.table_session_id !== null && order.table_session_id === sessionId) ||
    (await guestOwnsOrder(orderId));

  if (!owns) {
    // Samma svar som för en order som inte finns. Skulle de skilja sig kunde
    // endpointen användas för att ta reda på vilka order-id som existerar.
    return problem(404, "Ordern hittades inte", "Kontrollera länken.");
  }

  /* ── 2. Restaurangens regler ───────────────────────────────────────────── */

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("order_policy")
    .eq("id", order.restaurant_id)
    .single();

  const policy = parseOrderPolicy(restaurant?.order_policy);

  const editAction: EditAction = action === "CANCEL" ? "CANCEL" : "REMOVE_ITEM";

  const decision = canGuestEdit(
    policy,
    {
      status: order.status,
      // En order utan placed_at har aldrig lagts. Faller tillbaka på nu, vilket
      // gör att ändringsfönstret räknas från detta ögonblick i stället för att
      // krascha på ett null-datum.
      placedAt: order.placed_at ? new Date(order.placed_at) : new Date(),
    },
    editAction,
  );

  if (!decision.allowed) {
    return problem(409, "Ändringen går inte att göra", decision.message, undefined, {
      code: decision.reason,
    });
  }

  /* ── 3. Utför ──────────────────────────────────────────────────────────── */

  if (action === "CANCEL") {
    // Statusmaskinens trigger i databasen avgör om övergången är tillåten.
    // Skulle den vägra är det ett tecken på att policyn och maskinen glidit
    // isär, och då ska ordern inte avbrytas tyst.
    const { error } = await admin
      .from("orders")
      .update({ status: "CANCELLED" })
      .eq("id", orderId);

    if (error) {
      return problem(409, "Ordern kunde inte avbrytas", error.message);
    }

    return NextResponse.json(
      { status: "CANCELLED" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!body?.order_item_id) {
    return problem(400, "Ingen rad angiven", "Ange vilken rad som ska tas bort.");
  }

  const { error } = await admin.rpc("remove_order_item", {
    p_order_id: orderId,
    p_item_id: body.order_item_id,
    p_actor: "GUEST",
  });

  if (error) {
    // Sista raden vägras av databasen med check_violation. Meddelandet därifrån
    // är redan skrivet för en gäst, så det skickas vidare som det är.
    return problem(409, "Raden kunde inte tas bort", error.message);
  }

  return NextResponse.json(
    { removed: body.order_item_id },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

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
