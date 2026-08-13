/**
 * Vilken meny gäller just nu?
 *
 * En restaurang kan ha flera menyer med olika giltighetstider — lunch, kväll,
 * helg. Valet måste göras likadant i webben, i appen och på servern, annars
 * kan en gäst se ett lunchpris klockan 19.
 *
 * Tiden räknas alltid i svensk lokaltid. En restaurang i Malmö öppnar 11:00
 * svensk tid oavsett var servern står eller vilken tidszon gästens telefon
 * påstår sig ha.
 */

export interface ScheduledMenu {
  /** 0 = söndag … 6 = lördag, samma numrering som Postgres `extract(dow)`. */
  activeDays: readonly number[] | null;
  /** "11:00" eller null för hela dagen. */
  activeFrom: string | null;
  /** "14:00" eller null. Exklusiv — 14:00 räknas som stängt. */
  activeUntil: string | null;
}

const WEEKDAY_ORDER = ["sön", "mån", "tis", "ons", "tors", "fre", "lör"] as const;

/**
 * Väljer meny.
 *
 * En meny med tidsfönster vinner över en utan, så att lunchmenyn 11–14 slår
 * den allmänna menyn under lunchen men inte på kvällen. Finns flera med
 * tidsfönster vinner den första i listan — sortera på `sort_order` innan.
 */
export function pickMenuForNow<T extends ScheduledMenu>(
  menus: readonly T[],
  now: Date = new Date(),
): T | null {
  const { dayIndex, minutes } = stockholmNow(now);

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

/** Veckodag och minuter sedan midnatt i Europe/Stockholm. */
export function stockholmNow(now: Date): { dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  const weekday = value("weekday").replace(".", "").toLowerCase();
  const dayIndex = WEEKDAY_ORDER.indexOf(weekday as (typeof WEEKDAY_ORDER)[number]);

  // Intl kan ge "24" för midnatt i vissa körtider. Normalisera till 0.
  const hour = Number(value("hour")) % 24;

  return { dayIndex, minutes: hour * 60 + Number(value("minute")) };
}

function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}
