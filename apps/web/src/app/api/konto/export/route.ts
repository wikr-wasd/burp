import { NextResponse } from "next/server";
import { exportGuestData } from "@/lib/gdpr";
import { getGuest } from "@/lib/guest";

/**
 * Gästens kopia på sina uppgifter (artikel 15 och 20).
 *
 * Egen rutt och inte en server action: det som ska hända är en NEDLADDNING, och
 * en action returnerar data till sidan i stället för en fil. Rutten sätter
 * `Content-Disposition` och webbläsaren gör resten.
 *
 * Ingen `userId` i URL:en, med flit. Id:t hämtas ur den verifierade sessionen —
 * en parameter hade varit en inbjudan att prova någon annans.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const guest = await getGuest();

  if (!guest) {
    // 401 och inte en redirect. Den som anropar rutten direkt ska få veta att
    // det var inloggningen som saknades, inte hamna på ett formulär.
    return NextResponse.json({ error: "Du måste vara inloggad." }, { status: 401 });
  }

  let data: unknown;
  try {
    data = await exportGuestData(guest.userId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Exporten kunde inte skapas." },
      { status: 500 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="burp-${today}.json"`,
      // Filen innehåller allt Burp vet om en person. Den ska inte ligga kvar i
      // en delad cache, och inte i webbläsarens historik heller.
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex",
    },
  });
}
