"use client";

import { createContext, useActionState, useContext, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  formatAmountInput,
  formatMoney,
  vatRateOptions,
  type CountryCode,
  type CurrencyCode,
} from "@burp/core";
import {
  createCategory,
  clearItemAvailability,
  createMenu,
  createMenuItem,
  createOption,
  createOptionGroup,
  deleteCategory,
  deleteMenu,
  deleteMenuItem,
  deleteOption,
  deleteOptionGroup,
  moveMenuItem,
  renameCategory,
  setMenuStatus,
  setOptionAvailable,
  updateMenu,
  addUpsell,
  removeUpsell,
  setCategoryIsDrinks,
  setItemUnavailableUntil,
  updateMenuItem,
  type ActionResult,
} from "@/app/dashboard/meny/actions";
import type {
  EditorCategory,
  EditorItem,
  EditorMenu,
  EditorOptionGroup,
} from "@/app/dashboard/meny/page";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ImageUpload } from "@/components/staff/image-upload";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Menyredigeraren.
 *
 * Serveråtgärderna gör allt riktigt arbete och validerar allt som spelar roll.
 * Den här komponenten sköter tre saker: visa trädet, samla in vad någon skrev,
 * och visa felet när servern säger nej. Ingen validering som betyder något
 * ligger här — den som anropar åtgärden direkt möter exakt samma regler.
 */

/**
 * Veckodagarnas nycklar i JavaScripts ordning — söndag först.
 *
 * `menus.active_days` bär samma tal som `Date.getDay()`, så indexet HÄR är
 * datans och inte veckans. Därför går de inte att slå upp i ordbokens
 * `weekday`, som börjar på måndag.
 */
const DAY_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"] as const;

/**
 * Restaurangens land och valuta, tillgängligt i hela redigeraren.
 *
 * En kontext i stället för att skicka två props genom MenuCard →
 * CategoryBlock → ItemRow → OptionGroups → OptionGroupBlock. Varje nivå som
 * bara vidarebefordrar ett värde är en nivå där någon glömmer att göra det, och
 * priserna hamnar i fel valuta i just den vy där det inte upptäcks.
 */
/** Menyredigerarens texter. Rena strängar — komponenten är klientkod. */
export type MenuLabels = Dictionary["staff"]["menu"];

interface MenuLocale {
  country: CountryCode;
  currency: CurrencyCode;
  labels: MenuLabels;
  imageLabels: Dictionary["staff"]["image"];
}

const MenuLocaleContext = createContext<MenuLocale | null>(null);

function useMenuLocale(): MenuLocale {
  const value = useContext(MenuLocaleContext);
  if (!value) {
    throw new Error("Menyredigeraren måste ligga inuti MenuLocaleContext.");
  }
  return value;
}

/** Texterna ur samma kontext. Kortform, eftersom nästan varje block läser dem. */
function useMenuLabels(): MenuLabels {
  return useMenuLocale().labels;
}

