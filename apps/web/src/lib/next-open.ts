import { nextOpening, zonedNow, type OpeningHours, type WeekdayKey } from "@burp/core";

/**
 * Vilken av träffarna öppnar först?
 *
 * Bakgrunden: "Öppet nu" gav noll träffar klockan halv två på natten, vilket
 * var helt korrekt — och sidan svarade med tre olika meddelanden som var och
 * ett läste som ett fel. Kartan sa "ingen av träffarna har någon kartnål ännu",
 * listan sa "inga restauranger matchade", och räknaren sa "0 träffar". Inget
 * av det är sant: träffarna finns, de har nålar, och de är stängda.
 *
 * Den här funktionen ger det enda svar gästen faktiskt är ute efter.
 *
 * ── Varför väntetid och inte ett klockslag ────────────────────────────────
 *
 * Träffarna kan ligga i olika länder, alltså i olika tidszoner. "08:00" i
 * Zagreb och "08:00" i Beograd är samma ögonblick i dag, men Burp bygger inte
 * på att det förblir så — tidszonen är en egenskap hos restaurangen, och
 * regeln i CLAUDE.md är att landet avgör.
 *
 * Väntetiden räknas därför i minuter från NU, i varje restaurangs egen klocka,
 * och det talet går att jämföra rakt av. Att i stället jämföra klockslag hade
 * sorterat fel så fort marknaden spänner över två zoner.
 */

export interface OpeningCandidate {
  name: string;
  /**
   * Null för en restaurang som ännu inte lagt in några tider.
   *
   * Ansökningsformuläret frågar inte efter dem, så varje nyss godkänd
   * restaurang har `null` här tills ägaren fyllt i dem.
   */
  openingHours: OpeningHours | null;
  timeZone: string;
}

export interface SoonestOpening {
  /** Restaurangen som öppnar först. */
  name: string;
  /** 0 = i dag, 1 = i morgon, upp till 6. */
  daysAhead: number;
  /** Nyckeln i `OpeningHours`, för att kunna skriva ut veckodagen. */
  day: WeekdayKey;
  /** "08:00", i restaurangens egen tidszon. */
  opens: string;
}

/** "08:00" → 480. Returnerar null för allt som inte är ett klockslag. */
function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export function soonestOpening(
  candidates: readonly OpeningCandidate[],
  now: Date,
): SoonestOpening | null {
  let best: { wait: number; opening: SoonestOpening } | null = null;

  for (const candidate of candidates) {
    if (!candidate.openingHours) continue;

    const { dayIndex, minutes } = zonedNow(now, candidate.timeZone);
    const next = nextOpening(candidate.openingHours, dayIndex, minutes);
    if (!next) continue;

    const opensAt = toMinutes(next.opens);
    if (opensAt === null) continue;

    /*
     * Väntetiden kan bli negativ på en enda punkt: restaurangen är öppen just
     * nu, och `nextOpening` svarar med dagens egen öppning som redan passerat.
     * Det inträffar inte i det flöde som anropar den här — listan är per
     * definition stängd — men en negativ väntetid hade vunnit varje jämförelse
     * och pekat ut fel ställe, så den räknas som ett helt varv.
     */
    let wait = next.daysAhead * 1440 + opensAt - minutes;
    if (wait < 0) wait += 7 * 1440;

    if (!best || wait < best.wait) {
      best = {
        wait,
        opening: {
          name: candidate.name,
          daysAhead: next.daysAhead,
          day: next.day,
          opens: next.opens,
        },
      };
    }
  }

  return best?.opening ?? null;
}
