"use server";

import { revalidatePath } from "next/cache";
import { allowedVatRates, COUNTRY_INFO, parseAmount } from "@burp/core";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Menyhantering (avsnitt 11).
 *
 * Bara ägare och chef. Personal och kock har ingen anledning att kunna ändra
 * priser, och RLS på menytabellerna släpper ändå bara igenom de två rollerna —
 * `requireStaff` här är för att ge ett begripligt svar i stället för ett tomt
 * databasfel.
 *
 * Alla skrivningar går via personalens egen session. Service role används inte
 * någonstans i den här filen: gör den det försvinner skyddsnätet som hindrar
 * att en restaurang råkar redigera en annans meny.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const EDITOR_ROLES = ["owner", "manager"] as const;

const ok: ActionResult = { ok: true };
const fail = (message: string): ActionResult => ({ ok: false, message });

function done(): ActionResult {
  revalidatePath("/dashboard/meny");
  return ok;
}

/* ── Menyer ──────────────────────────────────────────────────────────────── */

export async function createMenu(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Menyn behöver ett namn.");
  if (name.length > 120) return fail("Namnet är för långt.");

  const supabase = await createClient();
  const { error } = await supabase.from("menus").insert({
    restaurant_id: staff.restaurantId,
    name,
    status: "DRAFT",
  });

  return error ? fail(error.message) : done();
}

export async function updateMenu(menuId: string, patch: {
  name?: string;
  activeDays?: number[];
  activeFrom?: string | null;
  activeUntil?: string | null;
}): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const update: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return fail("Menyn behöver ett namn.");
    update["name"] = name;
  }

  if (patch.activeDays !== undefined) {
    const days = patch.activeDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (days.length === 0) return fail("Menyn måste gälla minst en dag.");
    update["active_days"] = [...new Set(days)].sort();
  }

  // Tom sträng betyder "hela dagen" och lagras som null, inte som "00:00" —
  // annars går det inte att skilja på en meny utan tidsfönster och en som
  // råkar börja vid midnatt.
  if (patch.activeFrom !== undefined) update["active_from"] = patch.activeFrom || null;
  if (patch.activeUntil !== undefined) update["active_until"] = patch.activeUntil || null;

  const from = (update["active_from"] ?? null) as string | null;
  const until = (update["active_until"] ?? null) as string | null;
  if (from && until && from >= until) {
    return fail("Sluttiden måste ligga efter starttiden.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("menus").update(update).eq("id", menuId);

  return error ? fail(error.message) : done();
}

export async function setMenuStatus(menuId: string, publish: boolean): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();

  if (publish) {
    // En publicerad meny utan publicerade rätter ger gästen en tom sida vid
    // bordet. Bättre att säga ifrån här än att någon upptäcker det mitt i en
    // lunchrush. Räknas via kategorierna, som är det enda som binder en rätt
    // till en meny.
    const { count } = await supabase
      .from("menu_items")
      .select("id, menu_categories!inner(menu_id)", { count: "exact", head: true })
      .eq("menu_categories.menu_id", menuId)
      .eq("status", "PUBLISHED");

    if (!count) {
      return fail("Menyn har inga publicerade rätter än. Publicera minst en rätt först.");
    }
  }

  const { error } = await supabase
    .from("menus")
    .update({ status: publish ? "PUBLISHED" : "DRAFT" })
    .eq("id", menuId);

  return error ? fail(error.message) : done();
}

export async function deleteMenu(menuId: string): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.from("menus").delete().eq("id", menuId);

  return error ? fail(error.message) : done();
}

/* ── Kategorier ──────────────────────────────────────────────────────────── */

export async function createCategory(menuId: string, name: string): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

  const trimmed = name.trim();
  if (!trimmed) return fail("Kategorin behöver ett namn.");

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("menu_categories")
    .select("sort_order")
    .eq("menu_id", menuId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("menu_categories").insert({
    menu_id: menuId,
    restaurant_id: staff.restaurantId,
    name: trimmed,
    sort_order: (last?.sort_order ?? -1) + 1,
  });

  return error ? fail(error.message) : done();
}

