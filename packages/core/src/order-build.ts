import type { PricedLine, PricedOption } from "./types";

/**
 * Bygger prissatta orderrader ur menyn.
 *
 * Det här är steget mellan "vad gästen bad om" och "vad ordern kostar", och
 * det är här varje antagande om klientens ärlighet måste dö. Klienten skickar
 * bara id:n och antal — allt annat hämtas ur katalogen och kontrolleras.
 *
 * Funktionen är avsiktligt ren: den tar emot databasraderna som argument i
 * stället för att hämta dem själv. Då kan varje regel testas utan databas, och
 * samma regler gäller i appen som på servern.
 */

export interface MenuItemRow {
  id: string;
  restaurantId: string;
  name: string;
  priceOre: number;
  vatRateBps: number;
  isAvailable: boolean;
  status: string;
  /**
   * Minsta antal portioner som måste beställas i samma order.
   *
   * Finns för rätter som lagas i sats — punjene paprike sätts inte i ugnen för
   * en portion. 1 betyder ingen begränsning, och är standardvärdet i schemat.
   */
  minQuantity?: number;
}

export interface OptionGroupRow {
  id: string;
  menuItemId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
}

export interface OptionRow {
  id: string;
  optionGroupId: string;
  name: string;
  priceOre: number;
  isAvailable: boolean;
}

export interface OrderCatalog {
  menuItems: readonly MenuItemRow[];
  optionGroups: readonly OptionGroupRow[];
  options: readonly OptionRow[];
}

export interface RequestedItem {
  menu_item_id: string;
  quantity: number;
  options: readonly { option_id: string }[];
}

export type BuildLinesResult =
  | { ok: true; restaurantId: string; lines: PricedLine[] }
  | { ok: false; error: OrderBuildError };

export type OrderBuildErrorCode =
  | "UNKNOWN_MENU_ITEM"
  | "MIXED_RESTAURANTS"
  | "ITEM_UNAVAILABLE"
  | "UNKNOWN_OPTION"
  | "OPTION_NOT_ON_ITEM"
  | "OPTION_UNAVAILABLE"
  | "TOO_FEW_OPTIONS"
  | "TOO_MANY_OPTIONS"
  | "DUPLICATE_OPTION"
  | "BELOW_MIN_QUANTITY";

export interface OrderBuildError {
  code: OrderBuildErrorCode;
  /** Text som kan visas för gästen. */
  message: string;
}

/**
 * Bygger prissatta orderrader ur klientens önskemål och restaurangens katalog.
 *
 * KONTRAKT: `lines[i]` hör ihop med `items[i]`. Exakt en rad per beställd rad,
 * i samma ordning, aldrig hopslagen och aldrig omsorterad.
 *
 * Det är inte en implementationsdetalj. `POST /api/orders` sparar gästens
 * notering positionellt — `items[i].note` mot `lines[i]` — eftersom det inte
 * finns något id som binder ihop dem. Slås två identiska rätter ihop till
 * `quantity: 2` glider noteringarna, och i noteringen står det som gästen inte
 * tål. Vill man införa hopslagning måste raderna först få ett eget id att
 * mappa noteringen mot.
 *
 * Låst av testerna i `order-build.test.ts` under "raderna ligger kvar i
 * klientens ordning".
 */
