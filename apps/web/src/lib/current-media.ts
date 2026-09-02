import { parseImageAdjust, type ImageAdjust } from "@burp/core";

/**
 * Vilken medierad är den bild som faktiskt visas?
 *
 * En rätt kan ha flera rader i `media`: en godkänd som gästen ser, och en
 * nyare som väntar på granskning. Justeringsreglaget måste peka på rätt av
 * dem, annars drar ägaren i en bild ingen ser.
 *
 * Regeln är godkänd först, därefter nyast. En väntande bild går att justera
 * i förväg — `sync_media_adjustment()` (migration 0063) skriver ändå ingenting
 * förrän den godkänts.
 */

export interface MediaRow {
  id: string;
  status: string;
  created_at: string;
  focal_x?: number | null;
  focal_y?: number | null;
  brightness?: number | null;
  contrast?: number | null;
  saturation?: number | null;
}

export interface CurrentMedia {
  id: string;
  adjust: ImageAdjust;
}

export function currentMedia(rows: readonly MediaRow[]): CurrentMedia | null {
  if (rows.length === 0) return null;

  const [best] = [...rows].sort((a, b) => {
    const approved = Number(b.status === "APPROVED") - Number(a.status === "APPROVED");
    if (approved !== 0) return approved;
    return b.created_at.localeCompare(a.created_at);
  });

  if (!best) return null;

  return {
    id: best.id,
    adjust: parseImageAdjust({
      focal_x: best.focal_x,
      focal_y: best.focal_y,
      brightness: best.brightness,
      contrast: best.contrast,
      saturation: best.saturation,
    }),
  };
}
