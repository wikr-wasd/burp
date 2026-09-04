import "server-only";

import type { Locale } from "./i18n/config";
import type { ActiveOrders, KitchenOrder } from "./orders";
import { translateMany } from "./translate";

/**
 * Gästens egna ord, på personalens språk.
 *
 * Det här är den riktning som INTE går att lösa på något annat sätt. En meny
 * kan restaurangen skriva på två språk om den vill; ett meddelande till köket
 * skrivs av en gäst som står vid bordet, och det kommer på hennes språk. "Utan
 * lök, jag är allergisk mot nötter" hjälper ingen kock som inte läser svenska.
 *
 * ── Originalet försvinner aldrig ───────────────────────────────────────────
 *
 * `note` blir den översatta texten, `noteOriginal` gästens egna ord. Båda
 * visas — den översatta stort, originalet under. En maskin kan ha fel, och då
 * ska den som lagar maten kunna se vad gästen faktiskt skrev. Ett namn eller
 * ett ord som motorn inte kände igen överlever oftast bättre i original.
 *
 * `noteOriginal` är null när ingenting översattes: utan API-nyckel, när texten
 * redan var på personalens språk, eller när leverantören inte svarade. Då står
 * bara gästens rad, precis som förut.
 *
 * ── Ett anrop för hela skärmen ─────────────────────────────────────────────
 *
 * Alla anteckningar på köksskärmen samlas ihop och skickas i EN omgång. En
 * order i taget hade blivit tjugo anrop under en lunchrush, och den andra
 * kocken hade väntat på nätverket. Cachen i `translate.ts` gör dessutom att
 * "utan lök" bara betalas för en gång i hela plattformens liv.
 */

export interface TranslatedNotes {
  due: KitchenOrder[];
  upcoming: KitchenOrder[];
  prepTimeMinutes: number;
}

export async function translateOrderNotes(
  orders: ActiveOrders,
  locale: Locale,
): Promise<TranslatedNotes> {
  const all = [...orders.due, ...orders.upcoming];

  // Varje anteckning på skärmen, i en enda lista. Ordningen är kontraktet
  // mot `translateMany()` — resultatet paras ihop på index.
  const sources: string[] = [];
  const slots: { order: KitchenOrder; itemIndex: number | null }[] = [];

  for (const order of all) {
    if (order.note) {
      sources.push(order.note);
      slots.push({ order, itemIndex: null });
    }

    for (const [index, item] of order.items.entries()) {
      if (!item.note) continue;
      sources.push(item.note);
      slots.push({ order, itemIndex: index });
    }
  }

  if (sources.length === 0) return orders;

  const translations = await translateMany(sources, locale);

  // Kopior, inte mutationer: `getActiveOrders()` svarar samma objekt till
  // flera anropare, och en yta ska inte kunna skriva om en annans data.
  const copies = new Map<KitchenOrder, KitchenOrder>();
  const copyOf = (order: KitchenOrder): KitchenOrder => {
    const existing = copies.get(order);
    if (existing) return existing;

    const copy: KitchenOrder = { ...order, items: order.items.map((item) => ({ ...item })) };
    copies.set(order, copy);
    return copy;
  };

  for (const [index, slot] of slots.entries()) {
    const result = translations[index];
    if (!result?.translated) continue;

    const copy = copyOf(slot.order);

    if (slot.itemIndex === null) {
      copy.noteOriginal = copy.note;
      copy.note = result.text;
    } else {
      const item = copy.items[slot.itemIndex];
      if (item) {
        item.noteOriginal = item.note;
        item.note = result.text;
      }
    }
  }

  return {
    due: orders.due.map((order) => copies.get(order) ?? order),
    upcoming: orders.upcoming.map((order) => copies.get(order) ?? order),
    prepTimeMinutes: orders.prepTimeMinutes,
  };
}

/**
 * Samma sak för bokningarnas anteckningar.
 *
 * "Vi är två i rullstol" och "barnstol, tack" är det restaurangen behöver
 * förstå INNAN gästen kommer — och det är precis den text en gäst från ett
 * annat land skriver på sitt eget språk.
 */
export async function translateNoteList(
  notes: readonly (string | null)[],
  locale: Locale,
): Promise<{ text: string; original: string | null }[]> {
  const positions: number[] = [];
  const sources: string[] = [];

  for (const [index, note] of notes.entries()) {
    if (!note) continue;
    positions.push(index);
    sources.push(note);
  }

  const out = notes.map((note) => ({ text: note ?? "", original: null as string | null }));
  if (sources.length === 0) return out;

  const translations = await translateMany(sources, locale);

  for (const [position, result] of translations.entries()) {
    if (!result.translated) continue;

    const index = positions[position]!;
    out[index] = { text: result.text, original: notes[index] ?? null };
  }

  return out;
}
