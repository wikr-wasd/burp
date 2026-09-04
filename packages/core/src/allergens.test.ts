import { describe, expect, it } from "vitest";
import { ALLERGENS, isAllergen, parseAllergens } from "./allergens";

describe("parseAllergens", () => {
  it("släpper igenom koder som redan är rätt", () => {
    expect(parseAllergens(["GLUTEN", "MILK"])).toEqual(["GLUTEN", "MILK"]);
  });

  it("tolkar samma allergen på bosniska och serbiska till samma kod", () => {
    // Datan hade båda stavningarna sida vid sida, på två restauranger.
    expect(parseAllergens(["mlijeko"])).toEqual(["MILK"]);
    expect(parseAllergens(["mleko"])).toEqual(["MILK"]);
  });

  it("tolkar de fem språkens ord för mjölk", () => {
    expect(parseAllergens(["mjölk", "milk", "Milch", "melk", "mlijeko"])).toEqual(["MILK"]);
  });

  it("bryr sig inte om versaler eller diakriter", () => {
    expect(parseAllergens(["  Jordnötter "])).toEqual(["PEANUTS"]);
    expect(parseAllergens(["ORAŠASTI PLODOVI"])).toEqual(["NUTS"]);
  });

  it("låter okända värden falla bort i stället för att gissa", () => {
    // En rätt som tappar en allergen är fel. En rätt som får FEL allergen är
    // farligare, och en gissning är precis det.
    expect(parseAllergens(["kanel", "gluten"])).toEqual(["GLUTEN"]);
  });

  it("tar bort dubbletter", () => {
    expect(parseAllergens(["mjölk", "milk", "MILK"])).toEqual(["MILK"]);
  });

  it("ger listans ordning och inte inmatningens", () => {
    // Två rätter med samma allergener ska visa dem i samma ordning.
    expect(parseAllergens(["milk", "gluten"])).toEqual(["GLUTEN", "MILK"]);
    expect(parseAllergens(["gluten", "milk"])).toEqual(["GLUTEN", "MILK"]);
  });

  it("ger tom lista för tomt", () => {
    expect(parseAllergens([])).toEqual([]);
  });
});

describe("ALLERGENS", () => {
  it("är EU:s fjorton", () => {
    // Förordning 1169/2011. Fler går att lägga till; färre går inte.
    expect(ALLERGENS).toHaveLength(14);
  });

  it("känner igen sina egna koder", () => {
    for (const allergen of ALLERGENS) {
      expect(isAllergen(allergen)).toBe(true);
    }
    expect(isAllergen("KANEL")).toBe(false);
  });
});
