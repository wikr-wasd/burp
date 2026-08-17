import { BUBBLE_PATH, BUBBLE_VIEWBOX } from "@/components/ui/burp-mark";

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
 * Kurvan importeras däremot — `BUBBLE_PATH` är samma bézier som gränssnittet
 * ritar. En handskriven kopia hade glidit isär utan att någon såg det.
 *
 * Plattan ritas fylld ut i kanterna, utan rundade hörn. iOS och Android lägger
 * på sin egen mask; ritar vi hörnen själva syns de två gångerna som en ojämn
 * kant. Bubblan är vit på röd platta, precis som i logotypförslaget.
 */

/** `--color-burp-600` i `globals.css`. */
export const BRAND_RED = "#dc2626";

/** `--color-burp-700`. Gradientens mörka ände, samma som märkets hover. */
export const BRAND_RED_DARK = "#b91c1c";

/** `--background`. Papperstonen bakom allt. */
export const BRAND_PAPER = "#f3f4f6";

export function BurpGlyph({ size }: { size: number }) {
  // 0,58 av kanten fyller plattan utan att bubblan tuggar i kanten när
  // Androids mask kapar hörnen.
  const bubble = Math.round(size * 0.58);

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
        width={bubble}
        height={Math.round((bubble * 36) / 40)}
        viewBox={BUBBLE_VIEWBOX}
      >
        <path d={BUBBLE_PATH} fill="#ffffff" />
      </svg>
    </div>
  );
}