export function buildPricedLines(
  items: readonly RequestedItem[],
  catalog: OrderCatalog,
): BuildLinesResult {
  const menuById = new Map(catalog.menuItems.map((item) => [item.id, item]));
  const optionById = new Map(catalog.options.map((option) => [option.id, option]));
  const groupById = new Map(catalog.optionGroups.map((group) => [group.id, group]));

  // Vilka grupper hör till vilken rätt? Det är den kopplingen som avgör om ett
  // tillval får väljas — utan den kan vilket tillval som helst hängas på
  // vilken rätt som helst, inklusive negativt prissatta.
  const groupsByItem = new Map<string, OptionGroupRow[]>();
  for (const group of catalog.optionGroups) {
    const existing = groupsByItem.get(group.menuItemId);
    if (existing) existing.push(group);
    else groupsByItem.set(group.menuItemId, [group]);
  }

  const lines: PricedLine[] = [];
  let restaurantId: string | null = null;

  /*
   * Antal per RÄTT, inte per rad.
   *
   * Minsta antal gäller beställningen och inte raden. Två portioner med paprika
   * och två utan är fyra portioner för köket, och det är satsen som är kravet.
   * Räknades det per rad gick regeln att gå runt genom att välja olika tillval.
   */
  const quantityByItem = new Map<string, { item: MenuItemRow; quantity: number }>();

  for (const requested of items) {
    const menuItem = menuById.get(requested.menu_item_id);
    if (!menuItem) {
      return fail("UNKNOWN_MENU_ITEM", "En eller flera rätter finns inte längre.");
    }

    // En order kan bara innehålla rätter från en restaurang. Utan kontrollen
    // skulle avgiften, notan och köksskärmen tillhöra olika restauranger.
    if (restaurantId === null) {
      restaurantId = menuItem.restaurantId;
    } else if (restaurantId !== menuItem.restaurantId) {
      return fail(
        "MIXED_RESTAURANTS",
        "En order kan bara innehålla rätter från en restaurang.",
      );
    }

    if (!menuItem.isAvailable || menuItem.status !== "PUBLISHED") {
      return fail("ITEM_UNAVAILABLE", `${menuItem.name} går inte att beställa just nu.`);
    }

    const allowedGroups = groupsByItem.get(menuItem.id) ?? [];
    const allowedGroupIds = new Set(allowedGroups.map((group) => group.id));

    const chosenOptions: PricedOption[] = [];
    const perGroupCount = new Map<string, number>();
    const seen = new Set<string>();

    for (const selected of requested.options) {
      if (seen.has(selected.option_id)) {
        return fail("DUPLICATE_OPTION", "Samma tillval kan bara väljas en gång per rad.");
      }
      seen.add(selected.option_id);

      const option = optionById.get(selected.option_id);
      if (!option) {
        return fail("UNKNOWN_OPTION", "Ett eller flera tillval finns inte längre.");
      }

      // Kärnkontrollen: hör tillvalet till EN AV DEN HÄR RÄTTENS grupper?
      if (!allowedGroupIds.has(option.optionGroupId)) {
        return fail(
          "OPTION_NOT_ON_ITEM",
          `${option.name} går inte att välja till ${menuItem.name}.`,
        );
      }

      if (!option.isAvailable) {
        return fail("OPTION_UNAVAILABLE", `${option.name} är slut just nu.`);
      }

      perGroupCount.set(option.optionGroupId, (perGroupCount.get(option.optionGroupId) ?? 0) + 1);

      chosenOptions.push({
        optionId: option.id,
        name: option.name,
        priceOre: option.priceOre,
      });
    }

    for (const group of allowedGroups) {
      const count = perGroupCount.get(group.id) ?? 0;

      if (count < group.minSelect) {
        return fail(
          "TOO_FEW_OPTIONS",
          `${menuItem.name}: välj minst ${group.minSelect} i "${group.name}".`,
        );
      }
      if (count > group.maxSelect) {
        return fail(
          "TOO_MANY_OPTIONS",
          `${menuItem.name}: välj högst ${group.maxSelect} i "${group.name}".`,
        );
      }
    }

    const tally = quantityByItem.get(menuItem.id);
    if (tally) tally.quantity += requested.quantity;
    else quantityByItem.set(menuItem.id, { item: menuItem, quantity: requested.quantity });

    lines.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      unitPriceOre: menuItem.priceOre,
      quantity: requested.quantity,
      vatRateBps: menuItem.vatRateBps,
      options: chosenOptions,
    });
  }

  for (const { item, quantity } of quantityByItem.values()) {
    const minimum = item.minQuantity ?? 1;
    if (quantity < minimum) {
      return fail(
        "BELOW_MIN_QUANTITY",
        `${item.name} beställs i minst ${minimum} portioner.`,
      );
    }
  }

  if (restaurantId === null) {
    return fail("UNKNOWN_MENU_ITEM", "Ordern innehåller inga rätter.");
  }

  return { ok: true, restaurantId, lines };
}

function fail(code: OrderBuildErrorCode, message: string): BuildLinesResult {
  return { ok: false, error: { code, message } };
}
