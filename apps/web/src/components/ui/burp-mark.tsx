/**
 * Burps vinjett — serveringsklockan och ordbilden.
 *
 * Förslag 4c ur `Burp Logo Concepts`, valt 2026-08-20. Ersatte pratbubblan
 * (förslag 1b, 2026-08-17). Bubblan betydde "samtal", vilket varenda chattapp
 * också betyder; klockan betyder **bordsservering**, som är det Burp faktiskt
 * säljer. Skillnaden mot 4a (kniv och gaffel) är just den: kniv och gaffel
 * betyder mat i allmänhet och sitter på hälften av matapparna i regionen.
 *
 * Valdes framför 4d (gaffel med bordsnummer), som är närmare QR-flödet men fel
 * för formatet: bordsnummer-badgen blir en röd gröt vid 32 px, och app-ikonen
 * ritas redan på en platta som iOS och Android maskar själva — en badge ovanpå
 * en rundad ruta inuti en maskad ikon blir mask på mask.
 *
 * Definieras en gång och används i varje sidhuvud: gästens, personalens,
 * kontots och backoffice. Innan den fanns ritade fyra filer var sitt "Burp" i
 * rubriktypsnittet, och den som ändrade en av dem lämnade de andra kvar.
 *
 * Klockan är dekor och döljs för uppläsaren — ordbilden bär namnet. Utan
 * ordbild måste den som anropar sätta ett `aria-label` på länken runt om,
 * annars läser skärmläsaren upp en tom länk.
 */

export type BurpMarkSize = "sm" | "md" | "lg";

/**
 * Höjd och bredd i px. Klockan är flackare än pratbubblan var — 40:34 mot
 * 40:36 — så höjderna är omräknade ur bredderna, inte tvärtom. Bredden är det
 * som styr: märket står i ett sidhuvud bredvid en meny, och det var breddens
 * fotavtryck som redan var inpassat.
 */
const SIZES: Record<BurpMarkSize, { w: number; h: number }> = {
  sm: { w: 26, h: 22 },
  md: { w: 34, h: 29 },
  lg: { w: 44, h: 37 },
};

const WORDMARK: Record<BurpMarkSize, string> = {
  sm: "text-[16px]",
  md: "text-[21px]",
  lg: "text-[27px]",
};

/**
 * Klockans kontur, direkt ur logotypförslaget. Tre delar i en och samma path:
 * handtaget, kupan och fatet.
 *
 * Ligger som en konstant och inte inbakad i komponenten därför att exakt samma
 * kurva ritas av `lib/brand-glyph.tsx` för favicon och app-ikonerna. Två
 * handskrivna kopior av samma kurva glider isär utan att någon ser det.
 *
 * **Alla tre delarna går medurs.** Med `fill-rule: nonzero` — webbläsarens och
 * Satoris förval — skulle handtaget stansa ett hål i kupan där de överlappar
 * om det ritades motsols. Vänder du på en båges sweep-flagga får du en vit
 * skåra i märket, och bara i de storlekar där överlappet är stort nog att se.
 *
 * Springan mellan kupan och fatet är 2,5 enheter och avsiktlig: den överlever
 * ned till 32 px favicon, där en tunnare linje suddas ut av rasterringen och
 * klockan blir en enda klump.
 */
export const CLOCHE_PATH =
  "M23.2 7a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0z" +
  "M3 26a17 17 0 0 1 34 0z" +
  "M2.5 28.5h35a2.5 2.5 0 0 1 0 5h-35a2.5 2.5 0 0 1 0-5z";

export const CLOCHE_VIEWBOX = "0 0 40 34";

export function BurpMark({
  size = "sm",
  /** Sätt false där bara märket får plats — telefonens sidhuvud, en avatarrad. */
  wordmark = true,
  className = "",
}: {
  size?: BurpMarkSize;
  wordmark?: boolean;
  className?: string;
}) {
  const { w, h } = SIZES[size];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={w}
        height={h}
        viewBox={CLOCHE_VIEWBOX}
        aria-hidden="true"
        className="shrink-0"
      >
        <path d={CLOCHE_PATH} className="fill-burp-600" />
      </svg>
      {wordmark ? <span className={`burp-wordmark ${WORDMARK[size]}`}>burp</span> : null}
    </span>
  );
}
