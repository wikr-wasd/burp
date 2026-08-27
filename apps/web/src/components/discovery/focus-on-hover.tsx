"use client";

import type { ReactNode } from "react";
import { focusRestaurant, useFocusedRestaurant } from "@/lib/map-focus";

/**
 * Tunt skal runt ett restaurangkort som kopplar det till kartan.
 *
 * Kortet självt renderas på servern och skickas in som `children`. Skalet gör
 * tre saker och inget mer: säger till när musen är över, släcker när den
 * lämnar, och ritar en ram när kartan pekar hit.
 *
 * ── Varför fokus, inte bara hover ───────────────────────────────────────────
 *
 * En tangentbordsanvändare tabbar sig genom listan och ser aldrig en hover.
 * `onFocus` gör att nålen följer med även då — och `within`-varianterna fångar
 * att fokus hamnar på länken INUTI kortet, inte på kortet.
 *
 * Ingenting här är nödvändigt för att sidan ska fungera. Laddas skriptet inte
 * står listan kvar som den var, vilket är hela poängen med att kortet renderas
 * på servern.
 */
export function FocusOnHover({ id, children }: { id: string; children: ReactNode }) {
  const focused = useFocusedRestaurant();
  const isActive = focused === id;

  return (
    <div
      data-restaurant={id}
      onMouseEnter={() => focusRestaurant(id)}
      onMouseLeave={() => focusRestaurant(null)}
      onFocusCapture={() => focusRestaurant(id)}
      onBlurCapture={() => focusRestaurant(null)}
      className={`h-full rounded-[var(--radius)] transition-shadow duration-[var(--speed)] ${
        isActive ? "ring-2 ring-burp-600 ring-offset-2 ring-offset-[var(--background)]" : ""
      }`}
    >
      {children}
    </div>
  );
}
