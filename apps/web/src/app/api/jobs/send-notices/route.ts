import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { sendPendingNotices } from "@/lib/notify";

/**
 * Bakgrundsjobbet som tömmer notiskön (migration 0049).
 *
 * Raderna skrivs av en trigger i samma transaktion som statusändringen, så
 * jobbet kan aldrig missa en notis — bara vara sen med den. Det är den
 * avvägning som valdes 2026-08-22: köksskärmen skriver direkt mot Supabase, och
 * en rutt framför den hade upprepat RLS-kontroller som redan finns.
 *
 * ── Takten: en gång per dygn, och vad det betyder ───────────────────────────
 *
 * `vercel.json` schemalade det här jobbet varje minut fram till 2026-08-28.
 * Vercels Hobby-plan tillåter **en gång per dygn** och avvisar ett tätare
 * uttryck redan vid deploy, så schemat är `0 5 * * *`. Beslutat av William
 * 2026-08-28 efter att alternativen lagts fram.
 *
 * Säg vad det innebär rakt ut: **kön töms en gång i dygnet.** Kön är det enda
 * som tömmer den — ingen annan kodväg anropar `sendPendingNotices()` — så en
 * gäst vars order blir klar 12:00 får sitt besked runt 05:00 dagen efter.
 * Både notisen och brevet ligger i samma jobb, alltså gäller det båda.
 *
 * "Sen med den" är i den här takten inte skilt från "missar den": beskedet
 * handlar om mat som står färdig nu. Funktionen är alltså i praktiken av i
 * produktion tills planen tillåter en tätare takt, och raden ska ställas
 * tillbaka till `* * * * *` samma dag kontot blir Pro. Se docs/TODO.md.
 *
 * Lokalt gäller ingenting av detta — jobbet triggas för hand och av
 * `smoke.sh`, som kör det direkt och mäter utfallet.
 *
 * ── Åtkomst ─────────────────────────────────────────────────────────────────
 *
 * `CRON_SECRET` i en Bearer-header, som poängjobbet. Saknas hemligheten svarar
 * rutten 503 i stället för att köra öppet — den här rutten skickar brev till
 * riktiga människor, och den som kan trigga den kan skicka dem om och om igen.
 *
 * Jämförelsen är i konstant tid. En vanlig `!==` läcker hur många tecken som
 * stämde genom hur lång tid den tar.
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

  const run = await sendPendingNotices();

  return NextResponse.json({ ok: true, ...run });
}

/**
 * Jämför två strängar utan att avslöja var de börjar skilja sig.
 *
 * Kopian står här och inte i en delad modul med flit: den är sex rader, och
 * att importera den mellan två jobbrutter hade gjort en säkerhetsdetalj till
 * ett beroende någon kan råka bryta. Samma funktion finns i
 * `expire-loyalty/route.ts`.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}
