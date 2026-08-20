import { ImageResponse } from "next/og";
import { BurpGlyph, GLYPH_FILL } from "@/lib/brand-glyph";

/**
 * Favicon. Genereras i stället för att checkas in som binärfil, så att
 * märkesfärgen bara står på ett ställe och ikonen inte kan glida isär från
 * resten av gränssnittet.
 *
 * Att den ändå gjorde det är hela skälet till den här kommentaren: färgbytet
 * till 123Connect-systemet nådde `globals.css` men inte de fyra genererade
 * ikonerna, som låg kvar på den redaktionella formens tegelröda `#c2410c` i
 * månader. En ikon som ingen ser i utvecklingsläget glider isär tyst.
 *
 * Ritas med `GLYPH_FILL.TAB` och inte med app-ikonernas marginal: flikens
 * ikon maskas inte av något operativsystem, så marginalen skulle bara äta av
 * de 32 pixlar som finns. Vid 58 % försvann serveringsklockans handtag helt.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<BurpGlyph size={size.width} fill={GLYPH_FILL.TAB} />, size);
}
