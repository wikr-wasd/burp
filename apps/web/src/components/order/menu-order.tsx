"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateOrderTotals,
  formatOre,
  type Ore,
  type PricedLine,
} from "@burp/core";
import type { Menu, MenuItem } from "@/lib/menu";

/**
 * Menyn och varukorgen vid bordet.
 *
 * Prisberäkningen körs med samma `calculateOrderTotals` som servern använder,
 * så summan gästen ser är exakt den servern kommer fram till. Skulle de ändå
 * skilja sig avvisar servern ordern — klientens siffra är en kontroll, aldrig
 * en sanning.
 *
 * Min- och max-reglerna per tillvalsgrupp speglas här enbart för att kunna
 * gråa ut knappar. Reglerna som gäller körs i @burp/core på servern.
 */

interface CartLine {
  /** Lokalt id — samma rätt kan ligga flera gånger med olika tillval. */
  key: string;
  item: MenuItem;
  quantity: number;
  optionIds: string[];
  note: string;
}

/**
 * Var beställningen görs. Bordsfallet bär sitt token och sitt bordsnummer,
 * avhämtning bär ingenting — en union i stället för fyra valfria fält, så att
 * det inte går att bygga ett halvt bordsfall utan token.
 */
export type OrderContext =
  | { kind: "TABLE"; tableToken: string; tableNumber: string }
  | { kind: "PICKUP" };

interface Props {
  menu: Menu;
  restaurantName: string;
  context: OrderContext;
  /**
   * QR-sidan har inget eget sidhuvud — där är menyn hela sidan, och rubriken
   * hör hemma här. Restaurangsidan har redan namn och adress överst, och skulle
   * annars visa restaurangnamnet två gånger under varandra.
   */
  showHeading?: boolean;
}

export function MenuOrder({ menu, restaurantName, context, showHeading = true }: Props) {
  const router = useRouter();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [tipOre, setTipOre] = useState<Ore>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pricedLines = useMemo<PricedLine[]>(
    () =>
      cart.map((line) => ({
        menuItemId: line.item.id,
        name: line.item.name,
        unitPriceOre: line.item.priceOre,
        quantity: line.quantity,
        vatRateBps: line.item.vatRateBps,
        options: line.optionIds.map((optionId) => {
          const option = findOption(line.item, optionId);
          return {
            optionId,
            name: option?.name ?? "",
            priceOre: option?.priceOre ?? 0,
          };
        }),
      })),
    [cart],
  );

  const totals = useMemo(
    () => (pricedLines.length > 0 ? calculateOrderTotals({ lines: pricedLines, tipOre }) : null),
    [pricedLines, tipOre],
  );

  function addToCart(item: MenuItem, optionIds: string[], note: string) {
    setError(null);
    setCart((current) => {
      // Samma rätt med samma tillval slås ihop i stället för att bli två rader.
      const signature = [...optionIds].sort().join(",");
      const existing = current.find(
        (line) => line.item.id === item.id && [...line.optionIds].sort().join(",") === signature && line.note === note,
      );

      if (existing) {
        return current.map((line) =>
          line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }

      return [
        ...current,
        { key: `${item.id}:${signature}:${crypto.randomUUID()}`, item, quantity: 1, optionIds, note },
      ];
    });
    setOpenItemId(null);
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  async function placeOrder() {
    if (!totals || cart.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: context.kind,
          ...(context.kind === "TABLE" ? { table_token: context.tableToken } : {}),
          tip_ore: tipOre,
          client_total_ore: totals.totalOre,
          // Nyckeln skapas en gång per försök. Dubbeltryck på knappen ger
          // samma nyckel och därmed samma order, inte två notor.
          idempotency_key: crypto.randomUUID(),
          items: cart.map((line) => ({
            menu_item_id: line.item.id,
            quantity: line.quantity,
            options: line.optionIds.map((optionId) => ({ option_id: optionId })),
            ...(line.note ? { note: line.note } : {}),
          })),
        }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(body?.detail ?? "Beställningen kunde inte läggas. Försök igen.");
        return;
      }

      setCart([]);
      // Bordskvittot ligger under bordets token, avhämtningskvittot fristående
      // — en avhämtningsgäst har inget bord att hänga sidan under.
      router.push(
        context.kind === "TABLE"
          ? `/t/${context.tableToken}/order/${body.order_id}`
          : `/order/${body.order_id}`,
      );
    } catch {
      setError("Ingen kontakt med servern. Kontrollera nätet och försök igen.");
    } finally {
      setSubmitting(false);
    }
  }

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  return (
    // Plats för den fasta varukorgsraden — men bara när den finns. Annars
    // slutar sidan med en skärmhög lucka som ser ut som att något saknas.
    <div className={cart.length > 0 ? "pb-44" : ""}>
      {showHeading ? (
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide opacity-60">
            {context.kind === "TABLE" ? `Bord ${context.tableNumber}` : "Avhämtning"}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{restaurantName}</h1>
          <p className="mt-1 text-sm opacity-60">{menu.name}</p>
        </header>
      ) : null}

      {menu.categories.map((category) => (
        <section key={category.id} className="mb-10">
          <h2 className="mb-1 text-xl font-semibold">{category.name}</h2>
          {category.description ? (
            <p className="mb-3 text-sm opacity-60">{category.description}</p>
          ) : null}

          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {category.items.map((item) => (
              <MenuItemRow
                key={item.id}
                item={item}
                isOpen={openItemId === item.id}
                onToggle={() => setOpenItemId(openItemId === item.id ? null : item.id)}
                onAdd={addToCart}
              />
            ))}
          </ul>
        </section>
      ))}

      {cart.length > 0 && totals ? (
        <CartBar
          cart={cart}
          totals={totals}
          itemCount={itemCount}
          tipOre={tipOre}
          onTipChange={setTipOre}
          onQuantityChange={changeQuantity}
          onSubmit={placeOrder}
          submitting={submitting}
          error={error}
        />
      ) : null}
    </div>
  );
}

