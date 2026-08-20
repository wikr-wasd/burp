"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search, SearchX, ShoppingBag, X } from "lucide-react";
import {
  calculateOrderTotals,
  formatMoney,
  itemPriceRange,
  punchCardReward,
  roundHalfEven,
  type CurrencyCode,
  type Ore,
  type PricedLine,
  type PunchCardState,
} from "@burp/core";
import { CardPayment } from "@/components/order/card-payment";
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
  /**
   * Kortbetalning, eller null när restaurangen inte har något aktivt betalkonto.
   *
   * Null är inte ett felläge. Det är läget i Bosnien och Serbien tills ett
   * lokalt avtal finns, och kontantflödet fungerar hela vägen. Att visa en
   * kortknapp som sedan nekar varje betalning vore sämre än att inte visa den.
   */
  card?: CardOption | null;
  /**
   * Gästens klippkort hos restaurangen, eller null.
   *
   * Null för en anonym QR-gäst, och det är avsiktligt: besök går inte att
   * räkna utan konto, och klippkortet ska inte bli ett skäl att spåra den som
   * valt bort ett.
   */
  punchCard?: PunchCardOffer | null;
}

/** Klippkortets läge plus restaurangens tak, så att belöningen går att räkna. */
export interface PunchCardOffer extends PunchCardState {
  maxRewardOre: number | null;
}

export interface CardOption {
  publishableKey: string;
}

/** En order som ligger som utkast och väntar på att gästen betalar. */
interface PendingPayment {
  orderId: string;
  clientSecret: string;
  stripeAccount: string;
}

/** En kupong som servern godkänt, med rabatten som servern räknade. */
interface AppliedCoupon {
  code: string;
  discountOre: Ore;
}

/** Ett presentkort som servern godkänt, med beloppet servern räknade. */
interface AppliedGiftCard {
  code: string;
  /** Vad kortet betalar av just den här notan. */
  appliedOre: Ore;
  /** Vad som finns kvar på kortet efteråt. */
  remainingOre: Ore;
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
  card = null,
  punchCard = null,
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

  /*
   * Idempotensnyckeln för DEN HÄR varukorgen, inte för det här försöket.
   *
   * Nyckeln skapades tidigare inne i `placeOrder`, alltså på nytt vid varje
   * knapptryck. Serverns skydd var därmed verkningslöst: `place_order` slår upp
   * en befintlig order på nyckeln och returnerar den i stället för att skapa en
   * ny, men två försök hade två nycklar och blev två order.
   *
   * Fallet det gäller är inte dubbelklick — knappen är låst under `submitting`.
   * Det är nätet som blinkar: begäran når servern, ordern skrivs, svaret kommer
   * aldrig fram. Gästen ser "ingen anslutning", trycker igen, och restaurangen
   * lagar två måltider medan gästen får två notor. Vid ett bord i en källare
   * med dålig täckning är det inte ett kantfall.
   *
   * Nyckeln nollställs när varukorgen ändras — då är det en annan beställning
   * och ska bli en annan order — och när ordern faktiskt gått igenom.
   */
  const idempotencyKey = useRef<string | null>(null);

