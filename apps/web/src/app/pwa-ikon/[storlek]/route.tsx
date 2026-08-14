import { ImageResponse } from "next/og";

/**
 * Ikonerna som `manifest.ts` pekar på.
 *
 * Android kräver minst 192 px för att erbjuda installation, och 512 px för
 * startskärmen. De genereras i stället för att checkas in som binärfiler, av
 * samma skäl som favicon: färgen ska bara stå på ett ställe.
 *
 * Storleken valideras mot en fast lista. Utan den kan vem som helst be om
 * `/pwa-ikon/20000` och låta servern rita en bild på 400 miljoner pixlar.
 */

const ALLOWED_SIZES = new Set([192, 512]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storlek: string }> },
) {
  const { storlek } = await params;
  const size = Number(storlek);

  if (!ALLOWED_SIZES.has(size)) {
    return new Response("Okänd ikonstorlek.", { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#c2410c",
          color: "#ffffff",
          fontSize: Math.round(size * 0.64),
          fontWeight: 700,
        }}
      >
        B
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        // Ikonerna ändras bara när färgen ändras. Låt dem cachas hårt.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
