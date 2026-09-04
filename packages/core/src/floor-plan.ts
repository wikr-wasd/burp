/**
 * Rummet: bord, stolar och inredning.
 *
 * Planritningen låg redan i databasen (migration 0032) med bordens
 * koordinater i RUTNÄTSENHETER och inte i pixlar. Det som saknades var två
 * saker som gör en ritning till ett rum: stolarna, och allt som inte är ett
 * bord — baren, väggen, dörren, trappan, palmen på uteserveringen.
 *
 * ── Stolarna räknas, de lagras inte ─────────────────────────────────────────
 *
 * Ett bord har redan `capacity`. Att dessutom lagra var varje stol står hade
 * gett två sanningar om samma sak: ett bord för fyra med tre utritade stolar.
 * Stolarna räknas därför fram ur platsantalet och bordets form, på samma sätt
 * som lojalitetssaldot räknas ur sina transaktioner i stället för att lagras.
 *
 * Att flytta en enskild stol är dessutom en handling utan mottagare: ingenting
 * i Burp adresserar en stol. Notan hör till bordet, QR-koden hör till bordet,
 * och bokningen hör till bordet. Stolarna finns för att den som ritar ska
 * känna igen sitt eget rum — de ska stämma i ANTAL och stå rimligt, inte vara
 * ett eget möblemang att underhålla.
 *
 * Allt här är rent räknande utan runtime-koppling, och testas därefter.
 */

/** Bordets form. Speglar `public.table_shape` i migration 0032. */
export type TableShape = "ROUND" | "SQUARE" | "RECT";

/**
 * Inredningen. Speglar `public.floor_item_kind` i migration 0072.
 *
 * En fast lista och inte fritext, av samma skäl som bordens egenskaper:
 * orden ÖVERSÄTTS. En restaurang som skriver "šank", en som skriver "bar" och
 * en som skriver "Theke" hade annars byggt tre olika saker.
 */
export const FLOOR_ITEM_KINDS = [
  "BAR",       // baren, disken
  "WALL",      // vägg eller skiljevägg
  "DOOR",      // ingång
  "WINDOW",    // fönsterparti
  "PLANT",     // växt, det som avgränsar en uteservering utan vägg
  "STAIRS",    // trappa
  "WC",        // toaletten
  "KITCHEN",   // köksöppningen, utpasseringen
  "TEXT",      // en egen etikett: "Bašta", "Övervåningen"
] as const;

export type FloorItemKind = (typeof FLOOR_ITEM_KINDS)[number];

export function isFloorItemKind(value: string): value is FloorItemKind {
  return (FLOOR_ITEM_KINDS as readonly string[]).includes(value);
}

/**
 * Storleken en ny sak får när den läggs ut, i rutnätsenheter.
 *
 * Rimliga mått, inte minsta möjliga: den som lägger ut en bar ska se en bar
 * och inte en prick att först dra i. Rutnätet är i praktiken ungefär en halv
 * meter per enhet — en standardritning på 40×30 blir då ett rum på 20×15 m.
 */
export const FLOOR_ITEM_SIZE: Record<FloorItemKind, { width: number; height: number }> = {
  BAR: { width: 10, height: 3 },
  WALL: { width: 12, height: 1 },
  DOOR: { width: 3, height: 1 },
  WINDOW: { width: 8, height: 1 },
  PLANT: { width: 2, height: 2 },
  STAIRS: { width: 4, height: 6 },
  WC: { width: 5, height: 4 },
  KITCHEN: { width: 8, height: 4 },
  TEXT: { width: 8, height: 2 },
};

/** Ett bords plats och form på ritningen. */
export interface PlacedTable {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: TableShape;
}

export interface SeatPosition {
  /** Stolens mittpunkt i rutnätsenheter, i ritningens koordinater. */
  x: number;
  y: number;
  /** Stolens radie. Samma för alla — en stol är en stol. */
  r: number;
}

/** Stolens radie i rutnätsenheter. En stol är ungefär en halv ruta bred. */
const SEAT_RADIUS = 0.55;

/** Luften mellan bordskanten och stolen. Utan den ser stolarna påklistrade ut. */
const SEAT_GAP = 0.35;