  /*
   * Beställningen ligger kvar och skickas om när nätet är tillbaka.
   *
   * Noll betyder inget pågående återförsök. Ett tal är hur många försök som
   * gjorts — vilket både driver väntetiden och avgör när appen slutar.
   *
   * ── Varför inte en service worker ──────────────────────────────────────
   *
   * Den självklara lösningen vore Background Sync: lägg begäran i kö och låt
   * webbläsaren skicka den när täckningen kommer tillbaka, även om fliken
   * stängts. Två skäl talar emot.
   *
   * Background Sync finns inte i Safari på iOS, och QR-beställning används av
   * turister med iPhone. En lösning som tyst hjälper hälften av gästerna är
   * sämre än en som hjälper alla lika mycket.
   *
   * Och `public/sw.js` är medvetet tom på cachning — "ingenting som ligger
   * mellan gästen och sidan". Att lägga en kö där hade satt en worker framför
   * produktens viktigaste sida för ett fall som går att lösa utan.
   *
   * Gästen sitter kvar vid bordet med sidan öppen. Ett återförsök i förgrunden
   * täcker det som faktiskt händer: en blinkning, en tjock vägg, en källare.
   */
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Kontant är förvalt.
   *
   * Inte av bekvämlighet: kontanter är fortfarande utbredda i restaurangledet
   * i Bosnien och Serbien, och QR-beställningens värde — att slippa vänta på
   * en servitör för att beställa — finns kvar även när notan betalas i kassan.
   */
  const [payWithCard, setPayWithCard] = useState(false);
  /** Sätts när servern svarat med en betalning som väntar på gästen. */
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);

  /**
   * Kupongen, som servern räknat fram den.
   *
   * Beloppet kommer från `/api/coupons/preview` och aldrig från en uträkning
   * här. Klienten känner inte kupongens villkor och ska inte gissa dem —
   * samma regel som gäller priser, och samma skäl: en siffra som räknas på två
   * ställen glider isär, och då avbryts beställningen med "priset har ändrats"
   * utan att någon förstår varför.
   */
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);

  /**
   * Presentkortet, som servern räknat det.
   *
   * Skilt från kupongen med flit: ett presentkort är BETALMEDEL och sänker
   * bara vad som ska debiteras. Ordersumman, momsen och Burps avgiftsunderlag
   * står kvar orörda — därför ligger det utanför `calculateOrderTotals`.
   */
  const [giftCard, setGiftCard] = useState<AppliedGiftCard | null>(null);

  /**
   * Klippkortet är ett aktivt val och inte något som händer av sig självt.
   *
   * Den som har en full stämpelkarta vill inte alltid ta ut den på en kaffe.
   * Att lösa ut den automatiskt hade tagit beslutet ifrån gästen — och en
   * belöning som förbrukas utan att man ville det är sämre än ingen belöning.
   */
  const [usePunchCard, setUsePunchCard] = useState(false);

  /*
   * Ändras beställningen är det en annan order, och nyckeln ska inte återanvändas.
   *
   * Allt som påverkar vad servern skriver står i listan, inte bara varukorgen.
   * Dricksen, kupongen, presentkortet, klippkortet, hämttiden och betalsättet
   * hör till samma order — och `place_order` returnerar den BEFINTLIGA ordern
   * när nyckeln känns igen. Utan de här beroendena hade en gäst som ändrade
   * dricksen efter ett misslyckat försök fått tillbaka sin första order med den
   * gamla dricksen, utan att något sa ifrån.
   */
  useEffect(() => {
    idempotencyKey.current = null;
    // Ett pågående återförsök gäller den GAMLA beställningen. Ändrar gästen
    // något ska kön sluta — annars skickas något hon just ändrat bort.
    setRetryAttempt(0);
  }, [cart, tipBps, coupon, giftCard, usePunchCard, scheduledFor, payWithCard]);

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

  const itemsGrossForDiscount = useMemo(
    () =>
      pricedLines.length > 0
        ? calculateOrderTotals({ lines: pricedLines }).itemsGrossOre
        : 0,
    [pricedLines],
  );

  /**
   * Klippkortets belöning, räknad med samma funktion som servern använder.
   *
   * Kupongens belopp kommer från servern eftersom klienten inte känner
   * kupongens villkor. Klippkortet är tvärtom: villkoren är kända här (kortets
   * storlek och restaurangens tak), och summan MÅSTE gå att räkna lokalt —
   * annars stämmer inte `client_total_ore` och servern avbryter ordern.
   */
  const punchCardRewardOre = useMemo(() => {
    if (!usePunchCard || !punchCard?.isEarned) return 0;
    return punchCardReward({
      itemsGrossOre: itemsGrossForDiscount,
      discountOre: coupon?.discountOre ?? 0,
      maxRewardOre: punchCard.maxRewardOre,
    });
  }, [usePunchCard, punchCard, itemsGrossForDiscount, coupon]);

  const totals = useMemo(
    () =>
      pricedLines.length > 0
        ? calculateOrderTotals({
            lines: pricedLines,
            tipOre,
            // Kupongens rabatt kommer från servern, inte från en uträkning här.
            // Klienten känner inte kupongens villkor och ska inte gissa — samma
            // regel som gäller priser.
            discountOre: (coupon?.discountOre ?? 0) + punchCardRewardOre,
          })
        : null,
    [pricedLines, tipOre, coupon, punchCardRewardOre],
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

  /**
   * Kvittots adress. Bordskvittot ligger under bordets token,
   * avhämtningskvittot fristående — en avhämtningsgäst har inget bord att
   * hänga sidan under.
   */
  function receiptPath(orderId: string) {
    return context.kind === "TABLE"
      ? `/t/${context.tableToken}/order/${orderId}`
      : `/order/${orderId}`;
  }

  /**
   * Prövar en kod mot varukorgen.
   *
   * Sparar ingenting. Kupongen tas i anspråk först när ordern läggs, i samma
   * transaktion som inlösenraden skrivs — annars hade en gäst som bara ville se
   * vad koden var värd blockerat den sista för någon annan.
   */
  async function applyCoupon(code: string): Promise<string | null> {
    const response = await fetch("/api/coupons/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        tip_ore: tipOre,
        items: cart.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
          options: line.optionIds.map((optionId) => ({ option_id: optionId })),
        })),
      }),
    }).catch(() => null);

    if (!response) return labels.noConnection;

    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.ok) {
      return body?.detail ?? labels.orderFailed;
    }

    setCoupon({ code, discountOre: body.discount_ore });
    // Ett presentkort som räknats mot den gamla notan gäller inte längre.
    // Hellre be gästen slå in det igen än visa ett belopp som är fel.
    setGiftCard(null);
    return null;
  }

  /** Prövar ett presentkort mot varukorgen. Sparar ingenting. */
  async function applyGiftCardCode(code: string): Promise<string | null> {
    const response = await fetch("/api/gift-cards/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        tip_ore: tipOre,
        discount_ore: coupon?.discountOre ?? 0,
        items: cart.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
          options: line.optionIds.map((optionId) => ({ option_id: optionId })),
        })),
      }),
    }).catch(() => null);

    if (!response) return labels.noConnection;

    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.ok) {
      return body?.detail ?? labels.orderFailed;
    }

    setGiftCard({
      code,
      appliedOre: body.applied_ore,
      remainingOre: body.balance_ore - body.applied_ore,
    });
    return null;
  }

  async function placeOrder() {
    if (!totals || cart.length === 0) return;

    // Ett väntande återförsök avbryts när något nytt startar, annars kan två
    // begäranden vara i luften samtidigt.
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

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
          // Betalsätt, inte leverantör. Vilken inlösare kortet går genom
          // avgörs av restaurangens betalkonto, på servern.
          payment_method: payWithCard && card ? "CARD" : "CASH",
          // Koden, aldrig beloppet. Servern räknar om rabatten och avvisar
          // ordern om klientens summa inte stämmer.
          ...(coupon ? { coupon_code: coupon.code } : {}),
          ...(giftCard ? { gift_card_code: giftCard.code } : {}),
          // En begäran, inte ett belopp. Servern räknar om antalet besök och
          // avgör själv om kortet är fullt.
          ...(usePunchCard && punchCard?.isEarned ? { use_punch_card: true } : {}),
          // Samma nyckel så länge varukorgen är densamma. Ett andra försök
          // efter ett tappat svar ger därför samma order, inte en till.
          idempotency_key: (idempotencyKey.current ??= crypto.randomUUID()),
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
        /*
         * Servern svarade, och svaret var nej.
         *
         * Ett återförsök hjälper inte mot en stängd restaurang, ett ändrat pris
         * eller ett tomt presentkort — och att försöka ändå hade dolt beskedet
         * bakom en snurra. Kön är till för tystnad, inte för avslag.
         */
        setRetryAttempt(0);
        setError(body?.detail ?? labels.orderFailed);
        return;
      }

      setRetryAttempt(0);

      /*
       * Kortbetalning: ordern ligger som utkast tills pengarna kommit in.
       *
       * Varukorgen töms INTE här. Går betalningen inte igenom ska gästen ha
       * kvar sin beställning och kunna välja "på plats" i stället — att behöva
       * lägga in nio rätter en gång till vid ett bord är hur man förlorar en
       * gäst.
       */
      if (body?.payment?.client_secret) {
        setPendingPayment({
          orderId: body.order_id,
          clientSecret: body.payment.client_secret,
          stripeAccount: body.payment.stripeAccount ?? "",
        });
        return;
      }

      setCart([]);
      router.push(receiptPath(body.order_id));
    } catch {
      /*
       * `fetch` kastade — servern svarade aldrig.
       *
       * Det är det enda fall som ska köas. Beställningen ligger kvar och
       * skickas om av effekten nedan, med SAMMA idempotensnyckel, så ett
       * försök som i själva verket gick fram ger tillbaka samma order i
       * stället för en till.
       */
      setRetryAttempt((attempt) => attempt + 1);
    } finally {
      setSubmitting(false);
    }
  }

  /*
   * Skickar om av sig själv tills det går igenom.
   *
   * Två utlösare: `online`-händelsen, som kommer så fort telefonen fått
   * täckning igen, och en klocka som backar av — 2, 4, 8 sekunder och sedan var
   * femtonde. Bara `online` hade räckt i teorin men inte i praktiken: en
   * telefon som har wifi till en router utan internet räknas som online hela
   * tiden, och då kommer händelsen aldrig.
   *
   * Efter ungefär två minuter slutar appen försöka och lämnar över till gästen.
   * En snurra som aldrig tar slut säger inte längre något.
   */
  const RETRY_LIMIT = 12;

  useEffect(() => {
    if (retryAttempt === 0 || retryAttempt > RETRY_LIMIT || submitting) return;

    const delay = Math.min(2000 * 2 ** (retryAttempt - 1), 15_000);
    retryTimer.current = setTimeout(() => void placeOrder(), delay);

    const onOnline = () => void placeOrder();
    window.addEventListener("online", onOnline);

    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      window.removeEventListener("online", onOnline);
    };
    // `placeOrder` står medvetet inte bland beroendena. Den skapas om vid varje
    // rendering, och hade klockan startat om varje gång gästen rörde
    // varukorgen skulle återförsöket aldrig hinna gå av.
  }, [retryAttempt, submitting]);

  /**
   * Gästen stängde betalrutan utan att betala.
   *
   * Utkastet avbryts direkt i stället för att lämnas åt leverantörens
   * utgångstid. Ordern syns visserligen inte för köket så länge den är DRAFT,
   * men ett bord som har en öppen obetald order i bakgrunden är förvirrande
   * för den som senare tittar i loggen. Går anropet inte igenom städas den av
   * betalningens egen utgång — därför sväljs felet.
   */
  async function abandonPayment(orderId: string) {
    setPendingPayment(null);
    setSubmitting(false);
    setError(labels.paymentAbandoned);

    /*
     * Utkastet avbryts nedan, och nyckeln får inte peka på det längre.
     *
     * `place_order` slår upp ordern på nyckeln utan att bry sig om dess status.
     * Behölls nyckeln skulle gästen som väljer "betala på plats" i stället
     * skickas till en AVBRUTEN order — en kvittosida för mat ingen lagar.
     */
    idempotencyKey.current = null;

    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CANCEL" }),
    }).catch(() => undefined);
  }

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  return (
    // Plats för den fasta varukorgsraden — men bara när den finns. Annars
    // slutar sidan med en skärmhög lucka som ser ut som att något saknas.
    <div className={cart.length > 0 ? "pb-44" : ""}>
      {showHeading ? (
        <header className="mb-10">
          {/*
            Bordsbannern.

            Gästen har just riktat en kamera mot en dekal och blivit skickad
            någonstans. Det första sidan måste svara på är inte "vad finns på
            menyn" utan "kom jag rätt" — vilket bord, vilken restaurang. Grönt
            därför att det är en bekräftelse, inte en varning.

            Andra raden är lika viktig: den som aldrig beställt vid ett bord
            väntar sig att bli ombedd att ladda ned något. Att säga att hen
            inte behöver det tar bort tveksamheten innan den hinner uppstå.

            Avhämtning får ingen banner. Där har gästen valt restaurangen
            själv och behöver ingen bekräftelse på var hen hamnat.
          */}
          {context.kind === "TABLE" ? (
            <div className="mb-6 flex items-center gap-3 rounded-[var(--radius)] border border-green-600/30 bg-green-600/10 p-4">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-600"
              />
              <div className="min-w-0">
                {/* Bara bordet, inte restaurangen. Namnet står som rubrik
                    direkt under — samma namn två gånger med tre centimeters
                    mellanrum läser som ett fel, inte som en bekräftelse. */}
                <p className="font-medium">
                  {fill(labels.table, { number: context.tableNumber })}
                </p>
                <p className="text-sm text-[var(--muted)]">{labels.noAppNoAccount}</p>
              </div>
            </div>
          ) : (
            <p className="label-caps">{labels.pickup}</p>
          )}

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
                className={`chip ${isActive ? "chip-active" : ""}`}
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
          retryAttempt={retryAttempt}
          retryLimit={RETRY_LIMIT}
          cardAvailable={card !== null}
          payWithCard={payWithCard}
          onPayWithCardChange={setPayWithCard}
          coupon={coupon}
          onApplyCoupon={applyCoupon}
          onRemoveCoupon={() => setCoupon(null)}
          giftCard={giftCard}
          onApplyGiftCard={applyGiftCardCode}
          onRemoveGiftCard={() => setGiftCard(null)}
          punchCard={punchCard}
          usePunchCard={usePunchCard}
          onUsePunchCardChange={setUsePunchCard}
        />
      ) : null}

      {pendingPayment && card ? (
        <CardPayment
          publishableKey={card.publishableKey}
          stripeAccount={pendingPayment.stripeAccount}
          clientSecret={pendingPayment.clientSecret}
          returnUrl={
            typeof window === "undefined"
              ? ""
              : new URL(receiptPath(pendingPayment.orderId), window.location.origin).toString()
          }
          labels={{
            title: labels.paymentTitle,
            pay: labels.payNow,
            paying: labels.paying,
            cancel: labels.paymentCancel,
            failed: labels.paymentFailed,
          }}
          onCancel={() => void abandonPayment(pendingPayment.orderId)}
          onPaid={() => {
            setCart([]);
            router.push(receiptPath(pendingPayment.orderId));
          }}
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
  retryAttempt,
  retryLimit,
  pickupSlots,
  timeZone,
  scheduledFor,
  onScheduleChange,
  cardAvailable,
  payWithCard,
  onPayWithCardChange,
  coupon,
  onApplyCoupon,
  onRemoveCoupon,
  giftCard,
  onApplyGiftCard,
  onRemoveGiftCard,
  punchCard,
  usePunchCard,
  onUsePunchCardChange,
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
  /** Noll = inget pågående återförsök. Annars vilket försök i ordningen. */
  retryAttempt: number;
  retryLimit: number;
  pickupSlots: readonly string[];
  timeZone: string;
  scheduledFor: string;
  onScheduleChange: (value: string) => void;
  /** Falskt när restaurangen saknar betalkonto. Då visas inget val alls. */
  cardAvailable: boolean;
  payWithCard: boolean;
  onPayWithCardChange: (value: boolean) => void;
  coupon: AppliedCoupon | null;
  /** Returnerar ett felmeddelande, eller null när koden gick igenom. */
  onApplyCoupon: (code: string) => Promise<string | null>;
  onRemoveCoupon: () => void;
  giftCard: AppliedGiftCard | null;
  onApplyGiftCard: (code: string) => Promise<string | null>;
  onRemoveGiftCard: () => void;
  punchCard: PunchCardOffer | null;
  usePunchCard: boolean;
  onUsePunchCardChange: (value: boolean) => void;
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

            {/*
              Betalsättet.

              Visas bara när restaurangen har ett aktivt betalkonto. Utan det
              finns ingen kortväg, och en knapp som nekar varje betalning vore
              sämre än ingen knapp.
            */}
            {cardAvailable ? (
              <div className="mt-5">
                <p className="label-caps">{labels.payHow}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    aria-pressed={!payWithCard}
                    onClick={() => onPayWithCardChange(false)}
                    className={`min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors ${
                      !payWithCard
                        ? "border-burp-600 bg-burp-600 text-white"
                        : "border-[var(--rule)] hover:border-burp-600"
                    }`}
                  >
                    {labels.payAtPlace}
                  </button>
                  <button
                    type="button"
                    aria-pressed={payWithCard}
                    onClick={() => onPayWithCardChange(true)}
                    className={`min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors ${
                      payWithCard
                        ? "border-burp-600 bg-burp-600 text-white"
                        : "border-[var(--rule)] hover:border-burp-600"
                    }`}
                  >
                    {labels.payByCard}
                  </button>
                </div>
                {payWithCard ? (
                  <p className="mt-1.5 text-xs text-[var(--muted)]">{labels.payByCardHint}</p>
                ) : null}
              </div>
            ) : null}

            {/*
              Klippkortet ligger överst bland betalvalen.

              Den som har en full stämpelkarta ska se det innan hon börjar leta
              efter rabattkoder — och den som har tre klipp kvar ska se att det
              finns ett kort alls. Ett lojalitetsprogram ingen känner till är
              inget lojalitetsprogram.
            */}
            {punchCard ? (
              <div className="mt-5 rounded-lg border border-[var(--rule)] px-3 py-2">
                <p className="label-caps">{labels.punchCard}</p>

                <div className="mt-1.5 flex gap-1" aria-hidden="true">
                  {Array.from({ length: punchCard.size }, (_, index) => (
                    <span
                      key={index}
                      className={`h-2.5 flex-1 rounded-full ${
                        index < punchCard.visits ? "bg-amber-400" : "bg-[var(--rule)]"
                      }`}
                    />
                  ))}
                </div>

                <p className="mt-2 text-sm">
                  {punchCard.isEarned
                    ? labels.punchCardEarned
                    : fill(labels.punchCardRemaining, { n: punchCard.remaining })}
                </p>

                {punchCard.isEarned ? (
                  <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={usePunchCard}
                      onChange={(event) => onUsePunchCardChange(event.target.checked)}
                      className="h-5 w-5 accent-[var(--burp-600,#dc2626)]"
                    />
                    {labels.punchCardUse}
                  </label>
                ) : (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {fill(labels.punchCardProgress, {
                      visits: punchCard.visits,
                      size: punchCard.size,
                    })}
                  </p>
                )}
              </div>
            ) : null}

            <CouponField
              labels={labels}
              coupon={coupon}
              money={money}
              onApply={onApplyCoupon}
              onRemove={onRemoveCoupon}
            />

            <GiftCardField
              labels={labels}
              giftCard={giftCard}
              money={money}
              onApply={onApplyGiftCard}
              onRemove={onRemoveGiftCard}
            />

            <dl className="mt-5 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">{labels.foodAndDrink}</dt>
                <dd className="tabular-nums">{money(totals.itemsGrossOre)}</dd>
              </div>
              {totals.discountOre < 0 ? (
                <div className="flex justify-between text-green-700 dark:text-green-400">
                  <dt>{labels.discount}</dt>
                  <dd className="tabular-nums">{money(totals.discountOre)}</dd>
                </div>
              ) : null}
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

              {/* Presentkortet står UNDER momsraden och inte bland rabatterna,
                  därför att det inte är en rabatt. Notan och momsen är
                  desamma; det som ändras är vad gästen ska betala nu. */}
              {giftCard ? (
                <>
                  <div className="flex justify-between pt-2">
                    <dt className="text-[var(--muted)]">{labels.giftCard}</dt>
                    <dd className="tabular-nums">−{money(giftCard.appliedOre)}</dd>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <dt>{labels.toPay}</dt>
                    <dd className="tabular-nums">
                      {money(Math.max(0, totals.totalOre - giftCard.appliedOre))}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mb-3 border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100">
            {error}
          </p>
        ) : null}

        {/*
          Nätet blinkade. Beställningen ligger kvar och skickas om av sig själv.

          `aria-live="polite"` och inte `role="alert"`: det här är ett pågående
          tillstånd, inte ett fel, och en skärmläsare ska inte avbryta gästen
          mitt i en mening för att räkna upp försök. Knappen finns för den som
          ser att täckningen är tillbaka och inte vill vänta ut klockan.
        */}
        {retryAttempt > 0 ? (
          <div
            aria-live="polite"
            className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
          >
            <span className="flex-1">
              {retryAttempt > retryLimit ? labels.retryGaveUp : labels.retrying}
            </span>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="min-h-9 shrink-0 rounded-[0.5rem] border border-current px-3 font-medium disabled:opacity-50"
            >
              {labels.retryNow}
            </button>
          </div>
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
            <span>
              {submitting ? labels.sending : payWithCard ? labels.payNow : labels.order}
            </span>
            {/* Knappen visar vad gästen faktiskt betalar nu. Ett presentkort
                som redan täckt halva notan ska inte stå kvar i siffran. */}
            <span className="tabular-nums">
              {money(Math.max(0, totals.totalOre - (giftCard?.appliedOre ?? 0)))}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Rabattkodsfältet.
 *
 * Ligger hopfällt tills gästen ber om det. De flesta har ingen kod, och ett
 * öppet fält i kassan är en fråga som får den som inte har någon att undra om
 * hen betalar för mycket.
 */
function CouponField({
  labels,
  coupon,
  money,
  onApply,
  onRemove,
}: {
  labels: Dictionary["menu"];
  coupon: AppliedCoupon | null;
  money: (amount: Ore) => string;
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (coupon) {
    return (
      <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-green-600/40 bg-green-50 px-3 py-2 text-sm dark:bg-green-900/30">
        <span className="font-medium">
          {coupon.code} · −{money(coupon.discountOre)}
        </span>
        <button
          type="button"
          onClick={() => {
            onRemove();
            setOpen(false);
            setCode("");
          }}
          className="min-h-11 text-[var(--muted)] underline underline-offset-2"
        >
          {labels.couponRemove}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 text-sm text-[var(--muted)] underline underline-offset-2 hover:text-burp-600"
      >
        {labels.coupon}
      </button>
    );
  }

  async function submit() {
    if (!code.trim()) return;
    setChecking(true);
    setError(await onApply(code.trim()));
    setChecking(false);
  }

  return (
    <div className="mt-5">
      <p className="label-caps">{labels.coupon}</p>
      <div className="mt-1.5 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          placeholder={labels.couponPlaceholder}
          autoCapitalize="characters"
          autoComplete="off"
          className="field flex-1 uppercase"
        />
        <button
          type="button"
          onClick={submit}
          disabled={checking || !code.trim()}
          className="btn btn-secondary"
        >
          {checking ? labels.couponChecking : labels.couponApply}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-burp-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Presentkortsfältet.
 *
 * Skilt från rabattkoden, och det är avsiktligt att de ser olika ut. Ett
 * presentkort har ett saldo som lever vidare — gästen ska se vad som blir kvar
 * efteråt, för det är hela skillnaden mot en kupong.
 */
function GiftCardField({
  labels,
  giftCard,
  money,
  onApply,
  onRemove,
}: {
  labels: Dictionary["menu"];
  giftCard: AppliedGiftCard | null;
  money: (amount: Ore) => string;
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (giftCard) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--rule)] px-3 py-2 text-sm">
        <span>
          <span className="font-medium">{labels.giftCard}</span> −{money(giftCard.appliedOre)}
          {giftCard.remainingOre > 0 ? (
            <span className="block text-xs text-[var(--muted)]">
              {fill(labels.giftCardLeft, { amount: money(giftCard.remainingOre) })}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => {
            onRemove();
            setOpen(false);
            setCode("");
          }}
          className="min-h-11 shrink-0 text-[var(--muted)] underline underline-offset-2"
        >
          {labels.giftCardRemove}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 block text-sm text-[var(--muted)] underline underline-offset-2 hover:text-burp-600"
      >
        {labels.giftCard}
      </button>
    );
  }

  async function submit() {
    if (!code.trim()) return;
    setChecking(true);
    setError(await onApply(code.trim()));
    setChecking(false);
  }

  return (
    <div className="mt-3">
      <p className="label-caps">{labels.giftCard}</p>
      <div className="mt-1.5 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          placeholder={labels.giftCardPlaceholder}
          autoCapitalize="characters"
          autoComplete="off"
          className="field flex-1 uppercase"
        />
        <button
          type="button"
          onClick={submit}
          disabled={checking || !code.trim()}
          className="btn btn-secondary"
        >
          {checking ? labels.giftCardChecking : labels.giftCardApply}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-burp-600">
          {error}
        </p>
      ) : null}
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
