/**
 * Bildjustering — vad en restaurang får göra med sin egen bild.
 *
 * Restaurangen fotograferar med telefon. Bilderna blir mörka, sneda och
 * ojämna, och en beskärning som alltid utgår från mitten kapar toppen av en
 * hög tallrik.
 *
 * Det här är MEDVETET inte ett filter. Ett filter konkurrerar med maten, och
 * femton restauranger med var sitt filter gör startsidans rutnät spretigt —
 * det rutnätet är Burps yta, inte restaurangens. Det som finns här är de fyra
 * justeringar som gör en dålig bild rättvis i stället för annorlunda.
 *
 * Gränserna är inte kosmetik. Inom ±15 % kan en bild inte bli en annan bild,
 * och det är precis därför en ändrad justering inte behöver gå genom
 * granskningen på nytt. Samma gränser står som check-constraints i migration
 * 0063 — ändras den ena måste den andra följa med, av samma skäl som
 * `allowed_vat_rates()` och `COUNTRY_INFO`.
 */

/** Nedre och övre gräns för de tre färgreglagen, i procent. */
export const ADJUST_MIN = 85;
export const ADJUST_MAX = 115;

export interface ImageAdjust {
  /** Vågrät fokuspunkt i procent av bredden. 50 = mitten. */
  focalX: number;
  /** Lodrät fokuspunkt i procent av höjden. 50 = mitten. */
  focalY: number;
  brightness: number;
  contrast: number;
  saturation: number;
}

export const DEFAULT_IMAGE_ADJUST: ImageAdjust = {
  focalX: 50,
  focalY: 50,
  brightness: 100,
  contrast: 100,
  saturation: 100,
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  // `null` MÅSTE fångas före Number(): `Number(null)` är 0, och en tom kolumn
  // hade då klämts till nedre gränsen i stället för att läsas som orörd. En
  // bild utan justering blev 85 % ljusstyrka — mörkare än originalet.
  if (value === null || value === undefined || value === "") return fallback;

  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Läser justeringen ur den jsonb-kolumn som ligger bredvid bildpekaren.
 *
 * Tar emot vad som helst med flit. Kolumnen är `jsonb` och kan i teorin bära
 * en gammal form eller skräp; en bild som inte går att justera ska visas
 * orörd, aldrig försvinna. Nycklarna är i snake_case eftersom de kommer
 * direkt ur databasen.
 */
export function parseImageAdjust(raw: unknown): ImageAdjust {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return DEFAULT_IMAGE_ADJUST;
  }

  const o = raw as Record<string, unknown>;

  return {
    focalX: clamp(o.focal_x ?? o.focalX, 0, 100, 50),
    focalY: clamp(o.focal_y ?? o.focalY, 0, 100, 50),
    brightness: clamp(o.brightness, ADJUST_MIN, ADJUST_MAX, 100),
    contrast: clamp(o.contrast, ADJUST_MIN, ADJUST_MAX, 100),
    saturation: clamp(o.saturation, ADJUST_MIN, ADJUST_MAX, 100),
  };
}

/** Sant när ingenting avviker från standard — då ska ingen stil sättas alls. */
export function isDefaultAdjust(adjust: ImageAdjust): boolean {
  return (
    adjust.focalX === 50 &&
    adjust.focalY === 50 &&
    adjust.brightness === 100 &&
    adjust.contrast === 100 &&
    adjust.saturation === 100
  );
}

/**
 * Justeringen som den ska skickas till databasen, eller null när den är orörd.
 *
 * NULL och inte fem standardvärden: "orörd" ska vara frånvaro av data, inte
 * fem tal som råkar vara 50 och 100. `media_adjust_json()` i migration 0063
 * gör samma bedömning åt andra hållet.
 */
export function toAdjustColumns(adjust: ImageAdjust): {
  focal_x: number;
  focal_y: number;
  brightness: number;
  contrast: number;
  saturation: number;
} {
  return {
    focal_x: clamp(adjust.focalX, 0, 100, 50),
    focal_y: clamp(adjust.focalY, 0, 100, 50),
    brightness: clamp(adjust.brightness, ADJUST_MIN, ADJUST_MAX, 100),
    contrast: clamp(adjust.contrast, ADJUST_MIN, ADJUST_MAX, 100),
    saturation: clamp(adjust.saturation, ADJUST_MIN, ADJUST_MAX, 100),
  };
}

/**
 * De två CSS-värden en justerad bild behöver.
 *
 * `filter` utelämnas helt när färgen är orörd. En `filter`-egenskap skapar en
 * ny stackningskontext även när den inte ändrar något, och det räcker för att
 * bryta en `position: sticky` eller en skugga i ett förälderled — en kostnad
 * utan nytta på de allra flesta bilder.
 *
 * Strängen är CSS, men talen är råa: en klient som inte ritar CSS läser
 * `ImageAdjust` direkt och struntar i det här.
 */
export function imageAdjustStyle(adjust: ImageAdjust): {
  objectPosition: string;
  filter?: string;
} {
  const parts: string[] = [];

  if (adjust.brightness !== 100) parts.push(`brightness(${adjust.brightness}%)`);
  if (adjust.contrast !== 100) parts.push(`contrast(${adjust.contrast}%)`);
  if (adjust.saturation !== 100) parts.push(`saturate(${adjust.saturation}%)`);

  return {
    objectPosition: `${adjust.focalX}% ${adjust.focalY}%`,
    ...(parts.length > 0 ? { filter: parts.join(" ") } : {}),
  };
}
