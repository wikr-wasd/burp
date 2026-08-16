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
 * Paletten är matnära och varm: apelsin, paprika, saffran, kanel, chili.
 *
 * Inga blå eller gröna toner. Oliv fanns här från början och såg rimlig ut i
 * en lista — men på startsidans collage, tre bilder bredvid varandra, blev en
 * grön tallrik omedelbart det öga fastnade på, och den läste som möglig. Grönt
 * fungerar som ingrediens i ett fotografi och inte alls som hel yta.
 *
 * Tonerna dämpades när designspråket byttes. Två skäl, båda synliga:
 *
 * 1. **Rödbetan var rosa.** `#831843` är magenta i praktiken, och Burp använder
 *    uttryckligen inte designsystemets rosa (se docs/DESIGN.md). I en lista
 *    blev den dessutom den enda kalla plattan bland sex varma.
 * 2. **Tomaten konkurrerade med handlingsfärgen.** `#b91c1c` ligger så nära
 *    `--burp-600` (`#dc2626`) att en tallrik läste som en stor knapp. Ett kort
 *    ska ha exakt en röd yta man kan trycka på, och det är "Lägg till".
 *
 * Den gamla paletten ritades dessutom mot varmt papper. På den grå/vita ytan
 * blev samma mättnad för tung — plattorna vann över maten de skulle föreställa.
 */
const PALETTE: readonly [string, string][] = [
  ["#c96f3f", "#9a4f2a"], // bränd apelsin
  ["#c1553d", "#94382a"], // paprika
  ["#c58f36", "#96631f"], // saffran
  ["#ab7a3e", "#7d5427"], // brynt smör
  ["#b06246", "#7f4029"], // tegel
  ["#8f6742", "#63452a"], // kanel
  ["#a85a52", "#7a3a35"], // torkad chili
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

  /*
   * Motivet: en tallrik sedd uppifrån, med mat på.
   *
   * Första versionen var en gradient med rättens initial i 180 punkter. Den
   * gjorde jobbet — ingen tom ruta — men på startsidan, där tre av dem ligger
   * bredvid varandra som första intryck, läste de som platshållare snarare än
   * som mat. En marknadsplats vars förstaskärm ser oifylld ut är svår att ta
   * på allvar.
   *
   * Formerna räknas ur namnet och är därmed desamma varje gång. De ska antyda
   * mat på en tallrik utan att låtsas vara ett fotografi: en restaurang som
   * laddat upp en riktig bild ska alltid se bättre ut än en som inte gjort det.
   */
  const plate = 250;

  // Fem oregelbundna klickar innanför tallriken. Vinkel och storlek härleds ur
  // hashen, så samma rätt får samma anrättning.
  const morsels = Array.from({ length: 5 }, (_, i) => {
    const angle = ((seed >> (i * 3)) % 360) * (Math.PI / 180);
    const distance = 60 + ((seed >> (i * 5)) % 90);
    const radius = 42 + ((seed >> (i * 7)) % 46);

    return {
      cx: 400 + Math.cos(angle) * distance,
      cy: 300 + Math.sin(angle) * distance * 0.8,
      rx: radius,
      ry: radius * (0.62 + ((seed >> (i * 11)) % 40) / 100),
      rotate: (seed >> (i * 13)) % 180,
      opacity: 0.14 + ((seed >> (i * 2)) % 12) / 100,
    };
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" role="img" aria-label="${escapeXml(name)}">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="plate">
      <stop offset="0%" stop-color="rgba(255,255,255,0.16)"/>
      <stop offset="70%" stop-color="rgba(255,255,255,0.09)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.03)"/>
    </radialGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${seed % 100}"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
    </filter>
    <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>

  <rect width="800" height="600" fill="url(#g)"/>

  <!-- Tallriken. Ljusare i mitten, som porslin under en lampa. -->
  <circle cx="400" cy="300" r="${plate}" fill="url(#plate)"/>
  <circle cx="400" cy="300" r="${plate}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
  <circle cx="400" cy="300" r="${plate - 46}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1.5"/>

  <!-- Maten. Mjuka kanter, för att inget på en tallrik har skarpa. -->
  <g filter="url(#soft)">
    ${morsels
      .map(
        (m) =>
          `<ellipse cx="${m.cx.toFixed(1)}" cy="${m.cy.toFixed(1)}" rx="${m.rx}" ry="${m.ry.toFixed(1)}" ` +
          `transform="rotate(${m.rotate} ${m.cx.toFixed(1)} ${m.cy.toFixed(1)})" ` +
          `fill="rgba(255,255,255,${m.opacity.toFixed(2)})"/>`,
      )
      .join(" ")}
  </g>

  <!-- Korn ovanpå alltihop. En slät gradient ser digital ut; kornet drar den
       närmare tryck, vilket är designspråkets utgångspunkt. -->
  <rect width="800" height="600" filter="url(#grain)"/>

  <!-- Initialen som liten märkning nere till vänster, inte som motiv. Den ska
       hjälpa den som letar i en lång lista, inte dominera bilden. -->
  <text x="46" y="554" font-family="Georgia, 'Iowan Old Style', serif" font-size="64"
        fill="rgba(255,255,255,0.30)">${escapeXml(initial)}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      /*
       * Cachas hårt men inte för evigt.
       *
       * Stod tidigare som `immutable` i ett år, med motiveringen att bilden är
       * en ren funktion av namnet. Det stämmer för ett givet motiv — men inte
       * över tid: när motivet gjordes om från en bokstavsplatta till en
       * tallrik hade varje återvändande besökare fortsatt se den gamla i upp
       * till ett år, utan något sätt att tvinga fram den nya.
       *
       * Ett dygn med `stale-while-revalidate` ger samma snabbhet i praktiken —
       * bilden hämtas om i bakgrunden, aldrig i gästens väg — och gör en
       * framtida omgörning möjlig utan att byta URL.
       */
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
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
