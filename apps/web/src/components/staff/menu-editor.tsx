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
import { ImageUpload } from "@/components/staff/image-upload";

/**
 * Menyredigeraren.
 *
 * Serveråtgärderna gör allt riktigt arbete och validerar allt som spelar roll.
 * Den här komponenten sköter tre saker: visa trädet, samla in vad någon skrev,
 * och visa felet när servern säger nej. Ingen validering som betyder något
 * ligger här — den som anropar åtgärden direkt möter exakt samma regler.
 */

const WEEKDAYS = ["Sön", "Mån", "Tis", "Ons", "Tors", "Fre", "Lör"] as const;

/**
 * Restaurangens land och valuta, tillgängligt i hela redigeraren.
 *
 * En kontext i stället för att skicka två props genom MenuCard →
 * CategoryBlock → ItemRow → OptionGroups → OptionGroupBlock. Varje nivå som
 * bara vidarebefordrar ett värde är en nivå där någon glömmer att göra det, och
 * priserna hamnar i fel valuta i just den vy där det inte upptäcks.
 */
interface MenuLocale {
  country: CountryCode;
  currency: CurrencyCode;
}

const MenuLocaleContext = createContext<MenuLocale | null>(null);

function useMenuLocale(): MenuLocale {
  const value = useContext(MenuLocaleContext);
  if (!value) {
    throw new Error("Menyredigeraren måste ligga inuti MenuLocaleContext.");
  }
  return value;
}

