import { CLOCHE_PATH, CLOCHE_VIEWBOX } from "@/components/ui/burp-mark";

/**
 * Märket ritat för `next/og` — favicon, iOS-ikon och PWA-ikonerna.
 *
 * Skilt från `<BurpMark>` i `components/ui`, som är HTML med klasser ur
 * `globals.css`. Satori, som ritar bilderna, känner varken till Tailwind eller
 * CSS-variabler och behöver inline-stilar och råa hexvärden. Det är därför
 * färgerna står här som konstanter i stället för att läsas ur temat — och
 * därför de måste ändras på båda ställena samtidigt.
 *
 * Att de kan glida isär är inte en teori: färgbytet till 123Connect-systemet
 * nådde `globals.css` men inte de fyra genererade ikonerna, som låg kvar på
 * den redaktionella formens `#c2410c`.
 *
 * Kurvan importeras däremot — `CLOCHE_PATH` är samma kontur som gränssnittet
 * ritar. En handskriven kopia hade glidit isär utan att någon såg det.
 *
 * Plattan ritas fylld ut i kanterna, utan rundade hörn. iOS och Android lägger
 * på sin egen mask; ritar vi hörnen själva syns de två gångerna som en ojämn
 * kant. Klockan är vit på röd platta, precis som i logotypförslaget.
 */

/** `--color-burp-600` i `globals.css`. */
export const BRAND_RED = "#dc2626";

/** `--color-burp-700`. Gradientens mörka ände, samma som märkets hover. */
export const BRAND_RED_DARK = "#b91c1c";

/** `--background`. Papperstonen bakom allt. */
export const BRAND_PAPER = "#f3f4f6";

/**
 * Andel av plattans kant som klockan fyller.
 *
 * `MASKED` gäller ikoner som operativsystemet maskar själv — iOS rundade
 * hörn, Androids maskable-beskärning. Marginalen är inte estetik: Android
 * kapar upp till en femtedel av kanten, och utan den tuggar fatet i kanten.
 *
 * `TAB` gäller faviconen, som **inte** maskas — den ritas rakt av i flikens
 * 32×32. Där är samma marginal bara bortkastade pixlar, och det märks:
 * klockans handtag är 3,2 av 34 enheter, alltså under en pixel vid 58 % av
 * 32 px. Pratbubblan som låg här före 2026-08-20 var en enda klump och tålde
 * det; en form med inre detaljer gör det inte.
 */
export const GLYPH_FILL = { MASKED: 0.58, TAB: 0.78 } as const;

export function BurpGlyph({ size, fill = GLYPH_FILL.MASKED }: { size: number; fill?: number }) {
  const glyph = Math.round(size * fill);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${BRAND_RED}, ${BRAND_RED_DARK})`,
      }}
    >
      <svg
        width={glyph}
        height={Math.round((glyph * 34) / 40)}
        viewBox={CLOCHE_VIEWBOX}
      >
        <path d={CLOCHE_PATH} fill="#ffffff" />
      </svg>
    </div>
  );
}