/* ── Menyrad ─────────────────────────────────────────────────────────────── */

function MenuItemRow({
  item,
  isOpen,
  onToggle,
  onAdd,
}: {
  item: MenuItem;
  isOpen: boolean;
  onToggle: () => void;
  onAdd: (item: MenuItem, optionIds: string[], note: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const hasOptions = item.optionGroups.length > 0;

  function toggleOption(groupId: string, optionId: string, maxSelect: number) {
    setSelected((current) => {
      if (current.includes(optionId)) {
        return current.filter((id) => id !== optionId);
      }

      const group = item.optionGroups.find((g) => g.id === groupId)!;
      const chosenInGroup = current.filter((id) =>
        group.options.some((option) => option.id === id),
      );

      // Är gruppen full ersätts det äldsta valet. För "välj exakt en storlek"
      // blir det den beteende gästen förväntar sig: nästa klick byter val.
      if (chosenInGroup.length >= maxSelect) {
        const oldest = chosenInGroup[0]!;
        return [...current.filter((id) => id !== oldest), optionId];
      }

      return [...current, optionId];
    });
  }

  const unmetGroup = item.optionGroups.find((group) => {
    const count = selected.filter((id) => group.options.some((o) => o.id === id)).length;
    return count < group.minSelect;
  });

  if (!item.isAvailable) {
    return (
      <li className="py-4 opacity-40">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-medium line-through">{item.name}</span>
          <span className="text-sm">Slut för dagen</span>
        </div>
      </li>
    );
  }

  return (
    <li className="py-4">
      <button
        type="button"
        onClick={hasOptions ? onToggle : () => onAdd(item, [], "")}
        className="flex w-full items-baseline justify-between gap-4 text-left"
      >
        <span>
          <span className="font-medium">{item.name}</span>
          {item.description ? (
            <span className="mt-0.5 block text-sm opacity-60">{item.description}</span>
          ) : null}
          {item.allergens.length > 0 ? (
            <span className="mt-1 block text-xs opacity-50">
              Allergener: {item.allergens.join(", ")}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 tabular-nums font-medium">{formatOre(item.priceOre)}</span>
      </button>

      {hasOptions && isOpen ? (
        <div className="mt-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
          {item.optionGroups.map((group) => (
            <fieldset key={group.id} className="mb-4 last:mb-0">
              <legend className="text-sm font-semibold">
                {group.name}
                <span className="ml-2 font-normal opacity-60">
                  {group.minSelect > 0
                    ? `välj ${group.minSelect === group.maxSelect ? group.minSelect : `${group.minSelect}–${group.maxSelect}`}`
                    : `välj upp till ${group.maxSelect}`}
                </span>
              </legend>

              <div className="mt-2 flex flex-wrap gap-2">
                {group.options.map((option) => {
                  const isSelected = selected.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!option.isAvailable}
                      onClick={() => toggleOption(group.id, option.id, group.maxSelect)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        isSelected
                          ? "border-transparent bg-burp-600 text-white"
                          : "border-black/15 dark:border-white/20"
                      } ${option.isAvailable ? "" : "cursor-not-allowed opacity-40"}`}
                    >
                      {option.name}
                      {option.priceOre !== 0 ? (
                        <span className="ml-1.5 tabular-nums opacity-80">
                          {option.priceOre > 0 ? "+" : "−"}
                          {formatOre(Math.abs(option.priceOre))}
                        </span>
                      ) : null}
                      {!option.isAvailable ? <span className="ml-1.5">(slut)</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <label className="mt-4 block">
            <span className="text-sm font-semibold">Meddelande till köket</span>
            <input
              type="text"
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
              placeholder="T.ex. utan lök"
              className="mt-1 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            />
          </label>

          <button
            type="button"
            disabled={unmetGroup !== undefined}
            onClick={() => {
              onAdd(item, selected, note.trim());
              setSelected([]);
              setNote("");
            }}
            className="mt-4 w-full rounded-md bg-burp-600 px-4 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {unmetGroup ? `Välj i "${unmetGroup.name}" först` : "Lägg till"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

/* ── Varukorg ────────────────────────────────────────────────────────────── */

const TIP_CHOICES = [0, 500, 1000, 2000] as const;

function CartBar({
  cart,
  totals,
  itemCount,
  tipOre,
  onTipChange,
  onQuantityChange,
  onSubmit,
  submitting,
  error,
}: {
  cart: CartLine[];
  totals: ReturnType<typeof calculateOrderTotals>;
  itemCount: number;
  tipOre: Ore;
  onTipChange: (value: Ore) => void;
  onQuantityChange: (key: string, delta: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    // Nederkanten tar hänsyn till iPhones hemindikator. Utan det hamnar
    // "Beställ" delvis under den, och knappen blir svår att träffa.
    <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] dark:border-white/15">
      <div className="mx-auto max-w-2xl">
        {expanded ? (
          <div className="mb-4 max-h-[45vh] overflow-y-auto">
            <ul className="divide-y divide-black/10 dark:divide-white/10">
              {cart.map((line) => (
                <li key={line.key} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{line.item.name}</p>
                    {line.optionIds.length > 0 ? (
                      <p className="text-sm opacity-60">
                        {line.optionIds
                          .map((id) => findOption(line.item, id)?.name)
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    ) : null}
                    {line.note ? <p className="text-sm italic opacity-60">{line.note}</p> : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      aria-label={`Ta bort en ${line.item.name}`}
                      onClick={() => onQuantityChange(line.key, -1)}
                      className="grid h-11 w-11 place-items-center rounded-full border border-black/15 text-lg dark:border-white/20"
                    >
                      −
                    </button>
                    <span className="w-4 text-center tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Lägg till en ${line.item.name}`}
                      onClick={() => onQuantityChange(line.key, 1)}
                      className="grid h-11 w-11 place-items-center rounded-full border border-black/15 text-lg dark:border-white/20"
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4">
              <p className="text-sm font-semibold">Dricks</p>
              <div className="mt-2 flex gap-2">
                {TIP_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => onTipChange(choice)}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                      tipOre === choice
                        ? "border-transparent bg-burp-600 text-white"
                        : "border-black/15 dark:border-white/20"
                    }`}
                  >
                    {choice === 0 ? "Ingen" : formatOre(choice)}
                  </button>
                ))}
              </div>
            </div>

            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="opacity-60">Mat och dryck</dt>
                <dd className="tabular-nums">{formatOre(totals.itemsGrossOre)}</dd>
              </div>
              {totals.tipOre > 0 ? (
                <div className="flex justify-between">
                  <dt className="opacity-60">Dricks</dt>
                  <dd className="tabular-nums">{formatOre(totals.tipOre)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between opacity-60">
                <dt>varav moms</dt>
                <dd className="tabular-nums">{formatOre(totals.itemsVatOre)}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mb-3 rounded-md bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded-md border border-black/15 px-3 py-3 text-sm dark:border-white/20"
          >
            {expanded ? "Dölj" : `${itemCount} st`}
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="flex flex-1 items-center justify-between rounded-md bg-burp-600 px-4 py-3 font-medium text-white disabled:opacity-60"
          >
            <span>{submitting ? "Skickar…" : "Beställ"}</span>
            <span className="tabular-nums">{formatOre(totals.totalOre)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function findOption(item: MenuItem, optionId: string) {
  for (const group of item.optionGroups) {
    const option = group.options.find((o) => o.id === optionId);
    if (option) return option;
  }
  return undefined;
}
