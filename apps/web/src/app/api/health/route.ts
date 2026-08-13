import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Hälsokontroll. Kollar att appen svarar OCH att databasen går att nå —
 * en check som bara returnerar 200 utan att röra beroendena säger ingenting.
 */
export async function GET() {
  const startedAt = Date.now();

  let database: "ok" | "error" = "error";
  let databaseError: string | null = null;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("restaurants").select("id", { head: true, count: "exact" });
    if (error) {
      databaseError = error.message;
    } else {
      database = "ok";
    }
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "okänt fel";
  }

  const healthy = database === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      ...(databaseError ? { databaseError } : {}),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
