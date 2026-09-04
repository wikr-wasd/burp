import "server-only";

import {
  ACTIVE_STATUSES,
  isDueForKitchen,
  parseOrderPolicy,
  type OrderStatus,
  type OrderType,
} from "@burp/core";
import { createClient } from "./supabase/server";

/**
 * Aktiva order för köksskärmen och orderlistan.
 *
 * Läser via den vanliga RLS-klienten, inte service role. Personalen är
 * inloggad och `orders_select_staff` begränsar redan till den egna
 * restaurangen — service role här skulle bara ta bort skyddsnätet.
 */

export interface KitchenOrderItem {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  /**
   * Gästens egna ord, när `note` är en översättning av dem.
   *
   * Null när ingenting översattes — utan API-nyckel, när texten redan var på
   * personalens språk, eller när leverantören inte svarade. Se
   * `lib/translate-notes.ts`; originalet försvinner aldrig, för en maskin kan
   * ha fel och då ska kocken kunna se vad gästen faktiskt skrev.
   */
  noteOriginal?: string | null;
  options: string[];
}

export interface KitchenOrder {
  id: string;
  status: OrderStatus;
  type: OrderType;
  tableNumber: string | null;
  /**
   * Rummet bordet står i — "Bašta", "Unutra", "Nedre våningen".
   *
   * Biljetten skrev länge bara bordsnumret. Med en sal räcker det. Med en
   * uteservering OCH en sal innanför vet inte den som ska springa ut med maten
   * om hon ska gå ut eller in, och bord 6 kan mycket väl ligga utomhus medan
   * bord 11 ligger inne. Numret ensamt är en halv adress.
   *
   * Null när restaurangen inte delat in sina bord i zoner. Då ritas den inte
   * heller ut — en tom rad under bordsnumret säger ingenting.
   */
  tableZone: string | null;
  placedAt: string | null;
  acceptedAt: string | null;
  note: string | null;
  /** Gästens egna ord, när `note` är en översättning. Se `KitchenOrderItem`. */
  noteOriginal?: string | null;
  totalOre: number;
  /** Hämttid för en förbeställning. Null för en order som ska lagas nu. */
  scheduledFor: string | null;
  /**
   * Kökets egen uppskattning i minuter, eller null om ingen satt någon.
   *
   * Null betyder "ingen har sagt något" och inte "noll minuter" — kvittot
   * faller då tillbaka på restaurangens orderregel. Se migration 0048.
   */
  prepMinutes: number | null;
  items: KitchenOrderItem[];
}

export interface ActiveOrders {
  /** Order köket ska laga nu. */
  due: KitchenOrder[];
  /**
   * Förbeställningar som ännu inte ska påbörjas.
   *
   * Hålls undan från köksskärmen tills tillagningstiden återstår — annars
   * börjar köket laga en lunch som ska hämtas klockan 18. Personalen ser dem
   * ändå, i en egen lista, så att ingen tror att beställningen försvunnit.
   */
  upcoming: KitchenOrder[];
  /**
   * Restaurangens standardtid ur orderreglerna.
   *
   * Följer med ut därför att köksskärmen behöver den som förval i knappraden
   * "Klart om". Att låta sidan hämta den själv hade betytt en andra fråga mot
   * samma kolumn — och en andra chans att glömma den.
   */
  prepTimeMinutes: number;
}

/**
 * Statusarna som betyder "köket har något att göra med den här".
 *
 * Bor i `@burp/core` sedan köksskärmens larm behövde samma lista — larmet körs
 * i webbläsaren och den här filen är `server-only`. Re-exporten står kvar så
 * att befintliga anrop inte behöver veta att den flyttat.
 */
export { ACTIVE_STATUSES };

