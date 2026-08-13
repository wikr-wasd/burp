import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Utloggning.
 *
 * POST och inte GET. En GET-utloggning kan triggas av vilken bild eller länk
 * som helst på en annan sida — en förbipasserande kollega kan logga ut hela
 * köksskärmen mitt i lunchrushen genom att skicka en länk.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/logga-in", request.url), {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}