export async function renameCategory(categoryId: string, name: string): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const trimmed = name.trim();
  if (!trimmed) return fail("Kategorin behöver ett namn.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_categories")
    .update({ name: trimmed })
    .eq("id", categoryId);

  return error ? fail(error.message) : done();
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();

  // Kategorin kaskaderar till sina rätter. Det är avsiktligt men värt att
  // varna för i gränssnittet, inte tyst radera en halv meny.
  const { error } = await supabase.from("menu_categories").delete().eq("id", categoryId);

  return error ? fail(error.message) : done();
}

/* ── Rätter ──────────────────────────────────────────────────────────────── */

export async function createMenuItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

  const categoryId = String(formData.get("category_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const priceInput = String(formData.get("price") ?? "");

  if (!categoryId) return fail("Ingen kategori vald.");
  if (!name) return fail("Rätten behöver ett namn.");

  const priceOre = parseAmount(priceInput, staff.currency);
  if (priceOre === null) {
    return fail(`"${priceInput}" är inte ett giltigt pris i ${staff.currency}.`);
  }
  if (priceOre < 0) return fail("Priset kan inte vara negativt.");

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("menu_items")
    .select("sort_order")
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("menu_items").insert({
    category_id: categoryId,
    restaurant_id: staff.restaurantId,
    name,
    price_ore: priceOre,
    // Matmomsen i restaurangens land. Bosnien har bara en sats; där är
    // "reducerad" och "standard" samma tal, vilket är avsiktligt.
    vat_rate_bps: COUNTRY_INFO[staff.country].vat.reduced,
    status: "DRAFT",
    sort_order: (last?.sort_order ?? -1) + 1,
  });

  return error ? fail(error.message) : done();
}

export interface MenuItemPatch {
  name?: string;
  description?: string | null;
  price?: string;
  vatRateBps?: number;
  allergens?: string[];
  isAvailable?: boolean;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

export async function updateMenuItem(itemId: string, patch: MenuItemPatch): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

  const update: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return fail("Rätten behöver ett namn.");
    update["name"] = name;
  }

  if (patch.description !== undefined) {
    update["description"] = patch.description?.trim() || null;
  }

  if (patch.price !== undefined) {
    const priceOre = parseAmount(patch.price, staff.currency);
    if (priceOre === null) {
      return fail(`"${patch.price}" är inte ett giltigt pris i ${staff.currency}.`);
    }
    if (priceOre < 0) return fail("Priset kan inte vara negativt.");
    update["price_ore"] = priceOre;
  }

  if (patch.vatRateBps !== undefined) {
    // Bara satserna som gäller i restaurangens land. Ett fritt fält gör en
    // felskrivning till en momsavvikelse, och den upptäcks i bokföringen.
    // Databasen kontrollerar samma sak (migration 0019); det här är för att ge
    // ett begripligt fel i stället för ett constraint-brott.
    const allowed = allowedVatRates(staff.country);
    if (!allowed.includes(patch.vatRateBps)) {
      const readable = allowed.map((bps) => `${bps / 100} %`).join(" eller ");
      return fail(`Momssatsen måste vara ${readable} i ${staff.country}.`);
    }
    update["vat_rate_bps"] = patch.vatRateBps;
  }

  if (patch.allergens !== undefined) {
    update["allergens"] = patch.allergens
      .map((allergen) => allergen.trim())
      .filter((allergen) => allergen.length > 0 && allergen.length <= 60)
      .slice(0, 30);
  }

  if (patch.isAvailable !== undefined) update["is_available"] = patch.isAvailable;
  if (patch.status !== undefined) update["status"] = patch.status;

  if (Object.keys(update).length === 0) return ok;

  const supabase = await createClient();
  const { error } = await supabase.from("menu_items").update(update).eq("id", itemId);

  return error ? fail(error.message) : done();
}

