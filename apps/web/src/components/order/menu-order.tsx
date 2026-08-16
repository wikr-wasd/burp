"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search, SearchX, ShoppingBag, X } from "lucide-react";
import {
  calculateOrderTotals,
  formatMoney,
  itemPriceRange,
  roundHalfEven,
  type CurrencyCode,
  type Ore,
  type PricedLine,
} from "@burp/core";
import { FoodImage } from "@/components/media/food-image";
import { EmptyState } from "@/components/ui/empty-state";
import { fill, type Dictionary } from "@/lib/i18n";
import type { Menu, MenuItem } from "@/lib/menu";
import { filterMenu } from "@/lib/menu-search";
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

/**
 * Antal rätter innan menyn får en sökruta.
 *
 * En meny på sex rätter ryms nästan på skärmen — där är en sökruta en kontroll
 * som stjäl plats från maten. Först när listan blir längre än så tjänar gästen
 * på att kunna skriva i stället för att bläddra.
 */
const SEARCH_THRESHOLD = 10;

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
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    menu.categories[0]?.id ?? null,
  );
  /**
   * Det som läses upp när en rätt lagts till.
   *
   * Varukorgsraden fäller ut sig längst ned och kortets knapp byter till
   * "Tillagd" — båda är rent visuella besked. En skärmläsare får ingenting av
   * dem, och gästen som inte ser skärmen har då ingen bekräftelse alls på att
   * trycket tog.
   */
  const [announcement, setAnnouncement] = useState("");
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
   * 5,00 KM i Sarajevo och 5 dinarer i Beograd — det ena är rimlig dricks, det
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

  const navRef = useRef<HTMLElement>(null);

  const visibleCategories = useMemo(
    () => filterMenu(menu.categories, query),
    [menu.categories, query],
  );

  const itemTotal = useMemo(
    () => menu.categories.reduce((sum, category) => sum + category.items.length, 0),
    [menu.categories],
  );

  const searching = query.trim() !== "";
  const showSearch = itemTotal >= SEARCH_THRESHOLD;
  // Under en sökning byter avdelningarna innehåll hela tiden. En navigering
  // som pekar på avsnitt som inte längre finns hjälper ingen.
  const showNav = !searching && menu.categories.length > 1;

  /*
   * Vilken avdelning gästen är i.
   *
   * Utan markeringen är den klistrade raden bara ett gäng genvägar; med den
   * blir den en positionsvisare, och det är den halvvägs ned i en lång meny
   * som gästen behöver mest.
   *
   * Överkanten dras in 72 px för att inte räkna en rubrik som ligger BAKOM den
   * klistrade raden som synlig, och underkanten 70 % så att avsnittet byts när
   * nästa rubrik nått den övre tredjedelen — inte när den nätt och jämnt kikat
   * in nedifrån.
   */
  useEffect(() => {
    if (!showNav) return;

    const sections = menu.categories
      .map((category) => document.getElementById(`kategori-${category.id}`))
      .filter((element): element is HTMLElement => element !== null);

    if (sections.length === 0) return;

    const onScreen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.slice("kategori-".length);
          if (entry.isIntersecting) onScreen.add(id);
          else onScreen.delete(id);
        }

        // Är två avsnitt inne samtidigt vinner det översta. Är inget inne —
        // gästen står mitt i ett långt avsnitt — ligger markeringen kvar.
        const first = menu.categories.find((category) => onScreen.has(category.id));
        if (first) setActiveCategoryId(first.id);
      },
      { rootMargin: "-72px 0px -70% 0px" },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [menu.categories, showNav]);

  /* Den markerade knappen ska synas även när raden scrollats i sidled. */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || activeCategoryId === null) return;

    const chip = nav.querySelector<HTMLElement>(`[data-category="${CSS.escape(activeCategoryId)}"]`);
    if (!chip) return;

    nav.scrollTo({
      left: Math.max(0, chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [activeCategoryId]);

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

    // Antalet räknas ur den nuvarande varukorgen plus den här raden. Att läsa
    // upp det gör dels beskedet användbart, dels unikt: två likadana
    // meddelanden i rad läses inte upp en andra gång.
    const nextCount = cart.reduce((sum, line) => sum + line.quantity, 0) + 1;
    setAnnouncement(`${item.name}: ${labels.added}. ${fill(labels.itemCount, { n: nextCount })}`);
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
        Sökrutan står över navigeringen och följer inte med i scrollen. Den som
        vet vad hen vill ha skriver det direkt; den som bläddrar har den
        klistrade avdelningsraden i stället, och två klistrade rader hade ätit
        en fjärdedel av en telefonskärm.
      */}
      {showSearch ? (
        <div className="relative mb-6">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={labels.search}
            placeholder={labels.searchPlaceholder}
            className="field field-search"
          />
          {query !== "" ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={labels.searchClear}
              className="absolute top-1/2 right-1.5 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:text-burp-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/*
        Kategorierna får en egen navigering på QR-sidan. En gäst vid bordet
        scrollar inte gärna förbi trettio rätter för att hitta drycken.
      */}
      {showNav ? (
        <nav
          ref={navRef}
          aria-label={labels.sections}
          className="sticky top-0 z-10 -mx-4 mb-8 flex gap-2 overflow-x-auto border-b border-[var(--rule)] bg-[var(--background)]/95 px-4 py-2 backdrop-blur [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {menu.categories.map((category) => {
            const isActive = category.id === activeCategoryId;
            return (
              <a
                key={category.id}
                data-category={category.id}
                href={`#kategori-${category.id}`}
                // `location` snarare än `current`: det är en position i sidan,
                // inte den sida gästen står på.
                aria-current={isActive ? "location" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600 ${
                  isActive
                    ? "border-burp-600 bg-burp-600 text-white"
                    : "border-[var(--rule-control)] bg-[var(--surface)] hover:border-burp-600 hover:text-burp-600"
                }`}
              >
                {category.name}
              </a>
            );
          })}
        </nav>
      ) : null}

      {searching && visibleCategories.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={fill(labels.searchEmpty, { query: query.trim() })}
          body={labels.searchEmptyHint}
        />
      ) : null}

      {visibleCategories.map((category) => (
        <section
          key={category.id}
          id={`kategori-${category.id}`}
          // Ankarhoppet får inte lägga rubriken under den klistrade navigeringen.
          className="mb-14 scroll-mt-16"
        >
          <h2 className="font-display text-2xl">{category.name}</h2>
          {category.description ? (
            <p className="mt-1 text-[var(--muted)]">{category.description}</p>
          ) : null}
          <ul className="mt-5 grid gap-x-6 gap-y-8 sm:grid-cols-2">
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

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

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
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasOptions = item.optionGroups.length > 0;

  useEffect(() => () => {
    if (addedTimer.current !== null) clearTimeout(addedTimer.current);
  }, []);

  /**
   * Lägger till rätten och låter knappen kvittera i knappt två sekunder.
   *
   * Ett kort utan tillval hamnar i varukorgen på ett enda tryck. Utan en
   * kvittens på kortet är varukorgsraden längst ned det enda som ändrar sig,
   * och den ligger inte där ögat är — gästen trycker en gång till och får två.
   */
  function addAndConfirm(optionIds: string[], noteText: string) {
    onAdd(item, optionIds, noteText);
    setJustAdded(true);

    if (addedTimer.current !== null) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), 1800);
  }

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

  /*
   * Priset på kortet är det lägsta gästen kan komma undan med, inte
   * styckpriset. Har rätten en obligatorisk storleksgrupp är styckpriset ett
   * pris ingen kan få, och skillnaden upptäcks först på notan.
   */
  const range = useMemo(
    () => itemPriceRange(item.priceOre, item.optionGroups),
    [item.priceOre, item.optionGroups],
  );

  if (!item.isAvailable) {
    return (
      <li className="card overflow-hidden opacity-50">
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
        <h3 className="font-display p-4 text-lg line-through">{item.name}</h3>
      </li>
    );
  }

  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={hasOptions ? onToggle : () => addAndConfirm([], "")}
        aria-expanded={hasOptions ? isOpen : undefined}
        className="card group block w-full overflow-hidden text-left transition-shadow duration-[var(--speed)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600"
      >
        <FoodImage src={dishImage(item.name, item.imageUrl)} alt="" ratio="aspect-[4/3]" />

        <span className="block p-4">
        <span className="flex items-baseline justify-between gap-4">
          <span className="font-display text-lg group-hover:text-burp-600">{item.name}</span>
          <span className="shrink-0 font-semibold tabular-nums">
            {range.toOre > range.fromOre
              ? fill(labels.priceFrom, { price: money(range.fromOre) })
              : money(range.fromOre)}
          </span>
        </span>

        {item.description ? (
          <span className="mt-1 block text-sm leading-relaxed text-[var(--muted)]">
            {item.description}
          </span>
        ) : null}

        {item.allergens.length > 0 ? (
          <span className="label-caps mt-2 block">Allergener: {item.allergens.join(", ")}</span>
        ) : null}

        {/* Uppmaningen ser ut som en knapp for att den ar kortets enda
            handling — hela kortet ar klickbart, men ogat behover ett mal. */}
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-burp-600">
          {justAdded ? (
            <>
              <Check size={14} aria-hidden="true" />
              {labels.added}
            </>
          ) : hasOptions ? (
            isOpen ? (
              labels.hideOptions
            ) : (
              labels.chooseOptions
            )
          ) : (
            labels.add
          )}
        </span>
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
                      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burp-600 ${
                        isSelected
                          ? "border-burp-600 bg-burp-600 text-white"
                          : "border-[var(--rule-control)] bg-[var(--surface)] hover:border-burp-600"
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
              className="field mt-1.5 text-sm"
            />
          </label>

          <button
            type="button"
            disabled={unmetGroup !== undefined}
            onClick={() => {
              addAndConfirm(selected, note.trim());
              setSelected([]);
              setNote("");
            }}
            className="btn btn-primary mt-5 w-full justify-between"
          >
            <span>{unmetGroup ? fill(labels.chooseFirst, { group: unmetGroup.name }) : labels.add}</span>
            {!unmetGroup ? (
              <span className="tabular-nums">
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
 * 0, 5, 10 och 15 procent. Samma val fungerar i Sarajevo, Zagreb och Beograd —
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
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--rule)] bg-[var(--surface)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgb(0_0_0/0.10)]">
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
                      className="grid h-11 w-11 place-items-center rounded-full border border-[var(--rule-control)] text-lg transition-colors hover:border-burp-600"
                    >
                      −
                    </button>
                    <span className="w-4 text-center tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={fill(labels.addOne, { name: line.item.name })}
                      onClick={() => onQuantityChange(line.key, 1)}
                      className="grid h-11 w-11 place-items-center rounded-full border border-[var(--rule-control)] text-lg transition-colors hover:border-burp-600"
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
                  className="field mt-1.5"
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
                    className={`min-h-11 flex-1 rounded-lg border text-sm font-medium transition-colors ${
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
            className="btn btn-secondary"
          >
            <ShoppingBag size={16} aria-hidden="true" />
            {expanded ? labels.hide : fill(labels.itemCount, { n: itemCount })}
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
            />
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="btn btn-primary flex-1 justify-between"
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
