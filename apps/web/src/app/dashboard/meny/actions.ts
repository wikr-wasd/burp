"use server";

import { revalidatePath } from "next/cache";
import {
  parseAllergens, allowedVatRates, COUNTRY_INFO, parseAmount } from "@burp/core";
import { requireStaff, staffErrors } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TableUpdate } from "@/lib/supabase/types";

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
  if (!name) return fail(staffErrors(staff).menuNeedsName);
  if (name.length > 120) return fail(staffErrors(staff).nameTooLong);

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
  const staff = await requireStaff(EDITOR_ROLES);

  const update: TableUpdate<"menus"> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return fail(staffErrors(staff).menuNeedsName);
    update["name"] = name;
  }

  if (patch.activeDays !== undefined) {
    const days = patch.activeDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (days.length === 0) return fail(staffErrors(staff).menuNeedsDay);
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
    return fail(staffErrors(staff).endAfterStart);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("menus").update(update).eq("id", menuId);

  return error ? fail(error.message) : done();
}

export async function setMenuStatus(menuId: string, publish: boolean): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

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
      return fail(staffErrors(staff).menuNoPublishedItems);
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
  if (!trimmed) return fail(staffErrors(staff).categoryNeedsName);

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
  const staff = await requireStaff(EDITOR_ROLES);

  const trimmed = name.trim();
  if (!trimmed) return fail(staffErrors(staff).categoryNeedsName);

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
  if (!name) return fail(staffErrors(staff).itemNeedsName);

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
  /** Minsta antal portioner i samma beställning. 1 = ingen begränsning. */
  minQuantity?: number;
}

export async function updateMenuItem(itemId: string, patch: MenuItemPatch): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

  const update: TableUpdate<"menu_items"> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return fail(staffErrors(staff).itemNeedsName);
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
    /*
     * Bara koder, aldrig fritext (migration 0071).
     *
     * `parseAllergens()` tolkar även gamla stavningar — `mlijeko` och `mleko`
     * blir båda MILK — och låter det som inte går att tolka falla bort. En
     * rätt som tappar en allergen är fel; en rätt som får FEL allergen är
     * farligare, och en gissning är precis det.
     *
     * Check-villkoret i databasen säger samma sak. Det här är inte en andra
     * regel utan samma, tidigare — så att felet blir ett tomt fält i stället
     * för ett constraint-brott ingen kan agera på.
     */
    update["allergens"] = parseAllergens(patch.allergens);
  }

  if (patch.isAvailable !== undefined) update["is_available"] = patch.isAvailable;
  if (patch.status !== undefined) update["status"] = patch.status;

  if (patch.minQuantity !== undefined) {
    /*
     * Taket är 99 därför att orderschemat inte tar emot fler per rad. En gräns
     * på hundra hade gjort rätten omöjlig att beställa — vilket ser ut som en
     * bugg i beställningen och är ett datafel i menyn. Check-constraintet i
     * migration 0052 säger samma sak; det här finns för att ge ett begripligt
     * fel i stället för ett constraint-brott.
     */
    if (!Number.isInteger(patch.minQuantity) || patch.minQuantity < 1 || patch.minQuantity > 99) {
      return fail("Minsta antal måste vara mellan 1 och 99.");
    }
    update["min_quantity"] = patch.minQuantity;
  }

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
  const staff = await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("menu_items")
    .select("id, category_id, sort_order")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return fail(staffErrors(staff).itemNotFound);

  // Nedåt söker vi nästa högre sort_order, uppåt nästa lägre. Jämförelsen
  // plockas ut i en variabel — kedjad computed access på egen rad är en
  // ASI-fälla som fungerar tills någon lägger till en rad ovanför.
  const comparison = direction === "down" ? "gt" : "lt";

  const neighbourQuery = supabase
    .from("menu_items")
    .select("id, sort_order")
    .eq("category_id", item.category_id)
    .order("sort_order", { ascending: direction === "down" });

  const { data: neighbour } = await neighbourQuery[comparison](
    "sort_order",
    item.sort_order,
  )
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
  if (!trimmed) return fail(staffErrors(staff).groupNeedsName);
  if (!Number.isInteger(minSelect) || minSelect < 0) return fail(staffErrors(staff).minAtLeastZero);
  if (!Number.isInteger(maxSelect) || maxSelect < 1) return fail(staffErrors(staff).maxAtLeastOne);
  if (minSelect > maxSelect) return fail(staffErrors(staff).minNotAboveMax);

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
  if (!trimmed) return fail(staffErrors(staff).optionNeedsName);

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