export async function deleteMenuItem(itemId: string): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();

  // Rätten går att radera trots att den kan finnas i gamla order — FK:n är
  // ON DELETE SET NULL och `order_items.name_snapshot` bevarar vad gästen
  // faktiskt köpte. Historiken överlever alltså att menyn städas.
  const { error } = await supabase.from("menu_items").delete().eq("id", itemId);

  return error ? fail(error.message) : done();
}

/**
 * Flyttar en rad ett steg upp eller ned genom att byta sort_order med grannen.
 *
 * Två skrivningar i stället för en omnumrering av hela listan. Räcker gott för
 * en meny, och gör att två personer som sorterar samtidigt inte skriver över
 * varandras hela ordning.
 */
export async function moveMenuItem(itemId: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("menu_items")
    .select("id, category_id, sort_order")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return fail("Rätten hittades inte.");

  const { data: neighbour } = await supabase
    .from("menu_items")
    .select("id, sort_order")
    .eq("category_id", item.category_id)
    .order("sort_order", { ascending: direction === "down" })
    [direction === "down" ? "gt" : "lt"]("sort_order", item.sort_order)
    .limit(1)
    .maybeSingle();

  if (!neighbour) return ok; // Redan först eller sist.

  const [a, b] = await Promise.all([
    supabase.from("menu_items").update({ sort_order: neighbour.sort_order }).eq("id", item.id),
    supabase.from("menu_items").update({ sort_order: item.sort_order }).eq("id", neighbour.id),
  ]);

  if (a.error || b.error) return fail((a.error ?? b.error)!.message);
  return done();
}

/* ── Tillvalsgrupper och tillval ─────────────────────────────────────────── */

export async function createOptionGroup(
  menuItemId: string,
  name: string,
  minSelect: number,
  maxSelect: number,
): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

  const trimmed = name.trim();
  if (!trimmed) return fail("Gruppen behöver ett namn.");
  if (!Number.isInteger(minSelect) || minSelect < 0) return fail("Minsta antal måste vara 0 eller mer.");
  if (!Number.isInteger(maxSelect) || maxSelect < 1) return fail("Högsta antal måste vara minst 1.");
  if (minSelect > maxSelect) return fail("Minsta antal kan inte vara större än högsta.");

  const supabase = await createClient();
  const { error } = await supabase.from("option_groups").insert({
    menu_item_id: menuItemId,
    restaurant_id: staff.restaurantId,
    name: trimmed,
    min_select: minSelect,
    max_select: maxSelect,
  });

  return error ? fail(error.message) : done();
}

export async function deleteOptionGroup(groupId: string): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.from("option_groups").delete().eq("id", groupId);

  return error ? fail(error.message) : done();
}

export async function createOption(
  groupId: string,
  name: string,
  priceInput: string,
): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

  const trimmed = name.trim();
  if (!trimmed) return fail("Tillvalet behöver ett namn.");

  // Negativa tillval är tillåtna ("bez luka, −1,00 KM"). Att raden i sin helhet
  // inte kan bli negativ kontrolleras av @burp/core vid beställning.
  const priceOre = parseAmount(priceInput || "0", staff.currency);
  if (priceOre === null) {
    return fail(`"${priceInput}" är inte ett giltigt pris i ${staff.currency}.`);
  }

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("options")
    .select("sort_order")
    .eq("option_group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("options").insert({
    option_group_id: groupId,
    restaurant_id: staff.restaurantId,
    name: trimmed,
    price_ore: priceOre,
    sort_order: (last?.sort_order ?? -1) + 1,
  });

  return error ? fail(error.message) : done();
}

export async function setOptionAvailable(optionId: string, available: boolean): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("options")
    .update({ is_available: available })
    .eq("id", optionId);

  return error ? fail(error.message) : done();
}

export async function deleteOption(optionId: string): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.from("options").delete().eq("id", optionId);

  return error ? fail(error.message) : done();
}
