"use client";

import { useEffect, useState } from "react";

/**
 * Vilken restaurang som är i fokus just nu — kartan och listan pratar genom
 * den här.
 *
 * ── Varför en DOM-händelse och inte React-context ───────────────────────────
 *
 * Restauranglistan renderas på SERVERN, och det ska den fortsätta göra: den är
 * sidans innehåll, den ska finnas i HTML:en som Google läser, och den ska
 * fungera innan något JavaScript kört. En context hade krävt att listan blev en
 * klientkomponent, alltså att hela innehållet flyttade till webbläsaren för att
 * en nål ska lysa upp.
 *
 * En händelse på `window` kostar ingenting av det. Korten får ett tunt
 * klientskal som lyssnar; kartan, som redan är klientkod, lyssnar också.
 * Ingendera behöver veta att den andra finns — och sidan fungerar precis som
 * förut om en av dem inte laddas.
 */

const FOCUS_EVENT = "burp:focus-restaurant";

/** Null släcker fokus. */
export function focusRestaurant(id: string | null): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent<string | null>(FOCUS_EVENT, { detail: id }));
}

/**
 * Den restaurang som är i fokus, eller null.
 *
 * Läser aldrig något vid första renderingen. Servern och klienten måste rita
 * samma sak i första svepet, annars klagar React på att trädet inte stämmer —
 * och fokus finns per definition inte förrän någon rört musen.
 */
export function useFocusedRestaurant(): string | null {
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    const onFocus = (event: Event) => {
      setFocused((event as CustomEvent<string | null>).detail);
    };

    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, []);

  return focused;
}
