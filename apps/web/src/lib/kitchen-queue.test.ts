import { describe, expect, it } from "vitest";
import { groupByTable, type QueueOrder } from "./kitchen-queue";

/** Kortform: "6" = bordsorder, null = avhämtning. Id:t följer positionen. */
function queue(...tables: (string | null)[]): QueueOrder[] {
  return tables.map((tableNumber, i) => ({ id: `o${i + 1}`, tableNumber }));
}

const shape = (result: ReturnType<typeof groupByTable<QueueOrder>>) =>
  result.map((t) => `${t.order.tableNumber ?? "-"}:${t.index}/${t.count}`);

describe("köksköns ordning", () => {
  it("lämnar en redan grupperad kö orörd", () => {
    expect(shape(groupByTable(queue("6", "6", "11")))).toEqual([
      "6:1/2",
      "6:2/2",
      "11:1/1",
    ]);
  });

  /**
   * Kärnfallet, och det seeden bygger: bord 6 beställer, bord 11 beställer,
   * bord 6 fyller på. Rak FIFO ger 6 · 11 · 6 och lägger en annan nota mitt i
   * sällskapets. Det var felet.
   */
  it("drar ihop en flätad kö", () => {
    expect(shape(groupByTable(queue("6", "11", "6")))).toEqual([
      "6:1/2",
      "6:2/2",
      "11:1/1",
    ]);
  });

  /**
   * Notan behåller sin plats i kön, den flyttar sig inte fram.
   *
   * Bord 11 kom in före bord 6 och ska ligga först — även om bord 6 har två
   * beställningar. Utan det hade ett bord kunnat köa om sig genom att beställa
   * en gång till, vilket är motsatsen till vad regeln finns för.
   */
  it("flyttar inte fram en nota som beställer igen", () => {
    expect(shape(groupByTable(queue("11", "6", "11", "6")))).toEqual([
      "11:1/2",
      "11:2/2",
      "6:1/2",
      "6:2/2",
    ]);
  });

  it("buntar aldrig ihop två order utan bord", () => {
    const result = groupByTable(queue(null, "6", null));
    expect(shape(result)).toEqual(["-:1/1", "6:1/1", "-:1/1"]);
    // Ordningen mellan dem är orörd — den första avhämtningen ligger kvar först.
    expect(result.map((t) => t.order.id)).toEqual(["o1", "o2", "o3"]);
  });

  it("klarar en tom kö", () => {
    expect(groupByTable([])).toEqual([]);
  });

  it("räknar tre på samma bord", () => {
    expect(shape(groupByTable(queue("6", "11", "6", "6")))).toEqual([
      "6:1/3",
      "6:2/3",
      "6:3/3",
      "11:1/1",
    ]);
  });

  /**
   * Bordsnumret är text i databasen, inte ett tal. "7" och "07" är två olika
   * bord, och att slå ihop dem hade skickat ut fel mat.
   */
  it("skiljer bordsnummer som text", () => {
    expect(shape(groupByTable(queue("7", "07")))).toEqual(["7:1/1", "07:1/1"]);
  });

  it("behåller varje order exakt en gång", () => {
    const input = queue("6", "11", "6", null, "11", "3");
    const result = groupByTable(input);
    expect(result).toHaveLength(input.length);
    expect(new Set(result.map((t) => t.order.id)).size).toBe(input.length);
  });
});
