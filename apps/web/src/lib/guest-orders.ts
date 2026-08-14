import { cookies } from "next/headers";

/**
 * Vilka beställningar den här webbläsaren har lagt.
 *
 * En avhämtningsgäst är anonym — det finns inget `auth.uid()` att fråga efter.
 * Kvittosidan måste ändå kunna avgöra om just den här gästen får se just den
 * här ordern, annars räcker det att gissa ett order-id för att läsa någon
 * annans beställning.
 *
 * Lösningen speglar den som bordsflödet redan använder: en cookie knyter
 * gästen till sina egna order. Skyddet vilar på att order-id är ett
 * slumpat UUID (122 bitar) — precis som `table_session_id` gör i bordsflödet.
 * Cookien är `httpOnly` så att sidans egen JavaScript inte kan läsa den.
 */

const COOKIE_NAME = "burp_orders";

/** Ungefär ett dygn. Ett kvitto är inte intressant längre än så. */
const MAX_AGE_SECONDS = 60 * 60 * 24;

/**
 * Fler än så behöver ingen gäst ha samtidigt, och taket håller cookien långt
 * under webbläsarnas 4 kB. Äldsta ordern faller ur först.
 */
const MAX_REMEMBERED = 20;

/** Riktig UUID-form, inte bara "36 tecken ur rätt alfabet". */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").filter((value) => UUID.test(value));
}

/**
 * Lägger ordern till gästens lista.
 *
 * Får bara anropas från en route handler eller en server action — Next.js
 * tillåter inte cookie-skrivning under render av en server-komponent.
 */
export async function rememberGuestOrder(orderId: string): Promise<void> {
  const cookieStore = await cookies();
  const existing = parse(cookieStore.get(COOKIE_NAME)?.value);

  // Nyast först, utan dubbletter.
  const next = [orderId, ...existing.filter((id) => id !== orderId)].slice(0, MAX_REMEMBERED);

  cookieStore.set(COOKIE_NAME, next.join(","), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Har den här webbläsaren lagt ordern? */
export async function guestOwnsOrder(orderId: string): Promise<boolean> {
  const cookieStore = await cookies();
  return parse(cookieStore.get(COOKIE_NAME)?.value).includes(orderId);
}
