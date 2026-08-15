import { zonedNow } from "./menu-schedule";

/**
 * Schemalagd tillgänglighet för en menyrad.
 *
 * Skild från `menu_items.is_available`, som är dagens av/på-knapp. Den här
 * svarar på "slut till på fredag" och "serveras bara till lunch" — regler som
 * ska sluta gälla av sig själva.
 *
 * Skillnaden är inte akademisk. En kock som släcker en rätt manuellt måste
 * också tända den igen, och det är precis det steget som glöms: rätten ligger
 * kvar som slutsåld i en vecka och ingen märker det förrän en gäst frågar.
 *
 * En rad är alltid en INSKRÄNKNING. Finns inga rader gäller rätten alltid;
 * finns flera räcker det att en av dem släpper igenom. Motsatsen — att varje
 * regel måste vara uppfylld — hade gjort "lunch" och "fredagar" omöjliga att
 * kombinera, eftersom ingen tidpunkt är både lunch och alla fredagar.
 */

export interface AvailabilityRule {
  /** ISO-tid eller null för "ingen början". */
  availableFrom: string | null;
  /** ISO-tid eller null för "inget slut". */
  availableTo: string | null;
  /** 0 = söndag … 6 = lördag, samma numrering som Postgres. Null = alla dagar. */
  weekday: number | null;
  /** Visas för gästen när rätten inte går att beställa. */
  reason: string | null;
}

export interface AvailabilityState {
  isAvailable: boolean;
  /**
   * Varför den inte går att beställa, om restaurangen skrivit något.
   *
   * Tas från den regel som ligger närmast i tiden — en gäst som ser "slut till
   * fredag" är hjälpt; en som ser "otillgänglig" är det inte.
   */
  reason: string | null;
}

/**
 * Gäller rätten just nu?
 *
 * `timeZone` är restaurangens. Veckodagen måste räknas där restaurangen står:
 * klockan 00:30 i Sarajevo är fortfarande föregående dag i UTC, och en
 * fredagsregel hade då gällt en timme in på lördagen.
 */
export function availabilityState(
  rules: readonly AvailabilityRule[],
  timeZone: string,
  now: Date = new Date(),
): AvailabilityState {
  if (rules.length === 0) return { isAvailable: true, reason: null };

  const { dayIndex } = zonedNow(now, timeZone);
  const stamp = now.getTime();

  const matches = (rule: AvailabilityRule): boolean => {
    if (rule.weekday !== null && rule.weekday !== dayIndex) return false;

    if (rule.availableFrom !== null) {
      const from = Date.parse(rule.availableFrom);
      // En otolkbar tid får aldrig öppna en rätt som annars vore stängd.
      // Hellre en rätt som inte går att beställa än en gäst som beställer
      // något köket inte har.
      if (!Number.isFinite(from) || stamp < from) return false;
    }

    if (rule.availableTo !== null) {
      const to = Date.parse(rule.availableTo);
      if (!Number.isFinite(to) || stamp >= to) return false;
    }

    return true;
  };

  if (rules.some(matches)) return { isAvailable: true, reason: null };

  return { isAvailable: false, reason: pickReason(rules, stamp) };
}

/**
 * Skälet från den regel som börjar gälla först.
 *
 * "Slut till fredag" är användbart för gästen; "otillgänglig" är det inte. Den
 * regel som ligger närmast i framtiden är den som snart öppnar rätten igen,
 * och därmed den som bär det mest relevanta beskedet.
 */
function pickReason(rules: readonly AvailabilityRule[], stamp: number): string | null {
  const upcoming = rules
    .filter((rule) => rule.reason !== null && rule.availableFrom !== null)
    .map((rule) => ({ reason: rule.reason, at: Date.parse(rule.availableFrom!) }))
    .filter((entry) => Number.isFinite(entry.at) && entry.at > stamp)
    .sort((a, b) => a.at - b.at);

  return upcoming[0]?.reason ?? rules.find((rule) => rule.reason)?.reason ?? null;
}
