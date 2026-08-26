"use server";

import { revalidatePath } from "next/cache";
import { requireGuest } from "@/lib/guest";
import { createClient } from "@/lib/supabase/server";

/**
 * Gästens matrundor.
 *
 * Skrivningarna går genom den inloggades egen session. `routes_own` och
 * `route_stops_own` (migration 0056) är hela skyddet — ingen åtgärd här skickar
 * med ett `user_id` som klienten valt, och stoppens policy frågar `routes` om
 * vem rutten hör till i stället för att lagra svaret en gång till.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  routeId?: string;
}

/** Så många stopp ryms i en rutt. Fler är en resplan, inte en kväll. */
const MAX_STOPS = 20;

function done(routeId?: string): ActionResult {
  revalidatePath("/konto/rutter");
  if (routeId) revalidatePath(`/konto/rutter/${routeId}`);
  return { ok: true, routeId };
}

export async function createRoute(name: string): Promise<ActionResult> {
  const guest = await requireGuest();

  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, message: "Rutten behöver ett namn." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes")
    .insert({ user_id: guest.userId, name: trimmed.slice(0, 120) })
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: error?.message ?? "Rutten kunde inte skapas." };

  return done(data.id);
}

export async function renameRoute(routeId: string, name: string): Promise<ActionResult> {
  await requireGuest();

  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, message: "Rutten behöver ett namn." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("routes")
    .update({ name: trimmed.slice(0, 120), updated_at: new Date().toISOString() })
    .eq("id", routeId);

  return error ? { ok: false, message: error.message } : done(routeId);
}

export async function deleteRoute(routeId: string): Promise<ActionResult> {
  await requireGuest();

  const supabase = await createClient();
  const { error } = await supabase.from("routes").delete().eq("id", routeId);

  return error ? { ok: false, message: error.message } : done();
}

/**
 * Lägger till ett ställe sist i rutten.
 *
 * Positionen räknas fram här och inte av klienten. Två flikar som lägger till
 * samtidigt skulle annars föreslå samma position, och listan hade fått två
 * stopp på samma plats — vilket inte är fel i datan men ser slumpmässigt ut i
 * gränssnittet.
 */
export async function addStop(routeId: string, restaurantId: string): Promise<ActionResult> {
  await requireGuest();

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("route_stops")
    .select("position")
    .eq("route_id", routeId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const next = (existing?.position ?? -1) + 1;

  if (next >= MAX_STOPS) {
    return { ok: false, message: `En rutt rymmer ${MAX_STOPS} stopp.` };
  }

  const { error } = await supabase.from("route_stops").insert({
    route_id: routeId,
    restaurant_id: restaurantId,
    position: next,
  });

  // Samma ställe två gånger är nästan alltid ett dubbeltryck. Att svara "klart"
  // är ärligare än ett fel om något gästen inte försökte göra.
  if (error && error.code === "23505") return done(routeId);

  return error ? { ok: false, message: error.message } : done(routeId);
}

export async function removeStop(routeId: string, stopId: string): Promise<ActionResult> {
  await requireGuest();

  const supabase = await createClient();
  const { error } = await supabase.from("route_stops").delete().eq("id", stopId);

  return error ? { ok: false, message: error.message } : done(routeId);
}

/**
 * Flyttar ett stopp ett steg.
 *
 * Två skrivningar som byter plats på grannarna. Det finns inget unikt villkor
 * på `(route_id, position)` just därför: ett sådant hade gjort bytet omöjligt
 * utan en tredje, tillfällig position — och den dagen skrivningen avbryts
 * mitt i står rutten kvar med ett stopp på plats 99.
 */
export async function moveStop(
  routeId: string,
  stopId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  await requireGuest();

  const supabase = await createClient();

  const { data: stops } = await supabase
    .from("route_stops")
    .select("id, position")
    .eq("route_id", routeId)
    .order("position", { ascending: true });

  if (!stops) return { ok: false, message: "Rutten kunde inte läsas." };

  const index = stops.findIndex((stop) => stop.id === stopId);
  const swapWith = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || swapWith < 0 || swapWith >= stops.length) return done(routeId);

  const current = stops[index]!;
  const other = stops[swapWith]!;

  const first = await supabase
    .from("route_stops")
    .update({ position: other.position })
    .eq("id", current.id);

  if (first.error) return { ok: false, message: first.error.message };

  const second = await supabase
    .from("route_stops")
    .update({ position: current.position })
    .eq("id", other.id);

  return second.error ? { ok: false, message: second.error.message } : done(routeId);
}
