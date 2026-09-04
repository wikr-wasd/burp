"use client";

import { useState, useTransition } from "react";
import { ALLERGENS, type Allergen } from "@burp/core";
import type { Dictionary } from "@/lib/i18n";

/**
 * Allergenerna som kryssrutor, inte som fritext.
 *
 * Fältet var en textrad med hjälptexten "kommaseparerade", och följden syntes i
 * datan: `mleko` och `mlijeko` stod sida vid sida — samma allergen, två
 * stavningar, två restauranger. Den som sökte en rätt utan mjölk hittade
 * hälften, och en svensk gäst i Sarajevo läste "mlijeko" och förstod
 * ingenting.
 *
 * Med en fast lista går det inte att stava fel, och koden översätts av
 * ordboken — exakt, gratis, och likadant varje gång. Listan är EU:s fjorton
 * enligt förordning 1169/2011; fler går att lägga till, färre går inte.
 *
 * Sparar direkt vid klick. Ett allergen är ett av/på, och en sparaknapp
 * mellan kryssrutan och verkligheten är ett steg där något kan glömmas.
 */
export function AllergenPicker({
  selected,
  labels,
  onSave,
}: {
  selected: readonly string[];
  labels: Dictionary["allergen"];
  onSave: (allergens: Allergen[]) => Promise<void>;
}) {
  const [current, setCurrent] = useState<string[]>([...selected]);
  const [pending, startTransition] = useTransition();

  function toggle(allergen: Allergen) {
    const next = current.includes(allergen)
      ? current.filter((value) => value !== allergen)
      : [...current, allergen];

    const previous = current;
    setCurrent(next);

    startTransition(async () => {
      try {
        await onSave(ALLERGENS.filter((value) => next.includes(value)));
      } catch {
        // Rulla tillbaka. En kryssruta som ser ikryssad ut men inte sparats är
        // värre än ingen kryssruta alls — särskilt här.
        setCurrent(previous);
      }
    });
  }

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {ALLERGENS.map((allergen) => {
        const active = current.includes(allergen);

        return (
          <li key={allergen}>
            <button
              type="button"
              disabled={pending}
              aria-pressed={active}
              onClick={() => toggle(allergen)}
              className={`chip ${active ? "chip-active" : ""} disabled:opacity-50`}
            >
              {labels[allergen]}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
