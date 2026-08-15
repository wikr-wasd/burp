import "server-only";

import type { CurrencyCode } from "@burp/core";

import { redirect } from "next/navigation";
import { calculateBalance, type LoyaltyTransaction } from "@burp/core";
import { createClient } from "./supabase/server";

/**
 * Den inloggade gästen.
 *
 * Skild från både `lib/auth.ts` (restaurangpersonal) och `lib/platform.ts`
 * (Burps backoffice). En gäst är vem som helst med ett konto — ingen rad i
 * `staff` eller `platform_admins` krävs, och ingen sådan rad ger heller extra
 * rättigheter till gästytorna.
 */

export interface Guest {
  userId: string;
  email: string | null;
  fullName: string | null;
}

export async function getGuest(): Promise<Guest | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
  };
}

export async function requireGuest(next = "/konto"): Promise<Guest> {
  const guest = await getGuest();
  if (!guest) redirect(`/logga-in?next=${encodeURIComponent(next)}`);
  return guest;
}

/* ── Beställningar ───────────────────────────────────────────────────────── */

export interface GuestOrder {
  id: string;
  status: string;
  type: string;
  totalOre: number;
  /** Valutan ordern lades i, fryst vid orderläggning (migration 0020). */
  currency: CurrencyCode;
  placedAt: string | null;
  completedAt: string | null;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  citySlug: string;
  itemNames: string[];
  hasReview: boolean;
}

export async function getGuestOrders(userId: string, limit = 30): Promise<GuestOrder[]> {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, type, total_ore, currency, placed_at, completed_at, restaurant_id")
    .eq("guest_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const restaurantIds = [...new Set(orders.map((order) => order.restaurant_id))];

  const [itemsResult, restaurantsResult, reviewsResult] = await Promise.all([
    supabase.from("order_items").select("order_id, name_snapshot, quantity").in("order_id", orderIds),
    supabase.from("restaurants").select("id, name, slug, city_slug").in("id", restaurantIds),
    supabase.from("reviews").select("order_id").in("order_id", orderIds),
  ]);

  const itemsByOrder = new Map<string, string[]>();
  for (const item of itemsResult.data ?? []) {
    const label = item.quantity > 1 ? `${item.quantity}× ${item.name_snapshot}` : item.name_snapshot;
    const existing = itemsByOrder.get(item.order_id);
    if (existing) existing.push(label);
    else itemsByOrder.set(item.order_id, [label]);
  }

  const restaurants = new Map(
    (restaurantsResult.data ?? []).map((r) => [r.id, r] as const),
  );
  const reviewed = new Set((reviewsResult.data ?? []).map((r) => r.order_id));

  return orders.map((order) => {
    const restaurant = restaurants.get(order.restaurant_id);
    return {
      id: order.id,
      status: order.status,
      type: order.type,
      totalOre: order.total_ore,
      currency: order.currency as CurrencyCode,
      placedAt: order.placed_at,
      completedAt: order.completed_at,
      restaurantId: order.restaurant_id,
      restaurantName: restaurant?.name ?? "Restaurangen",
      restaurantSlug: restaurant?.slug ?? "",
      citySlug: restaurant?.city_slug ?? "",
      itemNames: itemsByOrder.get(order.id) ?? [],
      hasReview: reviewed.has(order.id),
    };
  });
}

/* ── Lojalitet ───────────────────────────────────────────────────────────── */

export interface LoyaltyState {
  balance: number;
  expiringSoon: number;
}

/**
 * Poängsaldot räknas ur händelseloggen, aldrig ur ett lagrat värde
 * (avsnitt 10). Samma funktion som `@burp/core` använder, så gästens siffra
 * och backofficens kan inte glida isär.
 */
export async function getLoyalty(userId: string): Promise<LoyaltyState | null> {
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("loyalty_accounts")
    .select("id")
    .eq("user_id", userId)
    .is("restaurant_id", null)
    .maybeSingle();

  if (!account) return null;

  const { data: rows } = await supabase
    .from("loyalty_transactions")
    .select("kind, points, created_at, expires_at")
    .eq("account_id", account.id)
    .order("created_at", { ascending: true });

  const transactions: LoyaltyTransaction[] = (rows ?? []).map((row) => ({
    kind: row.kind,
    points: row.points,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  }));

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    balance: calculateBalance(transactions, now),
    expiringSoon: transactions
      .filter(
        (t) => t.points > 0 && t.expiresAt !== null && t.expiresAt > now && t.expiresAt <= in30Days,
      )
      .reduce((sum, t) => sum + t.points, 0),
  };
}
