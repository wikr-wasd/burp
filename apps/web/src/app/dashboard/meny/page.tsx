import type { Metadata } from "next";
import { StaffHeader } from "@/components/staff/staff-header";
import { MenuEditor } from "@/components/staff/menu-editor";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Menyhantering (avsnitt 11).
 *
 * Hela menyträdet laddas i ett svep och redigeras på plats. Alternativet —
 * en sida per nivå — betyder att den som lägger upp en restaurang klickar sig
 * fram och tillbaka trettio gånger för en meny med femton rätter.
 */

export const metadata: Metadata = {
  title: "Meny",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface EditorOption {
  id: string;
  name: string;
  priceOre: number;
  isAvailable: boolean;
}

export interface EditorOptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: EditorOption[];
}

export interface EditorItem {
  id: string;
  name: string;
  description: string | null;
  priceOre: number;
  vatRateBps: number;
  allergens: string[];
  isAvailable: boolean;
  status: string;
  optionGroups: EditorOptionGroup[];
}

export interface EditorCategory {
  id: string;
  name: string;
  items: EditorItem[];
}

export interface EditorMenu {
  id: string;
  name: string;
  status: string;
  activeDays: number[];
  activeFrom: string | null;
  activeUntil: string | null;
  categories: EditorCategory[];
}

export default async function MenuPage() {
  const staff = await requireStaff(["owner", "manager"]);
  const supabase = await createClient();

  const { data: menus } = await supabase
    .from("menus")
    .select("id, name, status, active_days, active_from, active_until, sort_order")
    .eq("restaurant_id", staff.restaurantId)
    .order("sort_order", { ascending: true });

  const menuIds = (menus ?? []).map((menu) => menu.id);

  const { data: categories } = menuIds.length
    ? await supabase
        .from("menu_categories")
        .select("id, menu_id, name, sort_order")
        .in("menu_id", menuIds)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const categoryIds = (categories ?? []).map((category) => category.id);

  const { data: items } = categoryIds.length
    ? await supabase
        .from("menu_items")
        .select(
          "id, category_id, name, description, price_ore, vat_rate_bps, allergens, is_available, status, sort_order",
        )
        .in("category_id", categoryIds)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const itemIds = (items ?? []).map((item) => item.id);

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

  const optionsByGroup = group(options ?? [], (option) => option.option_group_id);
  const groupsByItem = group(groups ?? [], (row) => row.menu_item_id);
  const itemsByCategory = group(items ?? [], (item) => item.category_id);
  const categoriesByMenu = group(categories ?? [], (category) => category.menu_id);

  const tree: EditorMenu[] = (menus ?? []).map((menu) => ({
    id: menu.id,
    name: menu.name,
    status: menu.status,
    activeDays: menu.active_days ?? [0, 1, 2, 3, 4, 5, 6],
    activeFrom: menu.active_from,
    activeUntil: menu.active_until,
    categories: (categoriesByMenu.get(menu.id) ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      items: (itemsByCategory.get(category.id) ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        priceOre: item.price_ore,
        vatRateBps: item.vat_rate_bps,
        allergens: item.allergens ?? [],
        isAvailable: item.is_available,
        status: item.status,
        optionGroups: (groupsByItem.get(item.id) ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          minSelect: row.min_select,
          maxSelect: row.max_select,
          options: (optionsByGroup.get(row.id) ?? []).map((option) => ({
            id: option.id,
            name: option.name,
            priceOre: option.price_ore,
            isAvailable: option.is_available,
          })),
        })),
      })),
    })),
  }));

  return (
    <>
      <StaffHeader staff={staff} current="dashboard" />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold">Meny</h1>
        <p className="mt-1 text-sm opacity-70">
          Bara publicerade menyer och rätter syns för gästen. Priser anges inklusive moms.
        </p>
        <MenuEditor menus={tree} />
      </main>
    </>
  );
}

function group<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const existing = map.get(key(row));
    if (existing) existing.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}
