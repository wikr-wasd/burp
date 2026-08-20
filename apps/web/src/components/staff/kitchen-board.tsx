"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  allowedTransitions,
  formatMoney,
  isActiveForKitchen,
  ORDER_STATUS_LABELS,
  type CurrencyCode,
  type OrderStatus,
} from "@burp/core";
import { CheckCheck, Layers } from "lucide-react";
import { groupByTable } from "@/lib/kitchen-queue";
import { createClient } from "@/lib/supabase/client";
import type { KitchenOrder } from "@/lib/orders";

/**
 * Köksskärmen (avsnitt 11).
 *
 * Körs på en surfplatta i ett kök. Det ger tre krav som styr allt annat:
 *
 *   1. Läsbar på avstånd — stora ytor, hög kontrast, inga små ikoner
 *   2. Träffbar med blöta eller handskklädda fingrar — knappar minst 44 px
 *   3. Hörbar — en ny order mitt i en rush får inte bara dyka upp tyst
 *
 * Statusändringar går direkt mot Supabase med personalens egen session, inte
 * via ett eget API. RLS begränsar till den egna restaurangen och triggern i
 * databasen avvisar otillåtna övergångar, så ett mellanlager skulle bara
 * upprepa kontroller som redan finns — och kunna glömma en av dem.
 */

const NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  PLACED: { to: "ACCEPTED", label: "Ta emot" },
  ACCEPTED: { to: "PREPARING", label: "Börja laga" },
  PREPARING: { to: "READY", label: "Klar" },
  READY: { to: "COMPLETED", label: "Serverad" },
};

