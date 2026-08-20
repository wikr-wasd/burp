import "server-only";

import { cookies } from "next/headers";
import {
  COUNTRY_INFO,
  verifyTableToken,
  type CountryCode,
  type CurrencyCode,
} from "@burp/core";
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
  /** Restaurangens land, valuta och tidszon — styr priser och meny vid bordet. */
  country: CountryCode;
  currency: CurrencyCode;
  timeZone: string;
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
        status,
        country,
        currency
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
    country: CountryCode;
    currency: CurrencyCode;
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
      country: restaurant.country,
      currency: restaurant.currency,
      timeZone: COUNTRY_INFO[restaurant.country].timeZone,
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

  /*
   * Uppslaget och skapandet sker i databasen, i en transaktion.
   *
   * Två skäl, båda funna som riktiga fel:
   *
   *   1. En kapplöpning. Koden här läste "finns ingen session" och skapade en.
   *      Två gäster som skannade samtidigt gjorde båda det, och det unika
   *      indexet fångade den andra — som ett fel. Gästen fick en 500:a i
   *      stället för en nota.
   *
   *   2. Ingen utgång. Sessionen återanvändes i evighet, och eftersom den är
   *      det som bevisar åtkomst till ett kvitto kunde nästa sällskap vid
   *      bordet läsa förra sällskapets order.
   */
  const { data: sessionId, error } = await supabase.rpc("open_table_session", {
    p_table_id: table.tableId,
    p_restaurant_id: table.restaurantId,
  });

  if (error || typeof sessionId !== "string") {
    throw new Error(`Kunde inte öppna bordssession: ${error?.message ?? "okänt fel"}`);
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
 * Den senaste order i gästens bordssession som ännu inte är avslutad.
 *
 * Menyn använder den för att visa en väg tillbaka till kvittot. Utan den är
 * rundturen enkelriktad: kvittot leder till menyn, men den som skannat om
 * dekalen eller tappat fliken kommer aldrig tillbaka till sin egen nota.
 *
 * `restaurantId` filtreras trots att sessionen redan pekar ut ett bord. Varje
 * fråga som går via service role måste filtrera själv — sessionen kommer ur en
 * cookie, och en cookie är gästens att ändra på.
 *
 * `DRAFT` räknas inte. En kortorder som aldrig betalades är inte en pågående
 * beställning, och en banner om den hade legat kvar och lovat något som inte
 * finns.
 */
export async function ongoingTableOrderId(restaurantId: string): Promise<string | null> {
  const sessionId = await currentTableSessionId();
  if (!sessionId) return null;

  const supabase = createAdminClient();

  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("table_session_id", sessionId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["PLACED", "ACCEPTED", "PREPARING", "READY"])
    .order("placed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
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
