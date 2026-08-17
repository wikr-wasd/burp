/**
 * Burps vinjett — pratbubblan och ordbilden.
 *
 * Förslag 1b ur `Burp Logo Concepts`, valt 2026-08-17. Pratbubblan betyder
 * beställning och samtal vid bordet, vilket är vad produkten faktiskt gör —
 * och den har en siluett som håller ner till en 32 px favicon, till skillnad
 * från graffitiförslagen med hård skugga och droppar.
 *
 * Definieras en gång och används i varje sidhuvud: gästens, personalens,
 * kontots och backoffice. Innan den fanns ritade fyra filer var sitt "Burp" i
 * rubriktypsnittet, och den som ändrade en av dem lämnade de andra kvar.
 *
 * Bubblan är dekor och döljs för uppläsaren — ordbilden bär namnet. Utan
 * ordbild måste den som anropar sätta ett `aria-label` på länken runt om,
 * annars läser skärmläsaren upp en tom länk.
 */

export type BurpMarkSize = "sm" | "md" | "lg";

/** Höjd och bredd i px. Bubblan är bredare än hög, som i förslaget. */
const MARK: Record<BurpMarkSize, { w: number; h: number }> = {
  sm: { w: 26, h: 23 },
  md: { w: 34, h: 31 },
  lg: { w: 44, h: 40 },
};

const WORDMARK: Record<BurpMarkSize, string> = {
  sm: "text-[16px]",
  md: "text-[21px]",
  lg: "text-[27px]",
};

/**
 * Bubblans kontur, direkt ur logotypförslaget.
 *
 * Ligger som en konstant och inte inbakad i komponenten därför att exakt samma
 * kurva ritas av `lib/brand-glyph.tsx` för favicon och app-ikonerna. Två
 * handskrivna kopior av en bézierkurva glider isär utan att någon ser det.
 */
export const BUBBLE_PATH =
  "M20 0C9 0 0 7.5 0 17c0 5 2.6 9.5 7 12.5L4 36l10.5-4.3c1.7.3 3.6.5 5.5.5 11 0 20-7.5 20-17S31 0 20 0z";

export const BUBBLE_VIEWBOX = "0 0 40 36";

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
  const { w, h } = MARK[size];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={w}
        height={h}
        viewBox={BUBBLE_VIEWBOX}
        aria-hidden="true"
        className="shrink-0"
      >
        <path d={BUBBLE_PATH} className="fill-burp-600" />
      </svg>
      {wordmark ? <span className={`burp-wordmark ${WORDMARK[size]}`}>burp</span> : null}
    </span>
  );
}
