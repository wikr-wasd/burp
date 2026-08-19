import "server-only";

import {
  availabilityState,
  buildPricedLines,
  calculateOrderTotals,
  COUNTRY_INFO,
  type CountryCode,
  type CurrencyCode,
  type OrderBuildError,
  type OrderTotals,
  type PricedLine,
} from "@burp/core";
import { createAdminClient } from "./supabase/admin";

/**
 * Vägen från "vad gästen bad om" till "vad det kostar".
 *
 * Ligger här och inte i route handlern därför att TVÅ ytor behöver exakt samma
 * uträkning: `POST /api/orders` som lägger ordern, och kupongförhandsvisningen
 * som ska kunna säga vad koden är värd innan gästen trycker. Två kopior av det
 * här steget hade glidit isär — och den dagen visar menyn en rabatt servern
 * sedan räknar annorlunda, vilket avbryter beställningen med "priset har
 * ändrats" utan att någon förstår varför.
 *
 * Den bärande regeln är oförändrad: KLIENTEN SKICKAR ALDRIG IN ETT PRIS.
 * Requesten säger bara vilka rätter och tillval som beställs; priserna hämtas
 * ur menyn här.
 */

export interface RequestedItemInput {
  menu_item_id: string;
  quantity: number;
  options: readonly { option_id: string }[];
}

export type PricedCart =
  | {
      ok: true;
      restaurantId: string;
      country: CountryCode;
      currency: CurrencyCode;
      lines: PricedLine[];
      totals: OrderTotals;
    }
  | { ok: false; status: number; title: string; detail: string; code?: string };

export async function priceRequestedItems(input: {
  items: readonly RequestedItemInput[];
  tipOre?: number;
  discountOre?: number;
  /** Bordsflödet vet redan vilken restaurang det gäller. */
  expectedRestaurantId?: string | null;
}): Promise<PricedCart> {
  const supabase = createAdminClient();

  const menuItemIds = [...new Set(input.items.map((item) => item.menu_item_id))];

  const { data: menuItems, error: menuError } = await supabase
    .from("menu_items")
    .select("id, restaurant_id, name, price_ore, vat_rate_bps, is_available, status")
    .in("id", menuItemIds);

  if (menuError || !menuItems || menuItems.length !== menuItemIds.length) {
    return {
      ok: false,
      status: 400,
      title: "Okänd menyrad",
      detail: "En eller flera rätter finns inte längre.",
    };
  }

  // Grupperna hämtas per RÄTT, inte per valt tillval. Det är den kopplingen
  // som avgör vilka tillval som faktiskt får väljas — hämtas tillvalen bara på
  // sina egna id:n går det att hänga ett tillval från en annan rätt på ordern.
  const { data: optionGroups, error: groupsError } = await supabase
    .from("option_groups")
    .select("id, menu_item_id, name, min_select, max_select")
    .in("menu_item_id", menuItemIds);

  if (groupsError || !optionGroups) {
    return { ok: false, status: 500, title: "Menyn kunde inte läsas", detail: "Försök igen." };
  }

  const { data: options, error: optionsError } = optionGroups.length
    ? await supabase
        .from("options")
        .select("id, option_group_id, name, price_ore, is_available")
        .in(
          "option_group_id",
          optionGroups.map((group) => group.id),
        )
    : { data: [], error: null };

  if (optionsError || !options) {
    return { ok: false, status: 500, title: "Menyn kunde inte läsas", detail: "Försök igen." };
  }

  /*
   * Schemalagd otillgänglighet gäller även här.
   *
   * `is_available` är dagens av/på-knapp; `item_availability` bär reglerna som
   * släcker sig själva ("slut till fredag"). Menyvyn respekterar båda — men
   * menyvyn är klientkod, och den som anropar API:t direkt har aldrig sett
   * den. Utan kontrollen går en schemalagt slutsåld rätt att beställa, och
   * köket får en biljett på något de inte har.
   */
  const { data: availabilityRows, error: availabilityError } = await supabase
    .from("item_availability")
    .select("menu_item_id, available_from, available_to, weekday, reason")
    .in("menu_item_id", menuItemIds);

  if (availabilityError) {
    return { ok: false, status: 500, title: "Menyn kunde inte läsas", detail: "Försök igen." };
  }

  /*
   * Tidszonen är restaurangens, inte serverns.
   *
   * Veckodagen i en tillgänglighetsregel måste räknas där restaurangen står:
   * 00:30 i Sarajevo är fortfarande föregående dag i UTC, och på Vercel kör
   * servern i UTC. En fredagsregel hade då gällt en timme in på lördagen.
   */
  const { data: catalogRestaurant } = await supabase
    .from("restaurants")
    .select("country, currency")
    .eq("id", menuItems[0]!.restaurant_id)
    .maybeSingle();

  const country = (catalogRestaurant?.country as CountryCode | undefined) ?? "BA";
  const currency = (catalogRestaurant?.currency as CurrencyCode | undefined) ?? "BAM";
  const timeZone = COUNTRY_INFO[country].timeZone;

  const scheduledOut = new Set(
    menuItemIds.filter((id) => {
      const rules = (availabilityRows ?? [])
        .filter((row) => row.menu_item_id === id)
        .map((row) => ({
          availableFrom: row.available_from,
          availableTo: row.available_to,
          weekday: row.weekday,
          reason: row.reason,
        }));

      return !availabilityState(rules, timeZone).isAvailable;
    }),
  );

  const built = buildPricedLines(input.items, {
    menuItems: menuItems.map((row) => ({
      id: row.id,
      restaurantId: row.restaurant_id,
      name: row.name,
      priceOre: row.price_ore,
      vatRateBps: row.vat_rate_bps,
      isAvailable: row.is_available && !scheduledOut.has(row.id),
      status: row.status,
    })),
    optionGroups: optionGroups.map((row) => ({
      id: row.id,
      menuItemId: row.menu_item_id,
      name: row.name,
      minSelect: row.min_select,
      maxSelect: row.max_select,
    })),
    options: options.map((row) => ({
      id: row.id,
      optionGroupId: row.option_group_id,
      name: row.name,
      priceOre: row.price_ore,
      isAvailable: row.is_available,
    })),
  });

  if (!built.ok) return buildProblem(built.error);

  if (input.expectedRestaurantId && built.restaurantId !== input.expectedRestaurantId) {
    return {
      ok: false,
      status: 400,
      title: "Fel restaurang",
      detail: "Rätterna hör inte till det här bordet.",
    };
  }

  return {
    ok: true,
    restaurantId: built.restaurantId,
    country,
    currency,
    lines: built.lines,
    totals: calculateOrderTotals({
      lines: built.lines,
      tipOre: input.tipOre,
      discountOre: input.discountOre,
    }),
  };
}

function buildProblem(error: OrderBuildError): PricedCart {
  // 409 för sådant som ändrats sedan gästen laddade menyn, 400 för sådant som
  // aldrig var giltigt.
  const status =
    error.code === "ITEM_UNAVAILABLE" || error.code === "OPTION_UNAVAILABLE" ? 409 : 400;

  return {
    ok: false,
    status,
    title: "Beställningen kan inte läggas",
    detail: error.message,
    code: error.code,
  };
}
