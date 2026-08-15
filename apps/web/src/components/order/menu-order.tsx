"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateOrderTotals,
  formatMoney,
  roundHalfEven,
  type CurrencyCode,
  type Ore,
  type PricedLine,
} from "@burp/core";
import { FoodImage } from "@/components/media/food-image";
import { fill, type Dictionary } from "@/lib/i18n";
import type { Menu, MenuItem } from "@/lib/menu";
import { dishImage } from "@/lib/placeholder";

/**
 * Menyn och varukorgen — Burps digitala meny.
 *
 * Prisberäkningen körs med samma `calculateOrderTotals` som servern använder,
 * så summan gästen ser är exakt den servern kommer fram till. Skulle de ändå
 * skilja sig avvisar servern ordern — klientens siffra är en kontroll, aldrig
 * en sanning.
 *
 * Min- och max-reglerna per tillvalsgrupp speglas här enbart för att kunna
 * gråa ut knappar. Reglerna som gäller körs i @burp/core på servern.
 *
 * Menyn är bildburen. En rätt utan uppladdat foto får en genererad platta i
 * stället för en tom ruta — se `dishImage()`. Restaurangen byter ut den genom
 * att ladda upp ett foto i dashboarden, utan att någon rör koden.
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
   * Texterna, färdigvalda av den som renderar.
   *
   * QR-sidan väljer språk på Accept-Language, restaurangsidan får sitt ur
   * URL:en. Komponenten ska inte behöva veta vilket — bara skriva ut det den
   * fått.
   */
  labels: Dictionary["menu"];
  /** Restaurangens valuta. Avgör hur varenda summa på sidan skrivs. */
  currency: CurrencyCode;
  /**
   * Restaurangens tidszon. Hämttiderna ska visas i restaurangens klocka, inte
   * i gästens — en gäst som surfar från en annan tidszon ska ändå se den tid
   * som gäller i lokalen.
   */
  timeZone: string;
  /**
   * Valbara hämttider som ISO-strängar. Tom lista betyder att restaurangen
   * inte tar emot förbeställningar — då visas ingen väljare alls.
   */
  pickupSlots?: readonly string[];
  /**
   * QR-sidan har inget eget sidhuvud — där är menyn hela sidan, och rubriken
   * hör hemma här. Restaurangsidan har redan namn och adress överst, och skulle
   * annars visa restaurangnamnet två gånger under varandra.
   */
  showHeading?: boolean;
}

