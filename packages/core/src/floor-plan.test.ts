import { describe, expect, it } from "vitest";
import {
  clampToPlan,
  FLOOR_ITEM_KINDS,
  FLOOR_ITEM_SIZE,
  isFloorItemKind,
  seatPositions,
  type PlacedTable,
} from "./floor-plan";

const round4: PlacedTable = { x: 10, y: 10, width: 4, height: 4, shape: "ROUND" };
const square4: PlacedTable = { x: 10, y: 10, width: 4, height: 4, shape: "SQUARE" };
const long: PlacedTable = { x: 0, y: 0, width: 12, height: 4, shape: "RECT" };

describe("seatPositions", () => {
  it("ritar lika många stolar som bordet har platser", () => {
    expect(seatPositions(round4, 4)).toHaveLength(4);
    expect(seatPositions(square4, 6)).toHaveLength(6);
    expect(seatPositions(long, 10)).toHaveLength(10);
  });

  it("ritar inga stolar för ett bord utan platsantal", () => {
    // `capacity` är nullbar i schemat. Ett bord utan siffra ska ritas som ett
    // bord och inte som ett fel.
    expect(seatPositions(round4, null)).toEqual([]);
    expect(seatPositions(round4, 0)).toEqual([]);
    expect(seatPositions(round4, -3)).toEqual([]);
  });

  it("lägger aldrig en stol inne i bordet", () => {
    for (const table of [round4, square4, long]) {
      for (const seat of seatPositions(table, 8)) {
        const insideX = seat.x > table.x && seat.x < table.x + table.width;
        const insideY = seat.y > table.y && seat.y < table.y + table.height;
        expect(insideX && insideY).toBe(false);
      }
    }
  });

  it("sätter första stolen rakt ovanför ett runt bord", () => {
    // Annars hamnar en fyrsitsare snett i ett rum som är rakt.
    const [first] = seatPositions(round4, 4);
    expect(first.x).toBeCloseTo(12, 5);
    expect(first.y).toBeLessThan(10);
  });

  it("speglar stolarna kring ett runt bords mitt", () => {
    const seats = seatPositions(round4, 4);
    const sumX = seats.reduce((total, seat) => total + seat.x, 0);
    const sumY = seats.reduce((total, seat) => total + seat.y, 0);

    expect(sumX / seats.length).toBeCloseTo(12, 5);
    expect(sumY / seats.length).toBeCloseTo(12, 5);
  });

  it("lägger långbordets platser på långsidorna", () => {
    // Ett bord på 12×4 har 24 av 32 omkretsenheter på långsidorna. Fördelas
    // platserna på omkretsen hamnar de flesta där folk faktiskt sitter.
    const seats = seatPositions(long, 8);
    const onLongSides = seats.filter((seat) => seat.y < 0 || seat.y > 4);

    expect(onLongSides.length).toBeGreaterThanOrEqual(6);
  });

  it("ritar högst tjugofyra stolar", () => {
    // Ett långbord för femtio är ett riktigt fall, men femtio prickar är inte
    // längre en läsbar ritning. Siffran i bordet står ändå kvar.
    expect(seatPositions(long, 50)).toHaveLength(24);
  });

  it("ger samma svar varje gång", () => {
    expect(seatPositions(square4, 5)).toEqual(seatPositions(square4, 5));
  });
});

describe("clampToPlan", () => {
  const plan = { width: 40, height: 30 };

  it("håller kvar saken innanför rummet", () => {
    expect(clampToPlan({ x: 39, y: 29, width: 4, height: 4 }, plan)).toEqual({ x: 36, y: 26 });
    expect(clampToPlan({ x: -5, y: -1, width: 4, height: 4 }, plan)).toEqual({ x: 0, y: 0 });
  });

  it("fäster mot rutnätet", () => {
    expect(clampToPlan({ x: 12.4, y: 7.6, width: 4, height: 4 }, plan)).toEqual({ x: 12, y: 8 });
  });

  it("lägger en sak som är större än rummet i hörnet", () => {
    // Hellre synlig i hörnet än utanför ritytan, där ingen hittar den.
    expect(clampToPlan({ x: 5, y: 5, width: 60, height: 60 }, plan)).toEqual({ x: 0, y: 0 });
  });
});

describe("FLOOR_ITEM_KINDS", () => {
  it("har en storlek för varje sort", () => {
    for (const kind of FLOOR_ITEM_KINDS) {
      expect(FLOOR_ITEM_SIZE[kind].width).toBeGreaterThan(0);
      expect(FLOOR_ITEM_SIZE[kind].height).toBeGreaterThan(0);
    }
  });

  it("känner igen sina egna sorter och inga andra", () => {
    expect(isFloorItemKind("BAR")).toBe(true);
    expect(isFloorItemKind("bar")).toBe(false);
    expect(isFloorItemKind("SOFFA")).toBe(false);
  });
});