/* ── Schemalagd tillgänglighet ───────────────────────────────────────────── */

/**
 * Markerar en rätt som slut fram till en tidpunkt.
 *
 * Skild från av/på-knappen, som är omedelbar och måste stängas av för hand.
 * Den här slutar gälla av sig själv — och det är hela poängen: en kock som
 * släcker en rätt manuellt måste också tända den igen, och det steget är det
 * som glöms. Rätten ligger kvar som slutsåld i en vecka och ingen märker det
 * förrän en gäst frågar.
 *
 * Befintliga regler för rätten ersätts. Två överlappande "slut till"-regler
 * betyder i praktiken den senare av dem, och att låta båda ligga kvar gör
 * bara listan obegriplig för nästa person som tittar.
 */
export async function setItemUnavailableUntil(
  itemId: string,
  until: string,
  reason: string,
): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

  const at = new Date(until);
  if (Number.isNaN(at.getTime())) return fail("Tiden gick inte att tolka.");
  if (at.getTime() <= Date.now()) {
    return fail(staffErrors(staff).timeMustBeFuture);
  }

  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("item_availability")
    .delete()
    .eq("menu_item_id", itemId);

  if (clearError) return fail(clearError.message);

  const { error } = await supabase.from("item_availability").insert({
    menu_item_id: itemId,
    restaurant_id: staff.restaurantId,
    // Rätten är tillgänglig FRÅN tidpunkten. Att uttrycka "slut till fredag"
    // som ett fönster som börjar på fredagen är samma sak, och slipper en
    // andra tolkning av vad raden betyder.
    available_from: at.toISOString(),
    available_to: null,
    weekday: null,
    reason: reason.trim().slice(0, 200) || null,
  });

  return error ? fail(error.message) : done();
}

/** Tar bort schemalagd otillgänglighet och gör rätten valbar igen. */
export async function clearItemAvailability(itemId: string): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_availability")
    .delete()
    .eq("menu_item_id", itemId);

  return error ? fail(error.message) : done();
}

/**
 * Markerar en avdelning som dryck.
 *
 * Kundvagnen föreslår något att dricka när gästen inte redan valt det, och
 * måste veta vilka rätter som är drycker. Det går inte att gissa ur namnet:
 * menyn skrivs på restaurangens eget språk, och "Pića", "Getränke" och "Dryck"
 * är samma sak för en gäst men tre strängar för en jämförelse.
 */
export async function setCategoryIsDrinks(
  categoryId: string,
  isDrinks: boolean,
): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_categories")
    .update({ is_drinks: isDrinks })
    .eq("id", categoryId);

  return error ? fail(error.message) : done();
}

/**
 * Lägger till ett förslag: "till den här rätten, föreslå den där".
 *
 * Ingen prisuppgift skickas eller sparas. Förslaget säger VAD, aldrig vad det
 * kostar — priset hämtas ur menyn när ordern läggs (regel 2).
 *
 * Att båda rätterna hör till restaurangen kontrolleras av den sammansatta
 * främmande nyckeln i migration 0052, inte här. `restaurant_id` sätts ur
 * sessionen, så en manipulerad `suggested_item_id` från en annan restaurang
 * faller på en nyckelöverträdelse i stället för att sparas.
 */
export async function addUpsell(
  sourceItemId: string,
  suggestedItemId: string,
): Promise<ActionResult> {
  const staff = await requireStaff(EDITOR_ROLES);

  if (sourceItemId === suggestedItemId) {
    return fail("En rätt kan inte föreslå sig själv.");
  }

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("item_upsells")
    .select("sort_order")
    .eq("source_item_id", sourceItemId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("item_upsells").insert({
    restaurant_id: staff.restaurantId,
    source_item_id: sourceItemId,
    suggested_item_id: suggestedItemId,
    sort_order: (last?.sort_order ?? -1) + 1,
  });

  // Samma par två gånger är inget fel värt ett larm — förslaget finns redan.
  if (error && error.code === "23505") return done();

  return error ? fail(error.message) : done();
}

export async function removeUpsell(
  sourceItemId: string,
  suggestedItemId: string,
): Promise<ActionResult> {
  await requireStaff(EDITOR_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_upsells")
    .delete()
    .eq("source_item_id", sourceItemId)
    .eq("suggested_item_id", suggestedItemId);

  return error ? fail(error.message) : done();
}