export function MenuOrder({
  menu,
  restaurantName,
  context,
  labels,
  currency,
  timeZone,
  pickupSlots = [],
  showHeading = true,
}: Props) {
  const router = useRouter();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [tipBps, setTipBps] = useState(0);
  // Tom sträng = åt gången, vilket är det gästen oftast vill.
  const [scheduledFor, setScheduledFor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = useMemo(
    () => (amount: Ore) => formatMoney(amount, currency),
    [currency],
  );

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

  /*
   * Dricksen är en andel, inte ett belopp.
   *
   * Fasta belopp fungerade så länge allt var i kronor. 500 minorenheter är
   * 5,00 KM i Sarajevo och 5 dinarer i Belgrad — det ena är rimlig dricks, det
   * andra är förolämpande. En procentsats betyder samma sak i alla tre
   * länderna.
   */
  const itemsGrossOre = useMemo(
    () => (pricedLines.length > 0 ? calculateOrderTotals({ lines: pricedLines, tipOre: 0 }).itemsGrossOre : 0),
    [pricedLines],
  );

  const tipOre = useMemo(
    () => (tipBps === 0 ? 0 : roundHalfEven((itemsGrossOre * tipBps) / 10_000)),
    [itemsGrossOre, tipBps],
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
          ...(scheduledFor ? { scheduled_for: scheduledFor } : {}),
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
        setError(body?.detail ?? labels.orderFailed);
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
      setError(labels.noConnection);
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
        <header className="mb-10">
          <p className="label-caps">
            {context.kind === "TABLE"
              ? fill(labels.table, { number: context.tableNumber })
              : labels.pickup}
          </p>
          <h1 className="font-display mt-2 text-4xl sm:text-5xl">{restaurantName}</h1>
          <p className="mt-2 text-[var(--muted)]">{menu.name}</p>
        </header>
      ) : null}

      {/*
        Kategorierna får en egen navigering på QR-sidan. En gäst vid bordet
        scrollar inte gärna förbi trettio rätter för att hitta drycken.
      */}
      {menu.categories.length > 1 ? (
        <nav
          aria-label={labels.sections}
          className="sticky top-0 z-10 -mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-[var(--rule)] bg-[var(--background)]/95 px-4 py-1 backdrop-blur [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {menu.categories.map((category) => (
            <a
              key={category.id}
              href={`#kategori-${category.id}`}
              className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm whitespace-nowrap text-[var(--muted)] transition-colors hover:border-burp-600 hover:text-burp-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
            >
              {category.name}
            </a>
          ))}
        </nav>
      ) : null}

      {menu.categories.map((category) => (
        <section
          key={category.id}
          id={`kategori-${category.id}`}
          // Ankarhoppet får inte lägga rubriken under den klistrade navigeringen.
          className="mb-14 scroll-mt-16"
        >
          <h2 className="font-display text-3xl">{category.name}</h2>
          {category.description ? (
            <p className="mt-1 text-[var(--muted)]">{category.description}</p>
          ) : null}
          <hr className="rule mt-4" />

          <ul className="mt-6 grid gap-x-6 gap-y-8 sm:grid-cols-2">
            {category.items.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                labels={labels}
                money={money}
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
          labels={labels}
          money={money}
          tipBps={tipBps}
          tipOre={tipOre}
          onTipChange={setTipBps}
          pickupSlots={pickupSlots}
          timeZone={timeZone}
          scheduledFor={scheduledFor}
          onScheduleChange={setScheduledFor}
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

function MenuItemCard({
  item,
  labels,
  money,
  isOpen,
  onToggle,
  onAdd,
}: {
  item: MenuItem;
  labels: Dictionary["menu"];
  money: (amount: Ore) => string;
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

  // Summan av valda tillval, så gästen ser vad tilläggen kostar innan hen
  // lägger till rätten — inte först i varukorgen.
  const optionsDeltaOre = selected.reduce(
    (sum, id) => sum + (findOption(item, id)?.priceOre ?? 0),
    0,
  );

  if (!item.isAvailable) {
    return (
      <li className="opacity-45">
        <div className="relative">
          <FoodImage src={dishImage(item.name, item.imageUrl)} alt="" ratio="aspect-[4/3]" />
          <span className="absolute inset-0 grid place-items-center bg-[var(--background)]/70">
            {/* Restaurangens eget skäl om det finns. "Slut till fredag" får
                gästen att komma tillbaka; "slut för dagen" gör det inte. */}
            <span className="label-caps bg-[var(--background)] px-3 py-1.5 text-center">
              {item.unavailableReason ?? labels.soldOut}
            </span>
          </span>
        </div>
        <h3 className="font-display mt-3 text-xl line-through">{item.name}</h3>
      </li>
    );
  }

  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={hasOptions ? onToggle : () => onAdd(item, [], "")}
        aria-expanded={hasOptions ? isOpen : undefined}
        className="group text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-burp-600"
      >
        <FoodImage src={dishImage(item.name, item.imageUrl)} alt="" ratio="aspect-[4/3]" />

        <span className="mt-3 flex items-baseline justify-between gap-4">
          <span className="font-display text-xl group-hover:text-burp-600">{item.name}</span>
          <span className="shrink-0 tabular-nums">{money(item.priceOre)}</span>
        </span>

        {item.description ? (
          <span className="mt-1 block text-sm leading-relaxed text-[var(--muted)]">
            {item.description}
          </span>
        ) : null}

        {item.allergens.length > 0 ? (
          <span className="label-caps mt-2 block">Allergener: {item.allergens.join(", ")}</span>
        ) : null}

        <span className="mt-2 block text-sm font-medium text-burp-600">
          {hasOptions ? (isOpen ? labels.hideOptions : labels.chooseOptions) : labels.add}
        </span>
      </button>

      {hasOptions && isOpen ? (
        <div className="card mt-4 p-4">
          {item.optionGroups.map((group) => (
            <fieldset key={group.id} className="mb-5 last:mb-0">
              <legend className="label-caps">
                {group.name}
                <span className="ml-2 normal-case">
                  {group.minSelect === 0
                    ? fill(labels.chooseUpTo, { n: group.maxSelect })
                    : group.minSelect === group.maxSelect
                      ? fill(labels.chooseExactly, { n: group.minSelect })
                      : fill(labels.chooseBetween, {
                          min: group.minSelect,
                          max: group.maxSelect,
                        })}
                </span>
              </legend>

              <div className="mt-2 flex flex-wrap gap-2">
                {group.options.map((option) => {
                  const isSelected = selected.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={!option.isAvailable}
                      onClick={() => toggleOption(group.id, option.id, group.maxSelect)}
                      className={`inline-flex min-h-11 items-center border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600 ${
                        isSelected
                          ? "border-burp-600 bg-burp-600 text-white"
                          : "border-[var(--rule)] hover:border-burp-600"
                      } ${option.isAvailable ? "" : "cursor-not-allowed opacity-40"}`}
                    >
                      {option.name}
                      {option.priceOre !== 0 ? (
                        <span className="ml-1.5 tabular-nums">
                          {option.priceOre > 0 ? "+" : "−"}
                          {money(Math.abs(option.priceOre))}
                        </span>
                      ) : null}
                      {!option.isAvailable ? <span className="ml-1.5">{labels.optionSoldOut}</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <label className="mt-5 block">
            <span className="label-caps">{labels.noteToKitchen}</span>
            <input
              type="text"
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
              placeholder={labels.notePlaceholder}
              className="mt-1.5 min-h-11 w-full border-b border-[var(--rule)] bg-transparent px-1 text-sm outline-none focus-visible:border-burp-600"
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
            className="mt-5 flex min-h-12 w-full items-center justify-between bg-burp-600 px-4 text-sm font-medium tracking-[var(--tracking-label)] text-white uppercase transition-colors hover:bg-burp-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>{unmetGroup ? fill(labels.chooseFirst, { group: unmetGroup.name }) : labels.add}</span>
            {!unmetGroup ? (
              <span className="tabular-nums normal-case">
                {money(item.priceOre + optionsDeltaOre)}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}
    </li>
  );
}

/* ── Varukorg ────────────────────────────────────────────────────────────── */

/**
 * Dricks i baspunkter, inte i belopp.
 *
 * 0, 5, 10 och 15 procent. Samma val fungerar i Sarajevo, Zagreb och Belgrad —
 * ett fast belopp gör det inte, eftersom minorenheterna är olika mycket värda.
 */
const TIP_CHOICES = [0, 500, 1000, 1500] as const;

function CartBar({
  cart,
  totals,
  itemCount,
  labels,
  money,
  tipBps,
  tipOre,
  onTipChange,
  onQuantityChange,
  onSubmit,
  submitting,
  error,
  pickupSlots,
  timeZone,
  scheduledFor,
  onScheduleChange,
}: {
  cart: CartLine[];
  totals: ReturnType<typeof calculateOrderTotals>;
  itemCount: number;
  labels: Dictionary["menu"];
  money: (amount: Ore) => string;
  tipBps: number;
  tipOre: Ore;
  onTipChange: (value: number) => void;
  onQuantityChange: (key: string, delta: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  pickupSlots: readonly string[];
  timeZone: string;
  scheduledFor: string;
  onScheduleChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const slotTime = useMemo(
    () =>
      new Intl.DateTimeFormat("sv-SE", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
      }),
    [timeZone],
  );

  return (
    // Nederkanten tar hänsyn till iPhones hemindikator. Utan det hamnar
    // "Beställ" delvis under den, och knappen blir svår att träffa.
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--rule)] bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-2xl">
        {expanded ? (
          <div className="mb-4 max-h-[45vh] overflow-y-auto">
            <ul className="divide-y divide-[var(--rule)]">
              {cart.map((line) => (
                <li key={line.key} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{line.item.name}</p>
                    {line.optionIds.length > 0 ? (
                      <p className="text-sm text-[var(--muted)]">
                        {line.optionIds
                          .map((id) => findOption(line.item, id)?.name)
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    ) : null}
                    {line.note ? (
                      <p className="text-sm text-[var(--muted)] italic">{line.note}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      aria-label={fill(labels.removeOne, { name: line.item.name })}
                      onClick={() => onQuantityChange(line.key, -1)}
                      className="grid h-11 w-11 place-items-center border border-[var(--rule)] text-lg transition-colors hover:border-burp-600"
                    >
                      −
                    </button>
                    <span className="w-4 text-center tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={fill(labels.addOne, { name: line.item.name })}
                      onClick={() => onQuantityChange(line.key, 1)}
                      className="grid h-11 w-11 place-items-center border border-[var(--rule)] text-lg transition-colors hover:border-burp-600"
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {pickupSlots.length > 0 ? (
              <label className="mt-5 block">
                <span className="label-caps">{labels.pickupTime}</span>
                <select
                  value={scheduledFor}
                  onChange={(event) => onScheduleChange(event.target.value)}
                  className="mt-1.5 min-h-11 w-full border border-[var(--rule)] bg-transparent px-3"
                >
                  {/* Tom sträng betyder "så snart som möjligt". Att göra det
                      till förstaval är avsiktligt: de flesta vill äta nu. */}
                  <option value="">{labels.asSoonAsPossible}</option>
                  {pickupSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slotTime.format(new Date(slot))}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="mt-5">
              <p className="label-caps">{labels.tip}</p>
              <div className="mt-2 flex gap-2">
                {TIP_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={tipBps === choice}
                    onClick={() => onTipChange(choice)}
                    className={`min-h-11 flex-1 border text-sm transition-colors ${
                      tipBps === choice
                        ? "border-burp-600 bg-burp-600 text-white"
                        : "border-[var(--rule)] hover:border-burp-600"
                    }`}
                  >
                    {choice === 0 ? labels.noTip : `${choice / 100} %`}
                  </button>
                ))}
              </div>
            </div>

            <dl className="mt-5 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">{labels.foodAndDrink}</dt>
                <dd className="tabular-nums">{money(totals.itemsGrossOre)}</dd>
              </div>
              {tipOre > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">{labels.tip}</dt>
                  <dd className="tabular-nums">{money(tipOre)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-[var(--muted)]">
                <dt>{labels.ofWhichVat}</dt>
                <dd className="tabular-nums">{money(totals.itemsVatOre)}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mb-3 border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="min-h-12 border border-[var(--rule)] px-4 text-sm transition-colors hover:border-burp-600"
          >
            {expanded ? labels.hide : fill(labels.itemCount, { n: itemCount })}
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="flex min-h-12 flex-1 items-center justify-between bg-burp-600 px-4 font-medium text-white transition-colors hover:bg-burp-700 disabled:opacity-60"
          >
            <span>{submitting ? labels.sending : labels.order}</span>
            <span className="tabular-nums">{money(totals.totalOre)}</span>
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