export function MenuEditor({
  menus,
  restaurantId,
  country,
  currency,
}: {
  menus: EditorMenu[];
  restaurantId: string;
  /** Restaurangens land. Avgör vilka momssatser som får väljas. */
  country: CountryCode;
  /** Restaurangens valuta. Avgör hur priser skrivs och tolkas. */
  currency: CurrencyCode;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <MenuLocaleContext.Provider value={{ country, currency }}>
    <div className="mt-8">
      {error ? (
        <p role="alert" className="mb-4 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <NewMenuForm />

      {menus.length === 0 ? (
        <p className="mt-8 opacity-60">Ingen meny ännu. Skapa den första ovan.</p>
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
  const [result, formAction] = useActionState<ActionResult | null, FormData>(createMenu, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex-1 basis-48">
        <span className="label-caps">Ny meny</span>
        <input
          name="name"
          required
          maxLength={120}
          placeholder="Lunch, Kväll, Helg…"
          className="field mt-1.5"
        />
      </label>
      <SubmitButton label="Skapa meny" pendingLabel="Skapar…" />
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
          {published ? "Avpublicera" : "Publicera"}
        </button>

        {confirmDelete ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteMenu(menu.id))}
              className="bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Radera allt
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="border border-[var(--rule)] px-3 py-1.5 text-sm"
            >
              Avbryt
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="border border-[var(--rule)] px-3 py-1.5 text-sm"
          >
            Radera
          </button>
        )}
      </header>

      <div className="border-b border-[var(--rule)] p-4">
        <p className="text-sm font-medium">Gäller</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((label, day) => (
            <button
              key={day}
              type="button"
              disabled={pending}
              onClick={() => toggleDay(day)}
              className={` border px-3 py-1 text-sm disabled:opacity-50 ${
                menu.activeDays.includes(day)
                  ? "border-transparent bg-burp-600 text-white"
                  : "border-[var(--rule)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <TimeField
            label="Från"
            value={menu.activeFrom}
            onSave={(activeFrom) => run(() => updateMenu(menu.id, { activeFrom }))}
          />
          <TimeField
            label="Till"
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
  restaurantId,
  onError,
}: {
  category: EditorCategory;
  restaurantId: string;
  onError: (message: string) => void;
}) {
  const [pending, run] = useAction(onError);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="mb-6 border border-[var(--rule)] p-3">
      <div className="flex items-center gap-3">
        <InlineText
          value={category.name}
          label="Kategorins namn"
          className="mr-auto font-semibold"
          onSave={(name) => run(() => renameCategory(category.id, name))}
        />

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
              Bekräfta
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="border border-[var(--rule)] px-3 py-1.5 text-sm"
            >
              Avbryt
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="border border-[var(--rule)] px-3 py-1.5 text-sm"
          >
            Ta bort kategori
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-3">
        {category.items.map((item) => (
          <ItemRow key={item.id} item={item} restaurantId={restaurantId} onError={onError} />
        ))}
      </ul>

      <AddItemForm categoryId={category.id} />
    </div>
  );
}

function AddCategory({ menuId, onError }: { menuId: string; onError: (message: string) => void }) {
  const [pending, run] = useAction(onError);
  const [name, setName] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex-1 basis-48">
        <span className="label-caps">Ny kategori</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          placeholder="Pizza, Dryck, Efterrätt…"
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
        Lägg till
      </button>
    </div>
  );
}

/* ── Rätt ────────────────────────────────────────────────────────────────── */

function AddItemForm({ categoryId }: { categoryId: string }) {
  const { currency } = useMenuLocale();
  const [result, formAction] = useActionState<ActionResult | null, FormData>(createMenuItem, null);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      <input type="hidden" name="category_id" value={categoryId} />
      <label className="flex-1 basis-40">
        <span className="label-caps">Ny rätt</span>
        <input
          name="name"
          required
          maxLength={120}
          className="field mt-1.5"
        />
      </label>
      <label className="basis-28">
        <span className="label-caps">Pris ({currency})</span>
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
      <SubmitButton label="Lägg till" pendingLabel="Lägger till…" />
      {result?.message ? <Feedback result={result} /> : null}
    </form>
  );
}

function ItemRow({
  item,
  restaurantId,
  onError,
}: {
  item: EditorItem;
  restaurantId: string;
  onError: (message: string) => void;
}) {
  const { country, currency } = useMenuLocale();
  const [pending, run] = useAction(onError);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="border border-[var(--rule)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <InlineText
          value={item.name}
          label="Rättens namn"
          className="mr-auto font-medium"
          onSave={(name) => run(() => updateMenuItem(item.id, { name }))}
        />

        <InlineText
          value={formatAmountInput(item.priceOre, currency)}
          label={`Pris i ${currency}`}
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
          {item.isAvailable ? "I lager" : "Slut för dagen"}
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
          {expanded ? "Dölj" : "Detaljer"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-[var(--rule)] pt-4">
          <UnavailableUntil item={item} onError={onError} />

          <label className="block">
            <span className="label-caps">Beskrivning</span>
            <InlineTextarea
              value={item.description ?? ""}
              onSave={(description) => run(() => updateMenuItem(item.id, { description }))}
            />
          </label>

          <div>
            <span className="label-caps">Moms</span>
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

          <label className="block">
            <span className="label-caps">
              Allergener <span className="font-normal opacity-60">kommaseparerade</span>
            </span>
            <InlineText
              value={item.allergens.join(", ")}
              label="Allergener"
              className="mt-1 w-full"
              onSave={(value) =>
                run(() => updateMenuItem(item.id, { allergens: value.split(",") }))
              }
            />
          </label>

          <div>
            <p className="text-sm font-medium">Bild</p>
            <p className="mt-0.5 text-sm opacity-60">
              Bilden syns för gästen först när Burp godkänt den. JPEG, PNG, WebP eller AVIF,
              högst 10 MB.
            </p>
            {item.pendingMedia > 0 ? (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                {item.pendingMedia === 1
                  ? "En bild väntar på granskning."
                  : `${item.pendingMedia} bilder väntar på granskning.`}
              </p>
            ) : null}
            <div className="mt-2">
              <ImageUpload
                restaurantId={restaurantId}
                menuItemId={item.id}
                currentUrl={item.imageUrl}
                label={`Ladda upp bild för ${item.name}`}
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
                  Avbryt
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="border border-[var(--rule)] px-3 py-1.5 text-sm"
              >
                Ta bort rätten
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
  const [pending, run] = useAction(onError);
  const [name, setName] = useState("");
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("1");

  return (
    <div>
      <p className="text-sm font-medium">Tillvalsgrupper</p>

      {item.optionGroups.map((group) => (
        <OptionGroupBlock key={group.id} group={group} onError={onError} />
      ))}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 basis-40">
          <span className="text-xs opacity-70">Ny grupp</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Välj storlek"
            className="mt-1 w-full border border-[var(--rule)] bg-transparent px-3 py-1.5 text-sm"
          />
        </label>
        <label className="basis-20">
          <span className="text-xs opacity-70">Minst</span>
          <input
            type="number"
            min={0}
            value={min}
            onChange={(event) => setMin(event.target.value)}
            className="mt-1 w-full border border-[var(--rule)] bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
        <label className="basis-20">
          <span className="text-xs opacity-70">Högst</span>
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
          Lägg till grupp
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
  const { currency } = useMenuLocale();
  const [pending, run] = useAction(onError);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  return (
    <div className="mt-2 border border-[var(--rule)] p-3">
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
          Ta bort grupp
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
          Lägg till
        </button>
      </div>
    </div>
  );
}

/* ── Byggstenar ──────────────────────────────────────────────────────────── */

/** Kör en serveråtgärd och lyfter felmeddelandet till sidans felruta. */
function useAction(onError: (message: string) => void): [boolean, (fn: () => Promise<ActionResult>) => void] {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) onError(result.message ?? "Något gick fel.");
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
          Gör tillgänglig igen
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="basis-52">
        <span className="label-caps">Slut till</span>
        <input
          type="datetime-local"
          value={until}
          onChange={(event) => setUntil(event.target.value)}
          className="mt-1 min-h-11 w-full border border-[var(--rule)] bg-transparent px-3"
        />
      </label>

      <label className="flex-1 basis-40">
        <span className="label-caps">Skäl för gästen</span>
        <input
          type="text"
          value={reason}
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
          placeholder="T.ex. Slut till fredag"
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
        Markera slut
      </button>
    </div>
  );
}
