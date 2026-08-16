import { describe, expect, it } from "vitest";
import { filterMenu, foldForSearch } from "./menu-search";

/**
 * Menyn nedan är den vi bygger för: bosniska rätter med diakriter, en svensk
 * beskrivning och en dryckesavdelning på lokalspråket.
 */
function menu() {
  return [
    {
      name: "Sa roštilja",
      description: "Från kolgrillen",
      items: [
        { name: "Ćevapi 10 kom", description: "Tio ćevapi i lepinja, med lök och kajmak" },
        { name: "Pljeskavica", description: "Grillad köttfärsbiff i lepinja med ajvar" },
        { name: "Đuveč", description: null },
      ],
    },
    {
      name: "Pića",
      description: "Dryck",
      items: [{ name: "Bosanska kafa", description: "Kokt i džezva" }],
    },
  ];
}

describe("foldForSearch", () => {
  it("plockar bort diakriter", () => {
    expect(foldForSearch("Ćevapi")).toBe("cevapi");
    expect(foldForSearch("Pića")).toBe("pica");
    expect(foldForSearch("džezva")).toBe("dzezva");
  });

  it("viker ihop svenska vokaler med sina grundbokstäver", () => {
    // Trubbigt med flit: en gäst som söker "kottfars" ska hitta rätten.
    expect(foldForSearch("Köttfärs")).toBe("kottfars");
    expect(foldForSearch("Ål")).toBe("al");
  });

  it("klarar bokstäver som normaliseringen inte rör", () => {
    // đ är en egen bokstav, inte ett d med accent. NFD lämnar den orörd.
    expect(foldForSearch("Đuveč")).toBe("duvec");
    expect(foldForSearch("smørrebrød")).toBe("smorrebrod");
  });
});

describe("filterMenu", () => {
  it("lämnar menyn orörd när sökningen är tom", () => {
    expect(filterMenu(menu(), "")).toEqual(menu());
    expect(filterMenu(menu(), "   ")).toEqual(menu());
  });

  it("hittar en rätt utan att gästen skriver diakriterna", () => {
    const result = filterMenu(menu(), "cevapi");

    expect(result).toHaveLength(1);
    expect(result[0]!.items.map((item) => item.name)).toEqual(["Ćevapi 10 kom"]);
  });

  it("hittar på beskrivningen, inte bara på namnet", () => {
    const result = filterMenu(menu(), "ajvar");

    expect(result[0]!.items.map((item) => item.name)).toEqual(["Pljeskavica"]);
  });

  it("kräver att alla ord finns, i vilken ordning som helst", () => {
    expect(filterMenu(menu(), "10 cevapi")[0]!.items).toHaveLength(1);
    expect(filterMenu(menu(), "cevapi pljeskavica")).toEqual([]);
  });

  it("behåller hela avdelningen när avdelningen träffar", () => {
    const result = filterMenu(menu(), "pica");

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Pića");
    expect(result[0]!.items).toHaveLength(1);
  });

  it("tar bort avdelningar som inte har någon träff kvar", () => {
    const result = filterMenu(menu(), "kajmak");

    expect(result.map((category) => category.name)).toEqual(["Sa roštilja"]);
  });

  it("ger en tom lista när ingenting matchar", () => {
    expect(filterMenu(menu(), "pizza")).toEqual([]);
  });

  it("ändrar inte menyn den fick in", () => {
    const original = menu();
    filterMenu(original, "cevapi");

    expect(original).toEqual(menu());
  });
});
