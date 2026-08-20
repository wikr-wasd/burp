/**
 * Köksköns ordning.
 *
 * Ren funktion, utan React och utan databas, av samma skäl som prislogiken
 * ligger i `@burp/core`: regeln nedan är en produktregel och ska gå att pröva
 * utan att rendera en skärm.
 *
 * REGELN: först in, först ut — på NOTAN, inte på den enskilda ordern.
 *
 * Notan är gemensam per bord sedan `table_sessions`, och två gäster som
 * beställer var för sig ger två order. Sorterade enbart på ankomsttid kunde de
 * hamna långt ifrån varandra med ett annat bords order emellan, och ingenting
 * sa att de hörde ihop. Den gemensamma notan höll ihop pengarna men inte maten.
 *
 * Ett bord tar därför plats i kön när dess FÖRSTA beställning kom in, och en
 * påfyllning ärver den platsen i stället för att ställa sig sist. Priset är att
 * ett annat bord kan få vänta på en order som lades senare än deras egen. Det
 * är rätt pris: alternativet är att servera halva sällskapet.
 *
 * Avhämtning och leverans har inget bord och grupperas inte — var och en
 * behåller sin egen plats i kön.
 */

export interface QueueOrder {
  id: string;
  tableNumber: string | null;
}

export interface QueuedTicket<T> {
  order: T;
  /** Beställningens nummer på bordet, från 1. Alltid 1 utan bord. */
  index: number;
  /** Hur många aktiva beställningar bordet har. Alltid 1 utan bord. */
  count: number;
}

/**
 * Ordnar en redan tidssorterad lista så att samma bords biljetter följer på
 * varandra, och räknar dem.
 *
 * `orders` MÅSTE komma i ankomstordning — funktionen använder positionen i
 * listan som ankomsttid och läser aldrig en tidsstämpel själv. Det håller den
 * oberoende av hur tiden råkar vara representerad, och gör att `getActiveOrders`
 * förblir det enda stället som bestämmer vad "äldst först" betyder.
 */
export function groupByTable<T extends QueueOrder>(orders: readonly T[]): QueuedTicket<T>[] {
  // Ett bord utan nummer är sin egen grupp. Nyckeln får order-id så att två
  // avhämtningar aldrig buntas ihop bara för att båda saknar bord.
  const keyOf = (order: T) =>
    order.tableNumber === null ? `ensam:${order.id}` : `bord:${order.tableNumber}`;

  const firstSeen = new Map<string, number>();
  const total = new Map<string, number>();

  orders.forEach((order, position) => {
    const key = keyOf(order);
    if (!firstSeen.has(key)) firstSeen.set(key, position);
    total.set(key, (total.get(key) ?? 0) + 1);
  });

  const placed = new Map<string, number>();

  return orders
    .map((order, position) => ({ order, position, key: keyOf(order) }))
    .sort(
      (a, b) =>
        // Notans plats i kön först, orderns plats inom notan sedan. Den andra
        // termen gör sorteringen stabil även där jämförelsefunktionen inte är.
        (firstSeen.get(a.key) ?? 0) - (firstSeen.get(b.key) ?? 0) || a.position - b.position,
    )
    .map(({ order, key }) => {
      const index = (placed.get(key) ?? 0) + 1;
      placed.set(key, index);
      return { order, index, count: total.get(key) ?? 1 };
    });
}
