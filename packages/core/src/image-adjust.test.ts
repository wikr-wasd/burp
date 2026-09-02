import { describe, expect, it } from "vitest";
import {
  ADJUST_MAX,
  ADJUST_MIN,
  DEFAULT_IMAGE_ADJUST,
  imageAdjustStyle,
  isDefaultAdjust,
  parseImageAdjust,
  toAdjustColumns,
} from "./image-adjust";

describe("parseImageAdjust", () => {
  it("ger standardvärden när kolumnen är tom", () => {
    expect(parseImageAdjust(null)).toEqual(DEFAULT_IMAGE_ADJUST);
    expect(parseImageAdjust(undefined)).toEqual(DEFAULT_IMAGE_ADJUST);
  });

  it("läser formen som databasen skriver", () => {
    expect(
      parseImageAdjust({
        focal_x: 30,
        focal_y: 70,
        brightness: 110,
        contrast: 95,
        saturation: 105,
      }),
    ).toEqual({ focalX: 30, focalY: 70, brightness: 110, contrast: 95, saturation: 105 });
  });

  it("klämmer värden utanför gränserna i stället för att kasta", () => {
    const parsed = parseImageAdjust({ brightness: 400, contrast: 0, focal_x: -20 });
    expect(parsed.brightness).toBe(ADJUST_MAX);
    expect(parsed.contrast).toBe(ADJUST_MIN);
    expect(parsed.focalX).toBe(0);
  });

  it("läser en tom kolumn som orörd, inte som noll", () => {
    // Number(null) är 0. Utan en egen gren hade en ojusterad bild klämts till
    // 85 % — alltså mörkare än originalet, på varje bild i systemet.
    expect(
      parseImageAdjust({ focal_x: null, focal_y: null, brightness: null, contrast: null, saturation: null }),
    ).toEqual(DEFAULT_IMAGE_ADJUST);
  });

  it("visar bilden orörd när innehållet är skräp", () => {
    // En bild som inte går att justera ska visas, aldrig försvinna.
    expect(parseImageAdjust("inte ett objekt")).toEqual(DEFAULT_IMAGE_ADJUST);
    expect(parseImageAdjust({ brightness: "ganska ljus" })).toEqual(DEFAULT_IMAGE_ADJUST);
    expect(parseImageAdjust({ brightness: Number.NaN })).toEqual(DEFAULT_IMAGE_ADJUST);
  });
});

describe("imageAdjustStyle", () => {
  it("utelämnar filter helt när färgen är orörd", () => {
    // En filter-egenskap skapar en stackningskontext även när den inte ändrar
    // något, och det räcker för att bryta sticky i ett förälderled.
    const style = imageAdjustStyle(DEFAULT_IMAGE_ADJUST);
    expect(style.filter).toBeUndefined();
    expect(style.objectPosition).toBe("50% 50%");
  });

  it("skriver bara de reglage som faktiskt flyttats", () => {
    const style = imageAdjustStyle({ ...DEFAULT_IMAGE_ADJUST, brightness: 110 });
    expect(style.filter).toBe("brightness(110%)");
  });

  it("sätter fokuspunkten som object-position", () => {
    const style = imageAdjustStyle({ ...DEFAULT_IMAGE_ADJUST, focalX: 20, focalY: 80 });
    expect(style.objectPosition).toBe("20% 80%");
  });

  it("skriver reglagen i samma ordning varje gång", () => {
    // Annars ändras strängen mellan renderingar och React byter ut noden.
    const style = imageAdjustStyle({
      focalX: 50,
      focalY: 50,
      brightness: 110,
      contrast: 90,
      saturation: 115,
    });
    expect(style.filter).toBe("brightness(110%) contrast(90%) saturate(115%)");
  });
});

describe("toAdjustColumns", () => {
  it("ger databasens kolumnnamn", () => {
    expect(toAdjustColumns(DEFAULT_IMAGE_ADJUST)).toEqual({
      focal_x: 50,
      focal_y: 50,
      brightness: 100,
      contrast: 100,
      saturation: 100,
    });
  });

  it("håller sig innanför check-villkoren i migration 0063", () => {
    // Faller det här testet skickar appen värden som databasen avvisar.
    const columns = toAdjustColumns({
      focalX: 999,
      focalY: -1,
      brightness: 200,
      contrast: 1,
      saturation: 150,
    });
    expect(columns.focal_x).toBe(100);
    expect(columns.focal_y).toBe(0);
    expect(columns.brightness).toBe(ADJUST_MAX);
    expect(columns.contrast).toBe(ADJUST_MIN);
    expect(columns.saturation).toBe(ADJUST_MAX);
  });

  it("avrundar till heltal — kolumnerna är smallint", () => {
    expect(toAdjustColumns({ ...DEFAULT_IMAGE_ADJUST, brightness: 104.6 }).brightness).toBe(105);
  });
});

describe("isDefaultAdjust", () => {
  it("känner igen en orörd bild", () => {
    expect(isDefaultAdjust(DEFAULT_IMAGE_ADJUST)).toBe(true);
    expect(isDefaultAdjust({ ...DEFAULT_IMAGE_ADJUST, focalY: 51 })).toBe(false);
  });
});
