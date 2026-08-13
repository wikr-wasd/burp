import { describe, expect, it } from "vitest";
import {
  buildPricedLines,
  type OrderCatalog,
  type RequestedItem,
} from "./order-build";
import { calculateOrderTotals } from "./pricing";
import { VAT_FOOD_BPS } from "./types";

const RESTAURANT = "rest-1";
const OTHER_RESTAURANT = "rest-2";

/**
 * Katalogen speglar seed-datan: en Margherita med gruppen "Extra tillbehör"
 * (0–3 val) och en Diavola helt utan tillval.
 */
const catalog: OrderCatalog = {
  menuItems: [
    {
      id: "margherita",
      restaurantId: RESTAURANT,
      name: "Margherita",
      priceOre: 12900,
      vatRateBps: VAT_FOOD_BPS,
      isAvailable: true,
      status: "PUBLISHED",
    },
    {
      id: "diavola",
      restaurantId: RESTAURANT,
      name: "Diavola",
      priceOre: 14900,
      vatRateBps: VAT_FOOD_BPS,
      isAvailable: true,
      status: "PUBLISHED",
    },
    {
      id: "slutsald",
      restaurantId: RESTAURANT,
      name: "Capricciosa",
      priceOre: 15900,
      vatRateBps: VAT_FOOD_BPS,
      isAvailable: false,
      status: "PUBLISHED",
    },
    {
      id: "utkast",
      restaurantId: RESTAURANT,
      name: "Nyhet",
      priceOre: 16900,
      vatRateBps: VAT_FOOD_BPS,
      isAvailable: true,
      status: "DRAFT",
    },
    {
      id: "annan-restaurang",
      restaurantId: OTHER_RESTAURANT,
      name: "Sushi",
      priceOre: 18900,
      vatRateBps: VAT_FOOD_BPS,
      isAvailable: true,
      status: "PUBLISHED",
    },
  ],
  optionGroups: [
    { id: "grupp-tillbehor", menuItemId: "margherita", name: "Extra tillbehör", minSelect: 0, maxSelect: 3 },
    { id: "grupp-storlek", menuItemId: "diavola", name: "Välj storlek", minSelect: 1, maxSelect: 1 },
  ],
  options: [
    { id: "extra-ost", optionGroupId: "grupp-tillbehor", name: "Extra ost", priceOre: 1500, isAvailable: true },
    { id: "rucola", optionGroupId: "grupp-tillbehor", name: "Rucola", priceOre: 1000, isAvailable: true },
    { id: "utan-ost", optionGroupId: "grupp-tillbehor", name: "Utan ost", priceOre: -1000, isAvailable: true },
    { id: "tryffel", optionGroupId: "grupp-tillbehor", name: "Tryffel", priceOre: 4900, isAvailable: false },
    { id: "stor", optionGroupId: "grupp-storlek", name: "Stor", priceOre: 3000, isAvailable: true },
  ],
};

function item(overrides: Partial<RequestedItem> = {}): RequestedItem {
  return { menu_item_id: "margherita", quantity: 1, options: [], ...overrides };
}

describe("buildPricedLines — glada vägen", () => {
  it("bygger en rad med pris hämtat ur menyn", () => {
    const result = buildPricedLines([item()], catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.restaurantId).toBe(RESTAURANT);
    expect(result.lines[0]).toMatchObject({
      menuItemId: "margherita",
      name: "Margherita",
      unitPriceOre: 12900,
      quantity: 1,
    });
  });

  it("tar med valda tillval med menyns pris", () => {
    const result = buildPricedLines(
      [item({ options: [{ option_id: "extra-ost" }, { option_id: "rucola" }] })],
      catalog,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const totals = calculateOrderTotals({ lines: result.lines });
    expect(totals.itemsGrossOre).toBe(12900 + 1500 + 1000);
  });

  it("accepterar en grupp som kräver exakt ett val", () => {
    const result = buildPricedLines(
      [item({ menu_item_id: "diavola", options: [{ option_id: "stor" }] })],
      catalog,
    );
    expect(result.ok).toBe(true);
  });
});

describe("buildPricedLines — tillval får inte lånas mellan rätter", () => {
  /**
   * Det här är hålet regeln finns för. "Utan ost" kostar −10 kr och hör till
   * Margheritas grupp. Utan kopplingskontrollen kunde en gäst hänga det på
   * Diavola och betala 10 kr mindre för en rätt som inte har valet.
   */
  it("avvisar ett tillval som hör till en annan rätt", () => {
    const result = buildPricedLines(
      [
        item({
          menu_item_id: "diavola",
          options: [{ option_id: "stor" }, { option_id: "utan-ost" }],
        }),
      ],
      catalog,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("OPTION_NOT_ON_ITEM");
  });

  it("avvisar tillval på en rätt som inte har några grupper alls", () => {
    const barePizza: OrderCatalog = { ...catalog, optionGroups: [] };
    const result = buildPricedLines(
      [item({ options: [{ option_id: "utan-ost" }] })],
      barePizza,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("OPTION_NOT_ON_ITEM");
  });

  it("avvisar ett okänt tillvals-id", () => {
    const result = buildPricedLines([item({ options: [{ option_id: "finns-inte" }] })], catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNKNOWN_OPTION");
  });
});

describe("buildPricedLines — min och max per grupp", () => {
  it("avvisar när ett obligatoriskt val saknas", () => {
    const result = buildPricedLines([item({ menu_item_id: "diavola" })], catalog);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("TOO_FEW_OPTIONS");
    expect(result.error.message).toContain("Välj storlek");
  });

  it("avvisar fler val än gruppen tillåter", () => {
    const result = buildPricedLines(
      [
        item({
          options: [
            { option_id: "extra-ost" },
            { option_id: "rucola" },
            { option_id: "utan-ost" },
          ],
        }),
      ],
      // Samma grupp men med max 2.
      {
        ...catalog,
        optionGroups: [
          { id: "grupp-tillbehor", menuItemId: "margherita", name: "Extra tillbehör", minSelect: 0, maxSelect: 2 },
        ],
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("TOO_MANY_OPTIONS");
  });

  it("avvisar samma tillval två gånger på samma rad", () => {
    const result = buildPricedLines(
      [item({ options: [{ option_id: "extra-ost" }, { option_id: "extra-ost" }] })],
      catalog,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DUPLICATE_OPTION");
  });
});

describe("buildPricedLines — tillgänglighet", () => {
  it("avvisar en rätt som är slut för dagen", () => {
    const result = buildPricedLines([item({ menu_item_id: "slutsald" })], catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ITEM_UNAVAILABLE");
  });

  it("avvisar en opublicerad rätt", () => {
    const result = buildPricedLines([item({ menu_item_id: "utkast" })], catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ITEM_UNAVAILABLE");
  });

  it("avvisar ett slutsålt tillval", () => {
    const result = buildPricedLines([item({ options: [{ option_id: "tryffel" }] })], catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("OPTION_UNAVAILABLE");
  });
});

describe("buildPricedLines — en restaurang per order", () => {
  it("avvisar rätter från olika restauranger", () => {
    const result = buildPricedLines(
      [item(), item({ menu_item_id: "annan-restaurang" })],
      catalog,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MIXED_RESTAURANTS");
  });

  it("avvisar en tom order", () => {
    const result = buildPricedLines([], catalog);
    expect(result.ok).toBe(false);
  });
});