export function MenuEditor({
  menus,
  restaurantId,
  country,
  currency,
  labels,
  imageLabels,
}: {
  menus: EditorMenu[];
  restaurantId: string;
  /** Restaurangens land. Avgör vilka momssatser som får väljas. */
  country: CountryCode;
  /** Restaurangens valuta. Avgör hur priser skrivs och tolkas. */
  currency: CurrencyCode;
  labels: MenuLabels;
  /** Bilduppladdningens besked. Delas med presentationen — se ordboken. */
  imageLabels: Dictionary["staff"]["image"];
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <MenuLocaleContext.Provider value={{ country, currency, labels, imageLabels }}>
    <div className="mt-8">
      {error ? (
        <p role="alert" className="mb-4 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <NewMenuForm />

      {menus.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={BookOpen}
            title={labels.noMenuTitle}
            body={labels.noMenuBody}
          />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {menus.map((menu) => (
            <MenuCard key={menu.id} menu={menu} restaurantId={restaurantId} onError={setError} />
          ))}
        </div>
      )}
    </div>
    </MenuLocaleContext.Provider>
  );
}

/* ── Meny ────────────────────────────────────────────────────────────────── */

function NewMenuForm() {
  const labels = useMenuLabels();
  const [result, formAction] = useActionState<ActionResult | null, FormData>(createMenu, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex-1 basis-48">
        <span className="label-caps">{labels.newMenu}</span>
        <input
          name="name"
          required
          maxLength={120}
          placeholder={labels.newMenuPlaceholder}
          className="field mt-1.5"
        />
      </label>
      <SubmitButton label={labels.createMenu} pendingLabel={labels.creating} />
      {result?.message ? <Feedback result={result} /> : null}
    </form>
  );
}

function MenuCard({
  menu,
  restaurantId,
  onError,
}: {
  menu: EditorMenu;
  restaurantId: string;
  onError: (message: string) => void;
}) {
  const labels = useMenuLabels();
  const [pending, run] = useAction(onError);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const published = menu.status === "PUBLISHED";

  function toggleDay(day: number) {
    const days = menu.activeDays.includes(day)
      ? menu.activeDays.filter((d) => d !== day)
      : [...menu.activeDays, day];
    run(() => updateMenu(menu.id, { activeDays: days }));
  }

  return (
    <section className="border border-[var(--rule)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--rule)] p-4">
        <InlineText
          value={menu.name}
          label="Menyns namn"
          className="mr-auto text-lg font-semibold"
          onSave={(name) => run(() => updateMenu(menu.id, { name }))}
        />

        <span
          className={` px-2.5 py-1 text-xs font-medium ${
            published
              ? "bg-green-600/15 text-green-700 dark:text-green-400"
              : "bg-black/10 opacity-70"
          }`}
        >
          {published ? "Publicerad" : "Utkast"}
        </span>

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setMenuStatus(menu.id, !published))}
          className="border border-[var(--rule)] px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {published ? labels.unpublish : labels.publish}
        </button>

        {confirmDelete ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteMenu(menu.id))}
              className="bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {labels.deleteAll}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="border border-[var(--rule)] px-3 py-1.5 text-sm"
            >
              {labels.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="border border-[var(--rule)] px-3 py-1.5 text-sm"
          >
            {labels.remove}
          </button>
        )}
      </header>

      <div className="border-b border-[var(--rule)] p-4">
        <p className="text-sm font-medium">{labels.appliesOn}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DAY_KEYS.map((key, day) => (
            <button
              key={day}
              type="button"
              disabled={pending}
              onClick={() => toggleDay(day)}
              aria-pressed={menu.activeDays.includes(day)}
              /*
               * Valda dagar fylls med bläck, inte med rött.
               *
               * Alla sju dagar valda gav sju ifyllda röda knappar i rad. Rött
               * är handlingsfärg och används sparsamt — och en ifylld röd yta
               * betyder "primärknapp" överallt annars i produkten, så det gick
               * inte att se om "Fre" utförde något eller växlade ett läge.
               * Inverterad fyllning läser otvetydigt som på/av.
               */
              className={`min-h-11 border px-3.5 text-sm transition-colors duration-[var(--speed)] disabled:opacity-50 ${
                menu.activeDays.includes(day)
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--rule-control)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {labels[key]}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <TimeField
            label={labels.from}
            value={menu.activeFrom}
            onSave={(activeFrom) => run(() => updateMenu(menu.id, { activeFrom }))}
          />
          <TimeField
            label={labels.to}
            value={menu.activeUntil}
            onSave={(activeUntil) => run(() => updateMenu(menu.id, { activeUntil }))}
          />
          <p className="text-sm opacity-60">
            Tomt = hela dagen. En meny med tidsfönster vinner över en utan.
          </p>
        </div>
      </div>

      <div className="p-4">
        {menu.categories.map((category) => (
          <CategoryBlock
            key={category.id}
            category={category}
            /*
             * Menyns alla rätter, för förslagslistan i varje rad.
             *
             * Räknas fram här och inte i raden: en rätt i "Mat" ska kunna
             * föreslå en dryck i "Dryck", och raden ser bara sin egen kategori.
             */
            menuItems={menu.categories.flatMap((other) =>
              other.items.map((item) => ({ id: item.id, name: item.name })),
            )}
            restaurantId={restaurantId}
            onError={onError}
          />
        ))}

        <AddCategory menuId={menu.id} onError={onError} />
      </div>
    </section>
  );
}

/* ── Kategori ────────────────────────────────────────────────────────────── */

function CategoryBlock({
  category,
  menuItems,
  restaurantId,
  onError,
}: {
  category: EditorCategory;
  menuItems: readonly { id: string; name: string }[];
  restaurantId: string;
  onError: (message: string) => void;
}) {
  const labels = useMenuLabels();
  const [pending, run] = useAction(onError);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="card mb-6 p-3">
      <div className="flex items-center gap-3">
        <InlineText
          value={category.name}
          label="Kategorins namn"
          className="mr-auto font-semibold"
          onSave={(name) => run(() => renameCategory(category.id, name))}
        />

        {/*
          Är avdelningen dryck?

          Kundvagnen föreslår något att dricka när gästen inte redan valt det,
          och kan inte gissa ur namnet: menyn skrivs på restaurangens eget
          språk, och "Pića", "Getränke" och "Dryck" är samma sak för en gäst
          men tre strängar för en jämförelse.
        */}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setCategoryIsDrinks(category.id, !category.isDrinks))}
          aria-pressed={category.isDrinks}
          className={`px-3 py-1.5 text-sm disabled:opacity-50 ${
            category.isDrinks
              ? "border border-transparent bg-burp-600 text-white"
              : "border border-[var(--rule)]"
          }`}
        >
          {labels.drinksCategory}
        </button>

        {confirmDelete ? (
          <>
            <span className="text-sm opacity-70">
              Raderar {category.items.length} rätt{category.items.length === 1 ? "" : "er"}.
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteCategory(category.id))}
              className="bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {labels.confirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="border border-[var(--rule)] px-3 py-1.5 text-sm"
            >
              {labels.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="border border-[var(--rule)] px-3 py-1.5 text-sm"
          >
            {labels.removeCategory}
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-3">
        {category.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            menuItems={menuItems}
            restaurantId={restaurantId}
            onError={onError}
          />
        ))}
      </ul>

      <AddItemForm categoryId={category.id} />
    </div>
  );
}

function AddCategory({ menuId, onError }: { menuId: string; onError: (message: string) => void }) {
  const labels = useMenuLabels();
  const [pending, run] = useAction(onError);
  const [name, setName] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex-1 basis-48">
        <span className="label-caps">{labels.newCategory}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          placeholder={labels.newCategoryPlaceholder}
          className="mt-1 w-full border border-[var(--rule)] bg-transparent px-3 py-2"
        />
      </label>
      <button
        type="button"
        disabled={pending || name.trim() === ""}
        onClick={() => {
          run(() => createCategory(menuId, name));
          setName("");
        }}
        className="btn btn-primary"
      >
        {labels.add}
      </button>
    </div>
  );
}

/* ── Rätt ────────────────────────────────────────────────────────────────── */

function AddItemForm({ categoryId }: { categoryId: string }) {
  const labels = useMenuLabels();
  const { currency } = useMenuLocale();
  const [result, formAction] = useActionState<ActionResult | null, FormData>(createMenuItem, null);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      <input type="hidden" name="category_id" value={categoryId} />
      <label className="flex-1 basis-40">
        <span className="label-caps">{labels.newItem}</span>
        <input
          name="name"
          required
          maxLength={120}
          className="field mt-1.5"
        />
      </label>
      <label className="basis-28">
        <span className="label-caps">{fill(labels.price, { currency })}</span>
        <input
          name="price"
          required
          inputMode="decimal"
          // Platshållaren visar rätt antal decimaler för valutan. En serbisk
          // ägare som ser "129,00" skriver in ett pris hundra gånger fel.
          placeholder={formatAmountInput(12900, currency)}
          className="field mt-1.5"
        />
      </label>
      <SubmitButton label={labels.add} pendingLabel={labels.adding} />
      {result?.message ? <Feedback result={result} /> : null}
    </form>
  );
}

function ItemRow({
  item,
  menuItems,
  restaurantId,
  onError,
}: {
  item: EditorItem;
  menuItems: readonly { id: string; name: string }[];
  restaurantId: string;
  onError: (message: string) => void;
}) {
  const labels = useMenuLabels();
  const { country, currency } = useMenuLocale();
  const [pending, run] = useAction(onError);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <InlineText
          value={item.name}
          label={labels.itemName}
          className="mr-auto font-medium"
          onSave={(name) => run(() => updateMenuItem(item.id, { name }))}
        />

        <InlineText
          value={formatAmountInput(item.priceOre, currency)}
          label={fill(labels.price, { currency })}
          className="w-24 text-right tabular-nums"
          inputMode="decimal"
          onSave={(price) => run(() => updateMenuItem(item.id, { price }))}
        />

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => updateMenuItem(item.id, { isAvailable: !item.isAvailable }))}
          className={` px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
            item.isAvailable
              ? "bg-green-600/15 text-green-700 dark:text-green-400"
              : "bg-red-600/15 text-red-700 dark:text-red-400"
          }`}
        >
          {item.isAvailable ? labels.inStock : labels.soldOutToday}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              updateMenuItem(item.id, {
                status: item.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
              }),
            )
          }
          className="border border-[var(--rule)] px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {item.status === "PUBLISHED" ? "Avpublicera" : "Publicera"}
        </button>

        <div className="flex gap-1">
          <button
            type="button"
            aria-label={`Flytta ${item.name} uppåt`}
            disabled={pending}
            onClick={() => run(() => moveMenuItem(item.id, "up"))}
            className="h-8 w-8 border border-[var(--rule)] disabled:opacity-50"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Flytta ${item.name} nedåt`}
            disabled={pending}
            onClick={() => run(() => moveMenuItem(item.id, "down"))}
            className="h-8 w-8 border border-[var(--rule)] disabled:opacity-50"
          >
            ↓
          </button>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="border border-[var(--rule)] px-3 py-1.5 text-sm"
        >
          {expanded ? labels.hide : labels.details}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-[var(--rule)] pt-4">
          <UnavailableUntil item={item} onError={onError} />

          <label className="block">
            <span className="label-caps">{labels.description}</span>
            <InlineTextarea
              value={item.description ?? ""}
              onSave={(description) => run(() => updateMenuItem(item.id, { description }))}
            />
          </label>

          <div>
            <span className="label-caps">{labels.vat}</span>
            <div className="mt-1 flex gap-2">
              {vatRateOptions(country).map((choice) => (
                <button
                  key={choice.bps}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => updateMenuItem(item.id, { vatRateBps: choice.bps }))}
                  className={` border px-3 py-1.5 text-sm disabled:opacity-50 ${
                    item.vatRateBps === choice.bps
                      ? "border-transparent bg-burp-600 text-white"
                      : "border-[var(--rule)]"
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          {/*
            Minsta antal portioner.

            Ett tal och inte en växel: skillnaden mellan "lagas i sats om fyra"
            och "om sex" är restaurangens att bestämma. Taket är 99 därför att
            orderschemat inte tar emot fler per rad — en högre gräns hade gjort
            rätten omöjlig att beställa.
          */}
          <label className="block">
            <span className="label-caps">
              {labels.minQuantity}{" "}
              <span className="font-normal opacity-60">{labels.minQuantityHint}</span>
            </span>
            <InlineText
              value={String(item.minQuantity)}
              label={labels.minQuantity}
              className="mt-1 w-24"
              onSave={(value) => {
                const parsed = Number.parseInt(value.trim(), 10);
                run(() =>
                  updateMenuItem(item.id, {
                    minQuantity: Number.isNaN(parsed) ? 1 : parsed,
                  }),
                );
              }}
            />
          </label>

          <UpsellPicker item={item} menuItems={menuItems} onError={onError} />

          <label className="block">
            <span className="label-caps">
              {labels.allergens}{" "}
              <span className="font-normal opacity-60">{labels.allergensHint}</span>
            </span>
            <InlineText
              value={item.allergens.join(", ")}
              label={labels.allergens}
              className="mt-1 w-full"
              onSave={(value) =>
                run(() => updateMenuItem(item.id, { allergens: value.split(",") }))
              }
            />
          </label>

          <div>
            <p className="text-sm font-medium">{labels.image}</p>
            <p className="mt-0.5 text-sm opacity-60">
              {labels.imageHint}
            </p>
            {item.pendingMedia > 0 ? (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                {fill(labels.imagePending, { n: item.pendingMedia })}
              </p>
            ) : null}
            <div className="mt-2">
              <ImageUpload
                restaurantId={restaurantId}
                menuItemId={item.id}
                currentUrl={item.imageUrl}
                label={fill(labels.imageUploadFor, { name: item.name })}
                labels={useMenuLocale().imageLabels}
              />
            </div>
          </div>

          <OptionGroups item={item} onError={onError} />

          <div>
            {confirmDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteMenuItem(item.id))}
                  className="bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Radera {item.name}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="border border-[var(--rule)] px-3 py-1.5 text-sm"
                >
                  {labels.cancel}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="border border-[var(--rule)] px-3 py-1.5 text-sm"
              >
                {labels.removeItem}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/* ── Tillval ─────────────────────────────────────────────────────────────── */

function OptionGroups({ item, onError }: { item: EditorItem; onError: (message: string) => void }) {
  const labels = useMenuLabels();
  const [pending, run] = useAction(onError);
  const [name, setName] = useState("");
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("1");

  return (
    <div>
      <p className="text-sm font-medium">{labels.optionGroups}</p>

      {item.optionGroups.map((group) => (
        <OptionGroupBlock key={group.id} group={group} onError={onError} />
      ))}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 basis-40">
          <span className="text-xs opacity-70">{labels.newGroup}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={labels.newGroupPlaceholder}
            className="mt-1 w-full border border-[var(--rule)] bg-transparent px-3 py-1.5 text-sm"
          />
        </label>
        <label className="basis-20">
          <span className="text-xs opacity-70">{labels.min}</span>
          <input
            type="number"
            min={0}
            value={min}
            onChange={(event) => setMin(event.target.value)}
            className="mt-1 w-full border border-[var(--rule)] bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
        <label className="basis-20">
          <span className="text-xs opacity-70">{labels.max}</span>
          <input
            type="number"
            min={1}
            value={max}
            onChange={(event) => setMax(event.target.value)}
            className="mt-1 w-full border border-[var(--rule)] bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={pending || name.trim() === ""}
          onClick={() => {
            run(() => createOptionGroup(item.id, name, Number(min), Number(max)));
            setName("");
          }}
          className="border border-[var(--rule)] px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {labels.addGroup}
        </button>
      </div>
    </div>
  );
}

function OptionGroupBlock({
  group,
  onError,
}: {
  group: EditorOptionGroup;
  onError: (message: string) => void;
}) {
  const labels = useMenuLabels();
  const { currency } = useMenuLocale();
  const [pending, run] = useAction(onError);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  return (
    <div className="card mt-2 p-3">
      <div className="flex items-center gap-3">
        <p className="mr-auto text-sm font-medium">
          {group.name}
          <span className="ml-2 font-normal opacity-60">
            välj {group.minSelect}–{group.maxSelect}
          </span>
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => deleteOptionGroup(group.id))}
          className="text-sm opacity-60 hover:opacity-100 disabled:opacity-30"
        >
          {labels.removeGroup}
        </button>
      </div>

      <ul className="mt-2 space-y-1">
        {group.options.map((option) => (
          <li key={option.id} className="flex items-center gap-3 text-sm">
            <span className="mr-auto">{option.name}</span>
            <span className="tabular-nums opacity-70">
              {option.priceOre === 0 ? "±0" : formatMoney(option.priceOre, currency)}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setOptionAvailable(option.id, !option.isAvailable))}
              className={` px-2 py-0.5 text-xs disabled:opacity-50 ${
                option.isAvailable
                  ? "bg-green-600/15 text-green-700 dark:text-green-400"
                  : "bg-red-600/15 text-red-700 dark:text-red-400"
              }`}
            >
              {option.isAvailable ? "Finns" : "Slut"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteOption(option.id))}
              aria-label={`Ta bort ${option.name}`}
              className="opacity-60 hover:opacity-100 disabled:opacity-30"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nytt tillval"
          className="flex-1 basis-32 border border-[var(--rule)] bg-transparent px-3 py-1.5 text-sm"
        />
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          className="basis-24 border border-[var(--rule)] bg-transparent px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={pending || name.trim() === ""}
          onClick={() => {
            run(() => createOption(group.id, name, price));
            setName("");
            setPrice("");
          }}
          className="border border-[var(--rule)] px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {labels.add}
        </button>
      </div>
    </div>
  );
}

/* ── Byggstenar ──────────────────────────────────────────────────────────── */

/** Kör en serveråtgärd och lyfter felmeddelandet till sidans felruta. */
function useAction(onError: (message: string) => void): [boolean, (fn: () => Promise<ActionResult>) => void] {
  const [pending, startTransition] = useTransition();
  const labels = useMenuLabels();

  const run = (fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) onError(result.message ?? labels.somethingWrong);
    });
  };

  return [pending, run];
}

/**
 * Text som sparas när fältet lämnas.
 *
 * Ingen sparaknapp per fält — den som lägger upp trettio rätter ska inte behöva
 * klicka sextio gånger. Escape återställer, så ett felskrivet pris går att
 * ångra innan det når servern.
 */
function InlineText({
  value,
  label,
  className = "",
  inputMode,
  onSave,
}: {
  value: string;
  label: string;
  className?: string;
  inputMode?: "decimal";
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      aria-label={label}
      value={draft}
      inputMode={inputMode}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={` border border-transparent bg-transparent px-2 py-1 hover:border-[var(--rule)] focus:border-black/30 dark:hover:border-white/20 dark:focus:border-white/40 ${className}`}
    />
  );
}

function InlineTextarea({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);

  return (
    <textarea
      value={draft}
      rows={2}
      maxLength={1000}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      className="mt-1 w-full border border-[var(--rule)] bg-transparent px-3 py-2 text-sm"
    />
  );
}

function TimeField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (value: string) => void;
}) {
  return (
    <label>
      <span className="label-caps">{label}</span>
      <input
        type="time"
        // Databasen ger "11:00:00"; <input type="time"> vill ha "11:00".
        defaultValue={value ? value.slice(0, 5) : ""}
        onBlur={(event) => onSave(event.target.value)}
        className="mt-1 block border border-[var(--rule)] bg-transparent px-3 py-2"
      />
    </label>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function Feedback({ result }: { result: ActionResult }) {
  return (
    <p
      role="alert"
      className={`basis-full text-sm ${
        result.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
      }`}
    >
      {result.message}
    </p>
  );
}

/* ── Slut till ───────────────────────────────────────────────────────────── */

/**
 * "Slut till fredag" — otillgänglighet som släcker sig själv.
 *
 * Skild från av/på-knappen ovanför, som är omedelbar och måste stängas av för
 * hand. Skillnaden är inte akademisk: en kock som släcker en rätt manuellt
 * måste också tända den igen, och det steget är precis det som glöms. Rätten
 * ligger kvar som slutsåld i en vecka och ingen märker det förrän en gäst
 * frågar efter den.
 *
 * Skälet visas för gästen. "Slut till fredag" får hen att komma tillbaka;
 * "slut för dagen" gör det inte.
 */
function UnavailableUntil({
  item,
  onError,
}: {
  item: EditorItem;
  onError: (message: string) => void;
}) {
  const labels = useMenuLabels();
  const [pending, run] = useAction(onError);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");

  if (item.unavailableUntil) {
    const at = new Date(item.unavailableUntil);

    return (
      <div className="border-l-2 border-burp-600 bg-burp-50 px-3 py-2 dark:bg-burp-900/40">
        <p className="text-sm">
          Slut till{" "}
          <span className="font-medium">
            {at.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
          </span>
          {item.unavailableReason ? ` — "${item.unavailableReason}"` : null}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => clearItemAvailability(item.id))}
          className="mt-2 border border-[var(--rule)] px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {labels.makeAvailable}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="basis-52">
        <span className="label-caps">{labels.soldUntil}</span>
        <input
          type="datetime-local"
          value={until}
          onChange={(event) => setUntil(event.target.value)}
          className="mt-1 min-h-11 w-full border border-[var(--rule)] bg-transparent px-3"
        />
      </label>

      <label className="flex-1 basis-40">
        <span className="label-caps">{labels.reasonForGuest}</span>
        <input
          type="text"
          value={reason}
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
          placeholder={labels.reasonPlaceholder}
          className="mt-1 min-h-11 w-full border border-[var(--rule)] bg-transparent px-3"
        />
      </label>

      <button
        type="button"
        disabled={pending || !until}
        onClick={() =>
          run(async () => {
            const result = await setItemUnavailableUntil(
              item.id,
              // datetime-local saknar tidszon. Webbläsarens egen används, vilket
              // är personalens — de står i restaurangen när de fyller i det.
              new Date(until).toISOString(),
              reason,
            );
            if (result.ok) {
              setUntil("");
              setReason("");
            }
            return result;
          })
        }
        className="min-h-11 border border-[var(--rule)] px-4 text-sm disabled:opacity-50"
      >
        {labels.markSoldOut}
      </button>
    </div>
  );
}

/* ── Förslag i kundvagnen ─────────────────────────────────────────────────── */

/**
 * "Till den här rätten, föreslå den där."
 *
 * Restaurangens egna förslag, inte en algoritm. Den som lagar maten vet att
 * ćevapi går med jogurt och att baklava säljs sist; en beräkning på tio
 * beställningar vet ingenting alls.
 *
 * Listan bär inget pris. Förslaget säger VAD, aldrig vad det kostar — priset
 * hämtas ur menyn när ordern läggs (regel 2).
 */
function UpsellPicker({
  item,
  menuItems,
  onError,
}: {
  item: EditorItem;
  menuItems: readonly { id: string; name: string }[];
  onError: (message: string) => void;
}) {
  const labels = useMenuLabels();
  const [pending, run] = useAction(onError);

  const chosen = new Set(item.upsellItemIds);
  const byId = new Map(menuItems.map((row) => [row.id, row.name] as const));

  // Rätten själv går bort, och det som redan valts flyttas upp i listan.
  const selectable = menuItems.filter((row) => row.id !== item.id && !chosen.has(row.id));

  return (
    <div>
      <span className="label-caps">
        {labels.upsell} <span className="font-normal opacity-60">{labels.upsellHint}</span>
      </span>

      {item.upsellItemIds.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {item.upsellItemIds.map((id) => (
            <li key={id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeUpsell(item.id, id))}
                aria-label={fill(labels.upsellRemove, { name: byId.get(id) ?? "" })}
                className="border border-[var(--rule)] px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {byId.get(id) ?? id} ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selectable.length > 0 ? (
        <select
          value=""
          disabled={pending}
          onChange={(event) => {
            const suggested = event.target.value;
            if (suggested) run(() => addUpsell(item.id, suggested));
          }}
          className="field mt-2"
          aria-label={labels.upsell}
        >
          <option value="">{labels.upsellAdd}</option>
          {selectable.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