/**
 * Fler stolar än så här ritas inte ut.
 *
 * Ett långbord för trettio är ett riktigt fall — ett bröllop, en skolklass —
 * men trettio prickar runt en rektangel är inte längre en läsbar ritning. Över
 * gränsen ritas stolarna glesare snarare än fler; siffran i bordet står ändå
 * kvar och är det som räknas vid bokning.
 */
const MAX_DRAWN_SEATS = 24;

/**
 * Stolarna runt ett bord.
 *
 * Runt bord: jämnt fördelade på en ellips strax utanför bordskanten, med
 * första stolen rakt uppåt så att fyra stolar hamnar i klockan tolv, tre, sex
 * och nio i stället för snett.
 *
 * Fyrkantigt och avlångt: jämnt fördelade längs omkretsen och sedan skjutna
 * utåt från den sida de hamnade på. Fördelningen görs på omkretsen och inte
 * "två på varje sida", eftersom ett långbord på 12×4 ska få sina platser på
 * långsidorna — vilket omkretsen ger av sig själv.
 *
 * Rotationen hanteras INTE här. Bordet och dess stolar roteras tillsammans i
 * SVG:n, och en stol som roterats separat hade legat kvar när bordet vändes.
 */
export function seatPositions(table: PlacedTable, seats: number | null): SeatPosition[] {
  const count = Math.min(Math.floor(seats ?? 0), MAX_DRAWN_SEATS);
  if (!Number.isFinite(count) || count <= 0) return [];
  if (table.width <= 0 || table.height <= 0) return [];

  const cx = table.x + table.width / 2;
  const cy = table.y + table.height / 2;
  const out = SEAT_RADIUS + SEAT_GAP;

  if (table.shape === "ROUND") {
    const rx = table.width / 2 + out;
    const ry = table.height / 2 + out;

    return Array.from({ length: count }, (_, index) => {
      // -π/2 = rakt uppåt. Utan den startar första stolen till höger, och en
      // fyrsitsare ser vriden ut mot ett rum som är rakt.
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
      return {
        x: round(cx + rx * Math.cos(angle)),
        y: round(cy + ry * Math.sin(angle)),
        r: SEAT_RADIUS,
      };
    });
  }

  const w = table.width;
  const h = table.height;
  const perimeter = 2 * (w + h);

  return Array.from({ length: count }, (_, index) => {
    // Halvsteget gör att en stol aldrig hamnar exakt i ett hörn, där den hade
    // sett ut att tillhöra båda sidorna och ingen.
    const along = ((index + 0.5) * perimeter) / count;
    const point = onRectangle(table.x, table.y, w, h, along);

    return {
      x: round(point.x + point.nx * out),
      y: round(point.y + point.ny * out),
      r: SEAT_RADIUS,
    };
  });
}

/**
 * En punkt på rektangelns kant, plus dess utåtriktade normal.
 *
 * `along` mäts medurs från övre vänstra hörnet.
 */
function onRectangle(
  x: number,
  y: number,
  w: number,
  h: number,
  along: number,
): { x: number; y: number; nx: number; ny: number } {
  const d = along % (2 * (w + h));

  if (d < w) return { x: x + d, y, nx: 0, ny: -1 };
  if (d < w + h) return { x: x + w, y: y + (d - w), nx: 1, ny: 0 };
  if (d < 2 * w + h) return { x: x + w - (d - w - h), y: y + h, nx: 0, ny: 1 };
  return { x, y: y + h - (d - 2 * w - h), nx: -1, ny: 0 };
}

/**
 * Håller en sak innanför ritningen.
 *
 * Både redigeraren och servern behöver samma svar. Räknades det bara i
 * webbläsaren hade den som skickar sitt eget anrop kunnat lägga ett bord
 * utanför rummet, och ritningen hade ritat något ingen kan se.
 */
export function clampToPlan(
  value: { x: number; y: number; width: number; height: number },
  plan: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: clamp(Math.round(value.x), 0, Math.max(0, plan.width - value.width)),
    y: clamp(Math.round(value.y), 0, Math.max(0, plan.height - value.height)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Två decimaler räcker för en ritning och håller SVG:n läsbar. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
