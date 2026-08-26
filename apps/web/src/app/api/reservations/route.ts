import { after, NextResponse } from "next/server";
import { z } from "zod";
import { notifyNewReservation } from "@/lib/notify";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createReservation, reservationSlots } from "@/lib/reservations";
import { createClient } from "@/lib/supabase/server";

/**
 * Bordsbokning.
 *
 * GET frågar efter lediga tider, POST bokar en av dem. Båda går genom
 * `reservation_slots()` i databasen, som är den ENDA uträkningen av vad som är
 * ledigt — sidan kan därför aldrig visa en tid som bokningen sedan nekar av
 * andra skäl än att någon annan hann före.
 *
 * ── Varför en route handler och inte en serveråtgärd ────────────────────────
 *
 * Bokningsformuläret sitter på restaurangsidan, som är cachad en timme för
 * SEO:ns skull. En serveråtgärd hade fungerat, men rate limitern och de riktiga
 * statuskoderna hör hemma här — och 409 för "någon hann före" är ett svar
 * klienten faktiskt behöver skilja från 400.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const slotsQuerySchema = z.object({
  /*
   * guid och inte uuid.
   *
   * z.uuid() kräver RFC 4122:s versionsbitar. Seed-datans id:n är syntetiska
   * (11111111-…) och faller på det, vilket gör hela bokningsflödet omöjligt att
   * prova lokalt — och en validering som bara accepterar produktionsdata är en
   * validering som aldrig testas.
   */
  restaurant: z.guid(),
  // Datum i restaurangens tidszon, inte en tidsstämpel.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party: z.coerce.number().int().min(1).max(50),
});

const bookSchema = z.object({
  restaurant_id: z.guid(),
  table_id: z.guid(),
  at: z.iso.datetime({ offset: true }),
  party_size: z.int().min(1).max(50),
  guest_name: z.string().trim().min(1).max(120),
  guest_phone: z.string().trim().max(40).optional(),
  guest_email: z.email().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional(),
});

/**
 * Felen gästen kan möta, med den statuskod som hör till.
 *
 * 409 skiljer "någon hann före" från allt annat: det är inte ett fel i
 * förfrågan, och klienten ska hämta nya tider i stället för att rätta något.
 */
const PROBLEM_STATUS: Record<string, number> = {
  DISABLED: 404,
  NO_NAME: 400,
  PARTY_TOO_SMALL: 400,
  PARTY_TOO_LARGE: 400,
  TOO_SOON: 400,
  TOO_FAR: 400,
  SLOT_TAKEN: 409,
  UNKNOWN: 500,
};

export async function GET(request: Request) {
  const ip = clientIp(request.headers);
  const limit = await rateLimit(`res-slots:${ip}`, RATE_LIMITS.reservationSlots);
  if (!limit.success) {
    return tooMany(limit.reset);
  }

  const url = new URL(request.url);
  const parsed = slotsQuerySchema.safeParse({
    restaurant: url.searchParams.get("restaurant"),
    date: url.searchParams.get("date"),
    party: url.searchParams.get("party"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, detail: "Förfrågan kunde inte tolkas." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const slots = await reservationSlots(
    parsed.data.restaurant,
    parsed.data.date,
    parsed.data.party,
  );

  return NextResponse.json(
    { ok: true, slots },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = await rateLimit(`res-book:${ip}`, RATE_LIMITS.reservationCreate);
  if (!limit.success) {
    return tooMany(limit.reset);
  }

  const parsed = bookSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, detail: "Förfrågan kunde inte tolkas." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  /*
   * En inloggad gäst får bokningen knuten till sitt konto.
   *
   * Den som inte är inloggad bokar ändå — kontot är en bekvämlighet för att
   * hitta bokningen igen under /konto, aldrig ett krav. Samma löfte som
   * QR-beställningen.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await createReservation({
    restaurantId: parsed.data.restaurant_id,
    tableId: parsed.data.table_id,
    at: parsed.data.at,
    partySize: parsed.data.party_size,
    guestName: parsed.data.guest_name,
    guestPhone: parsed.data.guest_phone,
    guestEmail: parsed.data.guest_email || undefined,
    guestId: user?.id ?? null,
    note: parsed.data.note,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, problem: result.problem },
      {
        status: PROBLEM_STATUS[result.problem] ?? 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  /*
   * Notisen går EFTER svaret.
   *
   * `after()` kör den när svaret redan lämnat servern, precis som för en ny
   * order. Gästen ska inte vänta på att ett brev skickas, och ett brev som
   * fastnar ska inte kunna fälla en bokning som redan står i databasen.
   */
  after(() => notifyNewReservation(result.reservationId));

  return NextResponse.json(
    {
      ok: true,
      reservation_id: result.reservationId,
      // Nyckeln går tillbaka EN gång, i svaret. Den är gästens bevis på att
      // bokningen är hens och det enda som låter henne avboka utan konto.
      cancel_token: result.cancelToken,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

function tooMany(reset: number) {
  return NextResponse.json(
    { ok: false, detail: "Vänta en stund och försök igen." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
      },
    },
  );
}
