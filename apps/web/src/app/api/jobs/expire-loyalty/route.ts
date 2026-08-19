import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bakgrundsjobbet som bokför utgångna lojalitetspoäng (migration 0042).
 *
 * Poängen har haft ett utgångsdatum sedan 0016 och `calculateBalance()` har
 * räknat bort dem, men ingen rad har någonsin skrivits. Loggen ska säga vad som
 * hänt — regel 7 bygger på att saldot går att räkna ur den.
 *
 * ── Åtkomst ─────────────────────────────────────────────────────────────────
 *
 * `CRON_SECRET` i en Bearer-header. Vercel Cron sätter den själv; lokalt får
 * den sättas för hand. Saknas hemligheten svarar rutten 503 i stället för att
 * köra öppet — ett jobb som vem som helst kan trigga är inte ett jobb, och det
 * här skriver rader i en logg som inte går att ta bort.
 *
 * Jämförelsen är i konstant tid. En vanlig `!==` läcker hur många tecken som
 * stämde genom hur lång tid den tar, och en hemlighet går att gissa tecken för
 * tecken på det sättet.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET saknas. Jobbet körs inte utan den." },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (!timingSafeEqual(provided, secret)) {
    return NextResponse.json({ error: "Ogiltig nyckel." }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc("expire_loyalty_points");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;

  return NextResponse.json(
    {
      ok: true,
      accountsTouched: Number(row?.["accounts_touched"] ?? 0),
      pointsExpired: Number(row?.["points_expired"] ?? 0),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Konstant tid för strängar av samma längd.
 *
 * Längden läcker fortfarande, och det är avsiktligt: att jämföra olika långa
 * strängar teckenvis kräver att man ändå avslöjar något, och längden på en
 * hemlighet är inte det som gör den gissningsbar.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
