/**
 * Platshållarbilder för mat.
 *
 * En restaurang som just anslutit har inga bilder. Alternativet till en
 * platshållare är en tom grå ruta, och en meny full av tomma rutor ser trasig
 * ut — inte ofärdig, trasig. Den här ritar i stället något som hör ihop med
 * rätten: en varm ton härledd ur namnet, med rättens initial.
 *
 * Bilden genereras som SVG i farten. Ingen fil att lagra, inget CDN att
 * konfigurera, inga upphovsrättsfrågor — och den ser likadan ut varje gång
 * eftersom färgen räknas ur namnet, inte slumpas.
 *
 * Riktiga bilder ersätter den så fort restaurangen laddat upp en och Burp
 * godkänt den (avsnitt 8.3).
 */

export const dynamic = "force-static";

/**
 * Paletten är matnära och varm: tomat, saffran, oliv, aubergine, bränd lera.
 * Inga blå eller gröna toner som får mat att se kall ut.
 */
const PALETTE: readonly [string, string][] = [
  ["#c2410c", "#7c2d12"], // bränd apelsin
  ["#b91c1c", "#7f1d1d"], // tomat
  ["#a16207", "#713f12"], // saffran
  ["#4d7c0f", "#365314"], // oliv
  ["#9a3412", "#601a0a"], // paprika
  ["#78350f", "#451a03"], // kanel
  ["#831843", "#500724"], // rödbeta
];

/** Stabil hash. Samma namn ska alltid ge samma färg, även efter omstart. */
function hash(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i++) {
    value = (value * 31 + input.charCodeAt(i)) >>> 0;
  }
  return value;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ namn: string }> },
) {
  const { namn } = await context.params;
  const name = decodeURIComponent(namn).slice(0, 80);

  const seed = hash(name);
  const [from, to] = PALETTE[seed % PALETTE.length]!;

  // Första bokstaven, versal. Fungerar för latinska och kyrilliska namn.
  const initial = [...name.trim()][0]?.toUpperCase() ?? "•";

  // Vinkeln varieras så att två rätter bredvid varandra inte ser identiska ut.
  const angle = (seed % 4) * 30;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" role="img" aria-label="${escapeXml(name)}">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${seed % 100}"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
    </filter>
  </defs>

  <rect width="800" height="600" fill="url(#g)"/>

  <!-- Korn ovanpå ytan. En helt slät gradient ser digital ut; kornet gör den
       närmare tryck, vilket är hela designspråkets utgångspunkt. -->
  <rect width="800" height="600" filter="url(#grain)"/>

  <!-- Två tallriksringar, svagt antydda. Ger bilden ett motiv utan att låtsas
       vara ett fotografi av något den inte är. -->
  <circle cx="400" cy="300" r="200" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
  <circle cx="400" cy="300" r="150" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="2"/>

  <text x="400" y="300" text-anchor="middle" dominant-baseline="central"
        font-family="Georgia, 'Iowan Old Style', serif" font-size="180"
        fill="rgba(255,255,255,0.92)">${escapeXml(initial)}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Bilden är ren funktion av namnet och ändras aldrig. Cacha hårt.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

/** SVG är XML. Ett & eller < i ett rättnamn gör annars dokumentet ogiltigt. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
