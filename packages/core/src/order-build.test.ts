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
    {
      id: "paprika",
      restaurantId: RESTAURANT,
      name: "Punjene paprike",
      priceOre: 1400,
      vatRateBps: VAT_FOOD_BPS,
      isAvailable: true,
      status: "PUBLISHED",
      minQuantity: 4,
    },
  ],
  optionGroups: [
    { id: "grupp-paprika", menuItemId: "paprika", name: "Fyllning", minSelect: 0, maxSelect: 1 },
    { id: "grupp-tillbehor", menuItemId: "margherita", name: "Extra tillbehör", minSelect: 0, maxSelect: 3 },
    { id: "grupp-storlek", menuItemId: "diavola", name: "Välj storlek", minSelect: 1, maxSelect: 1 },
  ],
  options: [
    { id: "utan-kott", optionGroupId: "grupp-paprika", name: "Utan kött", priceOre: 0, isAvailable: true },
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

/**
 * Ordningen är inte en detalj — den bär gästens noteringar.
 *
 * `POST /api/orders` sparar noteringen med `input.items[index].note` mot
 * `built.lines[index]`. Kopplingen är rent positionell: det finns inget id som
 * binder ihop en beställd rad med sin prissatta rad. Slås två identiska rätter
 * ihop till en rad, eller sorteras raderna om, glider noteringarna ett steg och
 * hamnar på fel rätt. I noteringen står "utan nötter".
 *
 * Testerna nedan låser fast egenskapen så att en framtida optimering inte kan
 * införa hopslagning utan att något går rött.
 */
describe("buildPricedLines — raderna ligger kvar i klientens ordning", () => {
  it("ger exakt en rad per beställd rad, i samma ordning", () => {
    // Sekvensen är avsiktligt osymmetrisk. Vore den ett palindrom skulle en
    // omvänd radlista se identisk ut och testet missa hela felet.
    const requested = [
      item({ menu_item_id: "margherita" }),
      item({ menu_item_id: "diavola", options: [{ option_id: "stor" }] }),
      item({ menu_item_id: "diavola", options: [{ option_id: "stor" }] }),
    ];

    const result = buildPricedLines(requested, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.lines).toHaveLength(requested.length);
    expect(result.lines.map((line) => line.menuItemId)).toEqual(
      requested.map((row) => row.menu_item_id),
    );
  });

  it("slår inte ihop två identiska rätter till en rad", () => {
    // Samma rätt, samma tillval, ingenting som skiljer dem åt. Frestelsen att
    // slå ihop dem till quantity: 2 är precis det som skulle bryta kopplingen.
    const requested = [item(), item()];

    const result = buildPricedLines(requested, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.quantity).toBe(1);
    expect(result.lines[1]!.quantity).toBe(1);
  });

  it("behåller ordningen även när tillvalen skiljer raderna åt", () => {
    const requested = [
      item({ options: [{ option_id: "rucola" }] }),
      item({ options: [] }),
      item({ options: [{ option_id: "extra-ost" }, { option_id: "rucola" }] }),
    ];

    const result = buildPricedLines(requested, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.lines.map((line) => line.options.map((option) => option.optionId))).toEqual([
      ["rucola"],
      [],
      ["extra-ost", "rucola"],
    ]);
  });
});

describe("buildPricedLines — minsta antal portioner", () => {
  it("nekar en beställning under gränsen", () => {
    const result = buildPricedLines(
      [item({ menu_item_id: "paprika", quantity: 3 })],
      catalog,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("BELOW_MIN_QUANTITY");
    expect(result.error.message).toContain("Punjene paprike");
    expect(result.error.message).toContain("4");
  });

  it("släpper igenom exakt gränsen", () => {
    const result = buildPricedLines(
      [item({ menu_item_id: "paprika", quantity: 4 })],
      catalog,
    );
    expect(result.ok).toBe(true);
  });

  /**
   * Kravet gäller BESTÄLLNINGEN, inte raden.
   *
   * Två med fyllning och två utan är fyra portioner för köket, och det är
   * satsen som är kravet. Räknades det per rad gick regeln att gå runt genom
   * att välja olika tillval — vilket är exakt vad en gäst som vill ha två
   * portioner skulle råka göra.
   */
  it("summerar över raderna i stället för att räkna per rad", () => {
    const result = buildPricedLines(
      [
        item({ menu_item_id: "paprika", quantity: 2, options: [{ option_id: "utan-kott" }] }),
        item({ menu_item_id: "paprika", quantity: 2 }),
      ],
      catalog,
    );

    expect(result.ok).toBe(true);
  });

  it("två rader som tillsammans är för få nekas ändå", () => {
    const result = buildPricedLines(
      [
        item({ menu_item_id: "paprika", quantity: 1, options: [{ option_id: "utan-kott" }] }),
        item({ menu_item_id: "paprika", quantity: 2 }),
      ],
      catalog,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("BELOW_MIN_QUANTITY");
  });

  it("rör inte rätter utan gräns", () => {
    const result = buildPricedLines([item({ quantity: 1 })], catalog);
    expect(result.ok).toBe(true);
  });
});
