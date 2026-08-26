import "server-only";

import {
  COUNTRY_INFO,
  parseReservationPolicy,
  validateReservationRequest,
  type ReservationPolicy,
  type CountryCode,
  type ReservationProblem,
} from "@burp/core";
import { createAdminClient } from "./supabase/admin";

/**
 * Bordsbokning, serversidan.
 *
 * ── Varför service role ─────────────────────────────────────────────────────
 *
 * Gästen som bokar har inget konto. Samma löfte som QR-beställningen — utan
 * app, utan konto — och därmed samma sak som gäller där: det finns ingen
 * `auth.uid()` att skriva en RLS-policy mot. Servern tar emot formuläret,
 * kontrollerar det, och skriver genom `create_reservation()`.
 *
 * Varje anrop här är bundet till en restaurang eller till en enskild bokning,
 * som regel 5 kräver.
 *
 * ── Varför så lite logik ────────────────────────────────────────────────────
 *
 * Vilka tider som är lediga räknas av `reservation_slots()` i databasen och
 * ingen annanstans. Den här modulen ställer frågan och formar om svaret; den
 * bedömer aldrig själv om ett bord är ledigt. Två uträkningar av samma sak
 * glider isär, och då visar sidan en tid som bokningen sedan nekar.
 */

export interface ReservationSlot {
  /** ISO-tid. Absolut tidpunkt, inte väggklocka. */
  at: string;
  tableId: string;
  tableNumber: string;
  zone: string | null;
  capacity: number;
  attributes: string[];
  surchargeOre: number;
}

export interface ReservationTimeOption {
  at: string;
  /** Borden som är lediga just då, billigast och minst först. */
  tables: ReservationSlot[];
}

/**
 * Lediga tider för ett datum, grupperade per klockslag.
 *
 * `p_date` är ett DATUM i restaurangens tidszon och inte en tidsstämpel.
 * Omvandlingen till absoluta tidpunkter görs i SQL med `at time zone`, där
 * sommartid och den timme som inte finns sköter sig själva — samma skäl som
 * avräkningens perioder räknas i databasen.
 */