export async function getActiveOrders(restaurantId: string): Promise<ActiveOrders> {
  const supabase = await createClient();

  // Tillagningstiden avgör när en förbeställning ska släppas till köket.
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("order_policy")
    .eq("id", restaurantId)
    .maybeSingle();

  const prepTimeMinutes = parseOrderPolicy(restaurant?.order_policy).prepTimeMinutes;

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, status, type, placed_at, accepted_at, note, total_ore, table_id, scheduled_for, prep_minutes",
    )
    .eq("restaurant_id", restaurantId)
    .in("status", ACTIVE_STATUSES)
    // Äldst först. Köket arbetar i den ordning orderna kom in, inte tvärtom.
    .order("placed_at", { ascending: true });

  if (!orders || orders.length === 0) return { due: [], upcoming: [], prepTimeMinutes };

  const mapped = await hydrateOrders(supabase, orders);

  // Filtreringen sker på tiden, inte på ett bakgrundsjobb. Ett jobb som inte
  // kört är ett jobb som tappat en order — och det felet upptäcks av en hungrig
  // gäst, inte av ett larm.
  const now = new Date();
  const due: KitchenOrder[] = [];
  const upcoming: KitchenOrder[] = [];

  for (const order of mapped) {
    const scheduled = order.scheduledFor ? new Date(order.scheduledFor) : null;
    if (isDueForKitchen(scheduled, prepTimeMinutes, now)) due.push(order);
    else upcoming.push(order);
  }

  // Kommande sorteras på hämttid: den som ska hämtas först är den som snart
  // dyker upp i köket.
  upcoming.sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));

  return { due, upcoming, prepTimeMinutes };
}


/* ── Delad hydrering ─────────────────────────────────────────────────────── */

/**
 * Rader ur `orders` → färdiga `KitchenOrder`.
 *
 * Bruten ur `getActiveOrders()` när bordsvyn behövde exakt samma sak. Två
 * kopior av det här steget hade betytt att en tillvalsrad som ritas på
 * köksskärmen kan saknas i bordets nota — och den sortens skillnad upptäcks
 * av en gäst som fick fel mat, inte av ett test.
 */
type OrderRow = {
  id: string;
  status: string;
  type: string;
  placed_at: string | null;
  accepted_at: string | null;
  note: string | null;
  total_ore: number;
  table_id: string | null;
  scheduled_for: string | null;
  prep_minutes: number | null;
};

async function hydrateOrders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orders: OrderRow[],
): Promise<KitchenOrder[]> {
  const orderIds = orders.map((order) => order.id);

  const { data: items } = await supabase
    .from("order_items")
    .select("id, order_id, name_snapshot, quantity, note")
    .in("order_id", orderIds);

  const itemIds = (items ?? []).map((item) => item.id);
  const tableIds = [
    ...new Set(orders.map((order) => order.table_id).filter((id): id is string => id !== null)),
  ];

  const [optionsResult, tablesResult] = await Promise.all([
    itemIds.length
      ? supabase
          .from("order_item_options")
          .select("order_item_id, name_snapshot")
          .in("order_item_id", itemIds)
      : Promise.resolve({ data: [] as { order_item_id: string; name_snapshot: string }[] }),
    tableIds.length
      ? supabase.from("tables").select("id, table_number, zone").in("id", tableIds)
      : Promise.resolve({
          data: [] as { id: string; table_number: string; zone: string | null }[],
        }),
  ]);

  const optionsByItem = new Map<string, string[]>();
  for (const option of optionsResult.data ?? []) {
    const existing = optionsByItem.get(option.order_item_id);
    if (existing) existing.push(option.name_snapshot);
    else optionsByItem.set(option.order_item_id, [option.name_snapshot]);
  }

  const itemsByOrder = new Map<string, KitchenOrderItem[]>();
  for (const item of items ?? []) {
    const mapped: KitchenOrderItem = {
      id: item.id,
      name: item.name_snapshot,
      quantity: item.quantity,
      note: item.note,
      options: optionsByItem.get(item.id) ?? [],
    };
    const existing = itemsByOrder.get(item.order_id);
    if (existing) existing.push(mapped);
    else itemsByOrder.set(item.order_id, [mapped]);
  }

  const tableById = new Map(
    (tablesResult.data ?? []).map((table) => [
      table.id,
      { number: table.table_number, zone: table.zone ?? null },
    ]),
  );

  const mapped: KitchenOrder[] = orders.map((order) => ({
    id: order.id,
    status: order.status as OrderStatus,
    type: order.type as OrderType,
    tableNumber: order.table_id ? (tableById.get(order.table_id)?.number ?? null) : null,
    tableZone: order.table_id ? (tableById.get(order.table_id)?.zone ?? null) : null,
    placedAt: order.placed_at,
    acceptedAt: order.accepted_at,
    note: order.note,
    totalOre: order.total_ore,
    scheduledFor: order.scheduled_for,
    prepMinutes: order.prep_minutes,
    items: itemsByOrder.get(order.id) ?? [],
  }));

  return mapped;
}

