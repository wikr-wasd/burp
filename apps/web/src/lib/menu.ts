import "server-only";

import { availabilityState, pickMenuForNow, type AvailabilityRule, type Ore } from "@burp/core";
import { resolveMediaUrl } from "./media-url";
import { createAdminClient } from "./supabase/admin";

/**
 * Hämtar den meny som gäller just nu för en restaurang.
 *
 * En restaurang kan ha flera menyer med olika giltighetstider — lunch, kväll,
 * helg. Vilken som visas avgörs av veckodag och klockslag i RESTAURANGENS
 * tidszon, inte av gästens telefon och inte av serverns.
 *
 * Läsningen går via service role eftersom QR-gästen är anonym och saknar
 * `auth.uid()`. Frågorna filtrerar därför explicit på restaurant_id.
 */

export interface MenuOption {
  id: string;
  name: string;
  priceOre: Ore;
  isAvailable: boolean;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  priceOre: Ore;
  vatRateBps: number;
  allergens: string[];
  imageUrl: string | null;
  isAvailable: boolean;
  /**
   * Varför rätten inte går att beställa, när restaurangen skrivit ett skäl.
   *
   * "Slut till fredag" hjälper gästen att komma tillbaka; "slut för dagen"
   * gör det inte. Null när rätten är tillgänglig eller när inget skäl angetts.
   */
  unavailableReason: string | null;
  optionGroups: MenuOptionGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  items: MenuItem[];
}

export interface Menu {
  id: string;
  name: string;
  categories: MenuCategory[];
}

/**
 * Returnerar null om restaurangen inte har någon publicerad meny som gäller nu.
 *
 * `timeZone` är obligatorisk och kommer från restaurangens land. Ett
 * standardvärde här hade betytt att en restaurang i fel tidszon fick fel meny
 * utan att någon märkte det förrän en gäst beställde lunch klockan nio.
 */
export async function getActiveMenu(
  restaurantId: string,
  timeZone: string,
  now = new Date(),
): Promise<Menu | null> {
  const supabase = createAdminClient();

  const { data: menus } = await supabase
    .from("menus")
    .select("id, name, active_days, active_from, active_until, sort_order")
    .eq("restaurant_id", restaurantId)
    .eq("status", "PUBLISHED")
    .order("sort_order", { ascending: true });

  if (!menus || menus.length === 0) return null;

  // Valet av meny är delad affärslogik och ligger i @burp/core, så att appen
  // gör exakt samma bedömning som webben.
  const menu = pickMenuForNow(
    menus.map((row) => ({
      ...row,
      activeDays: row.active_days,
      activeFrom: row.active_from,
      activeUntil: row.active_until,
    })),
    timeZone,
    now,
  );
  if (!menu) return null;

  // Ett anrop per nivå i stället för en djup nästlad select. Tre frågor är
  // billigare än en join som multiplicerar rader per tillval, och gör det
  // enklare att se vad som faktiskt hämtas.
  const { data: categories } = await supabase
    .from("menu_categories")
    .select("id, name, description, sort_order")
    .eq("menu_id", menu.id)
    .order("sort_order", { ascending: true });

  if (!categories || categories.length === 0) {
    return { id: menu.id, name: menu.name, categories: [] };
  }

  const { data: items } = await supabase
    .from("menu_items")
    .select(
      "id, category_id, name, description, price_ore, vat_rate_bps, allergens, image_url, is_available, sort_order",
    )
    .in(
      "category_id",
      categories.map((category) => category.id),
    )
    .eq("status", "PUBLISHED")
    .order("sort_order", { ascending: true });

  const itemIds = (items ?? []).map((item) => item.id);

  /*
   * Schemalagd tillgänglighet (`item_availability`).
   *
   * Skild från `is_available`, som är dagens av/på-knapp. Den här bär regler
   * som ska sluta gälla av sig själva — "slut till fredag", "bara till lunch"
   * — så att ingen behöver komma ihåg att tända rätten igen.
   *
   * Reglerna läses här och avgörs i @burp/core, inte i SQL. Samma bedömning
   * måste kunna göras i appen, och en regel som bara finns i en where-sats
   * går inte att återanvända.
   */
  const { data: availability } = itemIds.length
    ? await supabase
        .from("item_availability")
        .select("menu_item_id, available_from, available_to, weekday, reason")
        .in("menu_item_id", itemIds)
    : { data: [] };

  const rulesByItem = groupBy(
    (availability ?? []).map((row) => ({
      menu_item_id: row.menu_item_id,
      availableFrom: row.available_from,
      availableTo: row.available_to,
      weekday: row.weekday,
      reason: row.reason,
    })),
    (row) => row.menu_item_id,
  );

  const { data: groups } = itemIds.length
    ? await supabase
        .from("option_groups")
        .select("id, menu_item_id, name, min_select, max_select, sort_order")
        .in("menu_item_id", itemIds)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const groupIds = (groups ?? []).map((group) => group.id);

  const { data: options } = groupIds.length
    ? await supabase
        .from("options")
        .select("id, option_group_id, name, price_ore, is_available, sort_order")
        .in("option_group_id", groupIds)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const optionsByGroup = groupBy(options ?? [], (option) => option.option_group_id);
  const groupsByItem = groupBy(groups ?? [], (group) => group.menu_item_id);
  const itemsByCategory = groupBy(items ?? [], (item) => item.category_id);

  return {
    id: menu.id,
    name: menu.name,
    categories: categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        items: (itemsByCategory.get(category.id) ?? []).map((item) => {
          const scheduled = availabilityState(
            (rulesByItem.get(item.id) ?? []) as AvailabilityRule[],
            timeZone,
            now,
          );

          return {
          id: item.id,
          name: item.name,
          description: item.description,
          priceOre: item.price_ore,
          vatRateBps: item.vat_rate_bps,
          allergens: item.allergens ?? [],
          imageUrl: resolveMediaUrl(item.image_url),
          // Båda måste släppa igenom. Av/på-knappen är personalens omedelbara
          // beslut och ska aldrig kunna kringgås av ett schema.
          isAvailable: item.is_available && scheduled.isAvailable,
          unavailableReason: scheduled.isAvailable ? null : scheduled.reason,
          optionGroups: (groupsByItem.get(item.id) ?? []).map((group) => ({
            id: group.id,
            name: group.name,
            minSelect: group.min_select,
            maxSelect: group.max_select,
            options: (optionsByGroup.get(group.id) ?? []).map((option) => ({
              id: option.id,
              name: option.name,
              priceOre: option.price_ore,
              isAvailable: option.is_available,
            })),
          })),
          };
        }),
      }))
      // Tomma kategorier ska inte visas för gästen.
      .filter((category) => category.items.length > 0),
  };
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const existing = map.get(key(row));
    if (existing) existing.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}
