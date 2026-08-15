/**
 * Vilken meny gäller just nu?
 *
 * En restaurang kan ha flera menyer med olika giltighetstider — lunch, kväll,
 * helg. Valet måste göras likadant i webben, i appen och på servern, annars
 * kan en gäst se ett lunchpris klockan 19.
 *
 * Tiden räknas i RESTAURANGENS tidszon, som följer av dess land
 * (`COUNTRY_INFO[...].timeZone`). En restaurang i Sarajevo öppnar 11:00
 * bosnisk tid oavsett var servern står eller vad gästens telefon påstår.
 *
 * Tidszonen är ett obligatoriskt argument med flit. Funktionen hette förut
 * `stockholmNow` och hade Europe/Stockholm inbakat — vilket råkade ge rätt
 * svar, eftersom alla fyra länderna ligger i CET, men bara råkade. Ett
 * standardvärde här hade gömt nästa land som inte gör det.
 */

export interface ScheduledMenu {
  /** 0 = söndag … 6 = lördag, samma numrering som Postgres `extract(dow)`. */
  activeDays: readonly number[] | null;
  /** "11:00" eller null för hela dagen. */
  activeFrom: string | null;
  /** "14:00" eller null. Exklusiv — 14:00 räknas som stängt. */
  activeUntil: string | null;
}

/**
 * Engelska förkortningar, inte svenska.
 *
 * Den tidigare versionen läste `sv-SE` och matchade mot "sön", "mån", … Vilka
 * förkortningar en körtid ger för ett språk är inte garanterat: Node med full
 * ICU, Node med small-icu och en webbläsare kan skilja sig, och en punkt för
 * mycket gav `indexOf` värdet -1 — alltså söndagens meny på en tisdag. `en-US`
 * ger "Sun"…"Sat" överallt.
 */
const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Väljer meny.
 *
 * En meny med tidsfönster vinner över en utan, så att lunchmenyn 11–14 slår
 * den allmänna menyn under lunchen men inte på kvällen. Finns flera med
 * tidsfönster vinner den första i listan — sortera på `sort_order` innan.
 */
export function pickMenuForNow<T extends ScheduledMenu>(
  menus: readonly T[],
  timeZone: string,
  now: Date = new Date(),
): T | null {
  const { dayIndex, minutes } = zonedNow(now, timeZone);

  const candidates = menus.filter((menu) => {
    if (menu.activeDays && menu.activeDays.length > 0 && !menu.activeDays.includes(dayIndex)) {
      return false;
    }
    if (menu.activeFrom !== null && minutes < toMinutes(menu.activeFrom)) return false;
    if (menu.activeUntil !== null && minutes >= toMinutes(menu.activeUntil)) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  return candidates.find((menu) => menu.activeFrom !== null || menu.activeUntil !== null) ?? candidates[0]!;
}

/**
 * Veckodag och minuter sedan midnatt i en given IANA-tidszon.
 *
 * `dayIndex` räknar från söndag = 0, samma numrering som Postgres
 * `extract(dow)` — så att en regel skriven i SQL och samma regel skriven här
 * betyder samma sak.
 */
export function zonedNow(now: Date, timeZone: string): { dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  const weekday = value("weekday").slice(0, 3).toLowerCase();
  const dayIndex = WEEKDAY_ORDER.indexOf(weekday as (typeof WEEKDAY_ORDER)[number]);

  if (dayIndex < 0) {
    throw new Error(
      `Kunde inte läsa veckodag ur tidszonen "${timeZone}" — fick "${value("weekday")}".`,
    );
  }

  // Intl kan ge "24" för midnatt i vissa körtider. Normalisera till 0.
  const hour = Number(value("hour")) % 24;

  return { dayIndex, minutes: hour * 60 + Number(value("minute")) };
}

function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}