/* ── Ett enskilt bord ────────────────────────────────────────────────────── */

export interface TableOrders {
  tableId: string;
  tableNumber: string;
  zone: string | null;
  /** Null när bordet står tomt — ingen öppen session finns. */
  sessionId: string | null;
  /** Sällskapets order i den ordning de lades. Alla statusar utom utkast. */
  orders: KitchenOrder[];
  totalOre: number;
  paidOre: number;
  dueOre: number;
}

/**
 * Vad det här bordet har beställt.
 *
 * Servitören som klickar på ett bord i översikten frågar inte "vilka order är
 * aktiva" utan "vad har de fått och vad är kvar att betala". Därför hela
 * sessionen och alla statusar — en serverad rätt ska stå kvar i listan, och en
 * avbruten ska synas som avbruten i stället för att försvinna.
 *
 * Bordet hämtas med restaurangfiltret på plats. RLS säger samma sak, men ett
 * id ur adressfältet ska ge "finns inte" och inte ett tomt bord.
 */
export async function getTableOrders(
  restaurantId: string,
  tableId: string,
): Promise<TableOrders | null> {
  const supabase = await createClient();

  const { data: table } = await supabase
    .from("tables")
    .select("id, table_number, zone")
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!table) return null;

  const empty: TableOrders = {
    tableId: table.id,
    tableNumber: table.table_number,
    zone: table.zone ?? null,
    sessionId: null,
    orders: [],
    totalOre: 0,
    paidOre: 0,
    dueOre: 0,
  };

  const { data: session } = await supabase
    .from("table_sessions")
    .select("id")
    .eq("table_id", tableId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return empty;

  const { data: rows } = await supabase
    .from("orders")
    .select(
      "id, status, type, placed_at, accepted_at, note, total_ore, table_id, scheduled_for, prep_minutes",
    )
    .eq("table_session_id", session.id)
    .neq("status", "DRAFT")
    .order("placed_at", { ascending: true });

  if (!rows || rows.length === 0) return { ...empty, sessionId: session.id };

  const orders = await hydrateOrders(supabase, rows);

  /*
   * Avbrutna och återbetalda order räknas inte in i notan.
   *
   * De VISAS — servitören ska se att något ströks — men en avbruten rätt som
   * låg kvar i summan hade gjort att bordet krävdes på pengar det inte är
   * skyldigt. Samma regel som dricksen: raden finns kvar, beloppet gör det inte.
   */
  const billable = orders.filter(
    (order) => order.status !== "CANCELLED" && order.status !== "REFUNDED",
  );

  const { data: payments } = await supabase
    .from("payments")
    .select("order_id, amount_ore, status")
    .in(
      "order_id",
      billable.map((order) => order.id),
    );

  const paidOre = (payments ?? [])
    .filter((payment) => payment.status !== "FAILED")
    .reduce((sum, payment) => sum + payment.amount_ore, 0);

  const totalOre = billable.reduce((sum, order) => sum + order.totalOre, 0);

  return {
    ...empty,
    sessionId: session.id,
    orders,
    totalOre,
    paidOre,
    dueOre: Math.max(0, totalOre - paidOre),
  };
}
