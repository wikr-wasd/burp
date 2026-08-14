import { isOpenAt, type OpeningHours } from "./opening-hours";

/**
 * Schemalagda beställningar (avsnitt 5.3).
 *
 * Gästen väljer en hämttid. Ordern hålls undan från köksskärmen tills
 * `prepTimeMinutes` innan den tiden — annars börjar köket laga en lunch som
 * ska hämtas klockan 18.
 *
 * Ingen bakgrundsjobb behövs för det. Köksskärmens fråga filtrerar på tiden,
 * vilket betyder att en order "släpps" av att klockan går, inte av att ett
 * jobb hinner köra. Ett jobb som inte kört är annars ett jobb som tappat en
 * order — och den sortens fel upptäcks av en hungrig gäst, inte av ett larm.
 */

/** Tider erbjuds i jämna kvartar. Minutprecision är falsk precision i ett kök. */
export const SLOT_MINUTES = 15;

/**
 * Tidigast möjliga hämttid.
 *
 * Tillagningstiden plus lite marginal. Att erbjuda en tid som redan passerat
 * när gästen trycker Beställ vore att lova något som inte går att hålla.
 */
export function earliestPickup(prepTimeMinutes: number, now: Date): Date {
  const earliest = new Date(now.getTime() + prepTimeMinutes * 60_000);
  return ceilToSlot(earliest);
}

/** Avrundar uppåt till nästa kvart. */
export function ceilToSlot(date: Date): Date {
  const result = new Date(date);
  result.setSeconds(0, 0);

  const remainder = result.getMinutes() % SLOT_MINUTES;
  if (remainder !== 0) {
    result.setMinutes(result.getMinutes() + (SLOT_MINUTES - remainder));
  }
  return result;
}

export interface SlotOptions {
  openingHours: OpeningHours;
  prepTimeMinutes: number;
  now: Date;
  /** Hur långt fram tider erbjuds. Standard: resten av dagen. */
  horizonHours?: number;
}

/**
 * Tider gästen kan välja mellan.
 *
 * Bara tider när restaurangen faktiskt är öppen. En förbeställning till en
 * stängd timme är en order ingen kommer att laga.
 */
export function availableSlots(options: SlotOptions): Date[] {
  const { openingHours, prepTimeMinutes, now } = options;
  const horizonHours = options.horizonHours ?? 12;

  const first = earliestPickup(prepTimeMinutes, now);
  const last = new Date(now.getTime() + horizonHours * 60 * 60_000);

  const slots: Date[] = [];

  for (
    let candidate = new Date(first);
    candidate <= last;
    candidate = new Date(candidate.getTime() + SLOT_MINUTES * 60_000)
  ) {
    const minutes = candidate.getHours() * 60 + candidate.getMinutes();
    // getDay() ger 0 = söndag, samma numrering som isOpenAt förväntar sig.
    if (isOpenAt(openingHours, candidate.getDay(), minutes)) {
      slots.push(new Date(candidate));
    }
  }

  return slots;
}

/**
 * Ska ordern synas för köket nu?
 *
 * En order utan hämttid ska lagas direkt. En med hämttid ska synas när det är
 * `prepTimeMinutes` kvar — inte tidigare, och absolut inte senare.
 */
export function isDueForKitchen(
  scheduledFor: Date | null,
  prepTimeMinutes: number,
  now: Date = new Date(),
): boolean {
  if (scheduledFor === null) return true;
  return now.getTime() >= scheduledFor.getTime() - prepTimeMinutes * 60_000;
}

/**
 * Kontrollerar en hämttid som kommit in från en klient.
 *
 * Klienten föreslår, servern avgör. Kontrollerna är avsiktligt fler än
 * gränssnittet behöver: en gäst som anropar API:t direkt ska mötas av samma
 * regler som en som klickar.
 */
export type ScheduleProblem =
  | "TOO_SOON"
  | "TOO_FAR"
  | "CLOSED"
  | "NOT_A_SLOT";

export function validateScheduledFor(
  scheduledFor: Date,
  options: SlotOptions,
): ScheduleProblem | null {
  const { openingHours, prepTimeMinutes, now } = options;
  const horizonHours = options.horizonHours ?? 12;

  if (scheduledFor.getTime() < earliestPickup(prepTimeMinutes, now).getTime()) {
    return "TOO_SOON";
  }

  if (scheduledFor.getTime() > now.getTime() + horizonHours * 60 * 60_000) {
    return "TOO_FAR";
  }

  if (scheduledFor.getMinutes() % SLOT_MINUTES !== 0 || scheduledFor.getSeconds() !== 0) {
    return "NOT_A_SLOT";
  }

  const minutes = scheduledFor.getHours() * 60 + scheduledFor.getMinutes();
  if (!isOpenAt(openingHours, scheduledFor.getDay(), minutes)) {
    return "CLOSED";
  }

  return null;
}

export const SCHEDULE_PROBLEM_MESSAGES: Record<ScheduleProblem, string> = {
  TOO_SOON: "Den tiden är för tidig — köket hinner inte.",
  TOO_FAR: "Vi tar bara emot förbeställningar för det närmaste dygnet.",
  CLOSED: "Restaurangen är stängd vid den tiden.",
  NOT_A_SLOT: "Välj en tid i listan.",
};

/** "18:30" — hämttiden som gästen ser den. */
export function formatSlot(slot: Date): string {
  const hours = String(slot.getHours()).padStart(2, "0");
  const minutes = String(slot.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
