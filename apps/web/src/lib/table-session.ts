import "server-only";

import { cookies } from "next/headers";
import { verifyTableToken } from "@burp/core";
import { createAdminClient } from "./supabase/admin";
import { serverEnv } from "./env";

/**
 * Bordssession för QR-beställning (avsnitt 4.2).
 *
 * Gästen är inte inloggad och får aldrig vara det för att kunna beställa vid
 * bordet. Sessionen bärs av en cookie som pekar på en rad i `table_sessions`.
 * Flera gäster vid samma bord kan lägga till på samma nota genom att skanna
 * samma kod — de får var sin cookie mot samma session.
 *
 * All databasåtkomst här går via service role, eftersom en anonym gäst inte
 * har någon `auth.uid()` att skriva en RLS-policy mot. Varje fråga filtrerar
 * därför explicit på restaurant_id och session_id.
 */

const COOKIE_NAME = "burp_table_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 6; // En måltid, med marginal.

export interface TableContext {
  tableId: string;
  tableNumber: string;
  zone: string | null;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  city: string;
  isOpen: boolean;
  isLocked: boolean;
}

export type TableLookup =
  | { ok: true; table: TableContext }
  | { ok: false; reason: "INVALID_TOKEN" | "UNKNOWN_TABLE" | "TABLE_LOCKED" | "CLOSED" };

/**
 * Slår upp bordet bakom ett QR-token.
 *
 * Signaturen verifieras FÖRE databasfrågan. Ett påhittat token kostar då en
 * HMAC-beräkning i stället för en rundtur till Postgres (avsnitt 4.1).
 */
export async function lookupTable(token: string): Promise<TableLookup> {
  const publicId = await verifyTableToken(token, serverEnv().QR_TOKEN_SECRET);
  if (!publicId) {
    return { ok: false, reason: "INVALID_TOKEN" };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tables")
    .select(
      `
      id,
      table_number,
      zone,
      status,
      restaurant:restaurants!inner (
        id,
        name,
        slug,
        city,
        status
      )
    `,
    )
    .eq("qr_public_id", publicId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: "UNKNOWN_TABLE" };
  }

  const restaurant = data.restaurant as unknown as {
    id: string;
    name: string;
    slug: string;
    city: string;
    status: string;
  };

  if (data.status === "LOCKED") {
    return { ok: false, reason: "TABLE_LOCKED" };
  }

  const isOpen = restaurant.status === "ACTIVE" && (await isCurrentlyOpen(restaurant.id));
  if (!isOpen) {
    return { ok: false, reason: "CLOSED" };
  }

  return {
    ok: true,
    table: {
      tableId: data.id,
      tableNumber: data.table_number,
      zone: data.zone,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      city: restaurant.city,
      isOpen,
      isLocked: false,
    },
  };
}

/**
 * Hämtar den pågående notan vid bordet, eller startar en ny.
 *
 * En session är gemensam för bordet, inte för gästen. Sitter fyra personer och
 * äter delar de nota — det är så en restaurang fungerar och så gästen förväntar
 * sig att det ska bete sig.
 *
 * ⚠️ Får BARA anropas från en route handler eller server action. Funktionen
 * skriver en cookie, och Next.js tillåter inte cookie-skrivning under
 * rendering av en server component — den kastar
 * "Cookies can only be modified in a Server Action or Route Handler".
 *
 * Det är också rätt semantiskt: notan ska börja när någon beställer, inte när
 * någon råkar skanna koden i förbifarten. QR-sidan renderar menyn utan session;
 * POST /api/orders skapar den.
 */
export async function getOrCreateTableSession(table: TableContext): Promise<string> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("table_sessions")
    .select("id")
    .eq("table_id", table.tableId)
    .eq("status", "OPEN")
    .maybeSingle();

  const sessionId =
    existing?.id ??
    (
      await supabase
        .from("table_sessions")
        .insert({ table_id: table.tableId, restaurant_id: table.restaurantId, status: "OPEN" })
        .select("id")
        .single()
    ).data?.id;

  if (!sessionId) {
    throw new Error("Kunde inte skapa bordssession.");
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return sessionId;
}

/** Läser gästens bordssession ur cookien. Null om ingen finns. */
export async function currentTableSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

/**
 * Är restaurangen öppen just nu?
 *
 * Ett bord får bara ta emot order under öppettid (avsnitt 4.4). Kontrollen
 * ligger i databasen som en funktion, eftersom öppettider är en jämförelse mot
 * serverns klocka och gästens telefon inte får bestämma den.
 */
async function isCurrentlyOpen(restaurantId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("is_restaurant_open", {
    p_restaurant_id: restaurantId,
  });
  if (error) return false;
  return data === true;
}