export function KitchenBoard({
  initialOrders,
  restaurantId,
  title = "Köksskärm",
  /**
   * Dashboarden får avvisa en order, köksskärmen inte. En kock som råkar
   * trycka fel ska inte kunna annullera en gästs beställning.
   */
  canCancel = false,
  /** Dashboarden visar belopp; köket har ingen nytta av dem. */
  showTotals = false,
  currency,
}: {
  initialOrders: KitchenOrder[];
  restaurantId: string;
  title?: string;
  canCancel?: boolean;
  showTotals?: boolean;
  /** Restaurangens valuta. Krävs så fort belopp visas. */
  currency: CurrencyCode;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  const knownIds = useRef(new Set(initialOrders.map((order) => order.id)));

  // Servern är sanningen. Kommer ny data in via en omrendering ska den vinna
  // över det lokala tillståndet.
  useEffect(() => {
    setOrders(initialOrders);
    for (const order of initialOrders) knownIds.current.add(order.id);
  }, [initialOrders]);

  const playChime = useCallback(() => {
    if (!soundOn) return;

    // Tonen genereras med Web Audio i stället för en ljudfil. Ingen extra
    // request, inget som kan blockeras av CSP, och inget att glömma i bygget.
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.6);
    } catch {
      // Ljud är en bekvämlighet. Går det inte ska skärmen fortsätta fungera.
    }
  }, [soundOn]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`kds:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; status?: string } | null;

          /*
           * Larmet går när ordern kommer IN I KÖKET, inte när raden skapas.
           *
           * Det var samma sak så länge varje order lades direkt. Med
           * kortbetalning är det inte det: en kortorder skapas som `DRAFT`
           * innan gästen betalat och lyfts till `PLACED` först av webhooken.
           * Med en kontroll på INSERT tjöt köksskärmen för en obetald order som
           * inte syns någonstans — och var tyst i det ögonblick pengarna kom in
           * och maten faktiskt skulle lagas.
           *
           * `knownIds` bär de order köket redan larmat för, så en statusändring
           * längre fram i flödet inte låter en gång till.
           */
          if (
            row?.id &&
            row.status !== undefined &&
            isActiveForKitchen(row.status as OrderStatus) &&
            !knownIds.current.has(row.id)
          ) {
            knownIds.current.add(row.id);
            playChime();
          }

          // Hämtar om från servern i stället för att sätta ihop raden lokalt.
          // Realtidsnyttolasten saknar orderrader och bordsnummer, och en
          // halvfärdig order på köksskärmen är värre än en halv sekunds fördröjning.
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, router, playChime]);

  async function advance(order: KitchenOrder, to: OrderStatus) {
    if (!allowedTransitions(order.status).includes(to)) return;

    setPending(order.id);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: to })
      .eq("id", order.id);

    if (updateError) {
      setError(`Kunde inte uppdatera order: ${updateError.message}`);
    } else {
      // Optimistiskt lokalt, sedan bekräftat av refresh().
      setOrders((current) =>
        current
          .map((o) => (o.id === order.id ? { ...o, status: to } : o))
          .filter((o) => o.status !== "COMPLETED"),
      );
      router.refresh();
    }

    setPending(null);
  }

  // Samma bords biljetter läggs bredvid varandra. Regeln och skälen till den
  // står i `lib/kitchen-queue.ts`, som har egna tester — kön är en produktregel
  // och ska gå att pröva utan att rendera en skärm.
  const byTable = groupByTable(orders);

  return (
    <div className="kds-screen">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="mr-auto text-2xl font-bold">{title}</h1>

        <button
          type="button"
          onClick={() => {
            setSoundOn(!soundOn);
            // Första klicket måste komma från en användarhandling, annars
            // vägrar webbläsaren spela upp ljud alls.
            if (!soundOn) playChime();
          }}
          className="rounded-md border border-black/15 px-4 py-2.5 text-sm dark:border-white/20"
        >
          Ljud: {soundOn ? "på" : "av"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-red-600/10 px-4 py-3 text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {orders.length === 0 ? (
        // Köksskärmen står utanför det gemensamma tomma tillståndet med flit:
        // den läses på några meters håll, och ett kort med brödtext syns inte
        // därifrån. Ikonen är stor av samma skäl som texten är det. En tom kö
        // är dessutom goda nyheter i ett kök — bocken säger det, inte en ruta.
        <div className="py-20 text-center opacity-50">
          <CheckCheck size={56} aria-hidden="true" className="mx-auto" />
          <p className="mt-4 text-xl">Inga aktiva beställningar.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {byTable.map(({ order, index, count }) => (
            <OrderCard
              key={order.id}
              order={order}
              sibling={count > 1 ? { index, count } : null}
              pending={pending === order.id}
              onAdvance={advance}
              canCancel={canCancel}
              showTotals={showTotals}
              currency={currency}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  pending,
  onAdvance,
  canCancel,
  showTotals,
  currency,
  sibling,
}: {
  order: KitchenOrder;
  /** Null när bordet bara har en aktiv beställning. */
  sibling: { index: number; count: number } | null;
  pending: boolean;
  onAdvance: (order: KitchenOrder, to: OrderStatus) => void;
  canCancel: boolean;
  showTotals: boolean;
  currency: CurrencyCode;
}) {
  const step = NEXT_STEP[order.status];
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancellable = canCancel && allowedTransitions(order.status).includes("CANCELLED");

  return (
    <article
      className={`rounded-xl border-2 p-4 ${
        order.status === "PLACED"
          ? "border-burp-600"
          : order.status === "READY"
            ? "border-green-600"
            : "border-black/10 dark:border-white/15"
      }`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-4xl">
          {order.tableNumber ? `Bord ${order.tableNumber}` : orderTypeLabel(order.type)}
        </h2>
        <Elapsed since={order.placedAt} />
      </header>

      {/*
        Bordet har fler beställningar inne.

        Biljetterna ligger bredvid varandra i kön, men "bredvid" räcker inte på
        en skärm som läses på några meters håll och som bryter till en spalt på
        en smal surfplatta. Raden säger rakt ut hur många notan består av, så
        att den som kör ut vet att det finns en till innan hon lämnar köket.

        Egen rad över statusen och inte inbakad i den: det här är det enda på
        biljetten som handlar om något UTANFÖR den, och ska inte läsas som en
        egenskap hos den här ordern.
      */}
      {sibling ? (
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-burp-600/10 px-2 py-1 text-sm font-semibold text-burp-700 dark:text-burp-400">
          <Layers size={15} aria-hidden="true" />
          Beställning {sibling.index} av {sibling.count} på bordet
        </p>
      ) : null}

      {/*
        Rummet står på samma rad som statusen, inte som en egen rubrik.

        Bordsnumret är det köket letar efter på avstånd och ska förbli det
        största på biljetten. Men "Bord 6" är en halv adress i en lokal med
        både uteservering och sal — den som springer ut med maten behöver
        veta åt vilket håll. Att lägga zonen intill statusen ger den plats
        utan att ta bort tyngden från numret.

        Visas bara när bordet har en zon. En tom rad säger ingenting.
      */}
      <p className="mt-1 text-sm font-medium uppercase tracking-wide opacity-60">
        {ORDER_STATUS_LABELS[order.status]}
        {order.tableZone ? (
          <>
            {" · "}
            <span className="text-[var(--foreground)] opacity-100">{order.tableZone}</span>
          </>
        ) : null}
      </p>

      <ul className="mt-4 space-y-2">
        {order.items.map((item) => (
          <li key={item.id}>
            <p className="text-lg">
              <span className="font-bold tabular-nums">{item.quantity}×</span> {item.name}
            </p>
            {item.options.length > 0 ? (
              <p className="pl-6 text-sm opacity-70">{item.options.join(", ")}</p>
            ) : null}
            {item.note ? (
              <p className="pl-6 text-sm font-medium text-burp-700 dark:text-burp-500">
                {item.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {order.note ? (
        <p className="mt-3 rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{order.note}</p>
      ) : null}

      {showTotals ? (
        <p className="mt-3 text-right text-lg font-semibold tabular-nums">
          {formatMoney(order.totalOre, currency)}
        </p>
      ) : null}

      {step ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvance(order, step.to)}
          className="mt-4 min-h-14 w-full rounded-lg bg-burp-600 text-lg font-semibold text-white disabled:opacity-50"
        >
          {pending ? "…" : step.label}
        </button>
      ) : null}

      {cancellable ? (
        confirmCancel ? (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                onAdvance(order, "CANCELLED");
                setConfirmCancel(false);
              }}
              className="min-h-12 flex-1 rounded-lg bg-red-600 font-semibold text-white disabled:opacity-50"
            >
              Avvisa ordern
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="min-h-12 rounded-lg border border-black/15 px-4 dark:border-white/20"
            >
              Avbryt
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="mt-2 min-h-12 w-full rounded-lg border border-black/15 text-sm dark:border-white/20"
          >
            Avvisa
          </button>
        )
      ) : null}
    </article>
  );
}

function orderTypeLabel(type: KitchenOrder["type"]): string {
  return type === "PICKUP" ? "Avhämtning" : type === "DELIVERY" ? "Leverans" : "Bord";
}

/** Minuter sedan ordern lades. Det köket faktiskt bryr sig om. */
function Elapsed({ since }: { since: string | null }) {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!since) return;

    const update = () =>
      setMinutes(Math.floor((Date.now() - new Date(since).getTime()) / 60_000));

    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [since]);

  if (minutes === null) return null;

  return (
    <span
      className={`shrink-0 tabular-nums text-lg font-semibold ${
        minutes >= 20 ? "text-red-600 dark:text-red-400" : "opacity-60"
      }`}
    >
      {minutes} min
    </span>
  );
}