export async function reservationSlots(
  restaurantId: string,
  date: string,
  partySize: number,
): Promise<ReservationTimeOption[]> {
  const supabase = createAdminClient();

  // service-role: en restaurang och ett datum — frågan är bunden i argumenten.
  const { data, error } = await supabase.rpc("reservation_slots", {
    p_restaurant_id: restaurantId,
    p_date: date,
    p_party_size: partySize,
  });

  if (error || !data) return [];

  const byTime = new Map<string, ReservationSlot[]>();

  for (const row of data) {
    const at = new Date(row.slot_at as string).toISOString();
    const slot: ReservationSlot = {
      at,
      tableId: row.table_id as string,
      tableNumber: row.table_number as string,
      zone: (row.zone as string | null) ?? null,
      capacity: (row.capacity as number) ?? 0,
      attributes: (row.attributes as string[] | null) ?? [],
      surchargeOre: (row.surcharge_ore as number) ?? 0,
    };

    const existing = byTime.get(at);
    if (existing) existing.push(slot);
    else byTime.set(at, [slot]);
  }

  return [...byTime.entries()]
    .map(([at, tables]) => ({ at, tables }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export interface RestaurantForBooking {
  id: string;
  name: string;
  policy: ReservationPolicy;
  timeZone: string;
  currency: string;
}

/** Restaurangens bokningsregler, eller null när restaurangen inte finns. */
export async function reservationPolicyFor(
  restaurantId: string,
): Promise<{ policy: ReservationPolicy; country: string } | null> {
  const supabase = createAdminClient();

  // service-role: en enskild restaurang.
  const { data } = await supabase
    .from("restaurants")
    .select("reservation_policy, country, status")
    .eq("id", restaurantId)
    .maybeSingle();

  if (!data || data.status !== "ACTIVE") return null;

  return {
    policy: parseReservationPolicy(data.reservation_policy),
    country: data.country,
  };
}

export interface CreateReservationInput {
  restaurantId: string;
  tableId: string;
  at: string;
  partySize: number;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  guestId?: string | null;
  note?: string;
}

export type CreateReservationResult =
  | { ok: true; reservationId: string; cancelToken: string }
  | { ok: false; problem: ReservationProblem | "SLOT_TAKEN" | "UNKNOWN" };

/**
 * Skapar bokningen.
 *
 * Kontrollerna körs i två lager, och båda behövs. `validateReservationRequest`
 * i @burp/core avgör det som går att avgöra utan databasen — sällskapets
 * storlek, framförhållningen — och ger ett begripligt fel per problem.
 * `create_reservation()` avgör resten, och det är där sanningen finns: att
 * tiden fortfarande är ledig kan bara databasen svara på, och bara i samma
 * ögonblick som raden skrivs.
 */
export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  const found = await reservationPolicyFor(input.restaurantId);
  if (!found) return { ok: false, problem: "DISABLED" };

  const problem = validateReservationRequest(
    {
      partySize: input.partySize,
      at: new Date(input.at),
      guestName: input.guestName,
    },
    found.policy,
  );

  if (problem) return { ok: false, problem };

  const supabase = createAdminClient();

  // service-role: funktionen tar restaurangen och bordet som argument och
  // kontrollerar själv att de hör ihop.
  const { data, error } = await supabase.rpc("create_reservation", {
    p_payload: {
      restaurant_id: input.restaurantId,
      table_id: input.tableId,
      at: input.at,
      party_size: input.partySize,
      guest_name: input.guestName.trim(),
      guest_phone: input.guestPhone?.trim() ?? "",
      guest_email: input.guestEmail?.trim() ?? "",
      guest_id: input.guestId ?? "",
      note: input.note?.trim() ?? "",
    },
  });

  if (error) {
    /*
     * Två gäster tryckte på samma tid inom samma sekund.
     *
     * Det är inte ett gränsfall utan det normala klockan sju en fredag, och
     * det är precis det exclude-villkoret finns för. Den som förlorade
     * kapplöpningen ska få veta att tiden är tagen — inte att något gick fel.
     */
    if (error.message.includes("SLOT_TAKEN")) return { ok: false, problem: "SLOT_TAKEN" };
    if (error.message.includes("SLOT_UNAVAILABLE")) return { ok: false, problem: "SLOT_TAKEN" };
    return { ok: false, problem: "UNKNOWN" };
  }

  const payload = data as { reservation_id: string; cancel_token: string } | null;
  if (!payload) return { ok: false, problem: "UNKNOWN" };

  return {
    ok: true,
    reservationId: payload.reservation_id,
    cancelToken: payload.cancel_token,
  };
}

export interface ReservationView {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  citySlug: string;
  tableNumber: string;
  zone: string | null;
  attributes: string[];
  startsAt: string;
  endsAt: string;
  partySize: number;
  guestName: string;
  status: string;
  surchargeOre: number;
  currency: string;
  /** Restaurangens tidszon. Bokningen visas i den, inte i gästens. */
  timeZone: string;
  note: string | null;
}

/**
 * En bokning, för kvittosidan.
 *
 * Kräver nyckeln. Id:t ensamt räcker inte — det ligger i en länk som kan
 * hamna var som helst, och en bokning bär gästens namn och telefonnummer.
 */
export async function reservationByToken(
  id: string,
  token: string,
): Promise<ReservationView | null> {
  const supabase = createAdminClient();

  // service-role: en enskild bokning, låst av både id och nyckel.
  const { data } = await supabase
    .from("reservations")
    .select(
      "id, restaurant_id, table_id, during, party_size, guest_name, status, surcharge_ore, note, restaurants!inner (name, slug, city_slug, currency, country), tables!inner (table_number, zone, attributes)",
    )
    .eq("id", id)
    .eq("cancel_token", token)
    .maybeSingle();

  if (!data) return null;

  const restaurant = data.restaurants as unknown as {
    name: string;
    slug: string;
    city_slug: string;
    currency: string;
    country: CountryCode;
  };
  const table = data.tables as unknown as {
    table_number: string;
    zone: string | null;
    attributes: string[] | null;
  };

  const range = parseRange(data.during as unknown as string);

  return {
    id: data.id,
    restaurantId: data.restaurant_id,
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
    citySlug: restaurant.city_slug,
    tableNumber: table.table_number,
    zone: table.zone,
    attributes: table.attributes ?? [],
    startsAt: range.start,
    endsAt: range.end,
    partySize: data.party_size,
    guestName: data.guest_name,
    status: data.status,
    surchargeOre: data.surcharge_ore,
    currency: restaurant.currency,
    /*
     * Tiden visas i RESTAURANGENS tidszon.
     *
     * En gäst som bokar från Stockholm ska se 19:00 om det är 19:00 i Sarajevo.
     * Klockslaget hör till bordet, inte till telefonen som tittar på det.
     */
    timeZone: COUNTRY_INFO[restaurant.country].timeZone,
    note: data.note,
  };
}

/** Avbokar med gästens egen nyckel. Falskt när bokningen redan är avbokad. */
export async function cancelReservation(id: string, token: string): Promise<boolean> {
  const supabase = createAdminClient();

  // service-role: funktionen kräver både id och nyckel och kan inte träffa
  // någon annans bokning.
  const { data, error } = await supabase.rpc("cancel_reservation", {
    p_id: id,
    p_token: token,
  });

  return !error && data === true;
}

/**
 * Läser `tstzrange` som PostgREST ger den: `["2026-08-26 19:00:00+00","...")`.
 *
 * Postgres serialiserar ett range som en sträng, och det finns ingen typad väg
 * runt det. Formen är stabil; det som varierar är klamrarna, och båda ändarna
 * kan vara inkluderande.
 */
function parseRange(raw: string): { start: string; end: string } {
  const inner = raw.replace(/^[[(]/, "").replace(/[\])]$/, "");
  const [start, end] = inner.split(",").map((part) => part.replace(/^"|"$/g, "").trim());

  return {
    start: start ? new Date(start).toISOString() : "",
    end: end ? new Date(end).toISOString() : "",
  };
}
