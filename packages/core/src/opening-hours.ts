/**
 * Öppettider (avsnitt 3).
 *
 * Lagras som JSONB i `restaurants.opening_hours` med veckodagen som nyckel och
 * en lista pass som värde:
 *
 *   { "mon": [{"opens": "11:00", "closes": "14:00"},
 *             {"opens": "17:00", "closes": "22:00"}] }
 *
 * Flera pass per dag är regel snarare än undantag — lunch och kväll med stängt
 * emellan är hur de flesta restauranger faktiskt fungerar.
 *
 * Formatet läses av `is_restaurant_open()` i databasen (migration 0004). Den
 * här filen är den enda platsen där formatet får tolkas eller byggas i
 * TypeScript, så att gränssnittet aldrig skriver något funktionen inte förstår.
 */

/** Nycklarna i JSONB-objektet. Ordningen är veckans, inte Postgres dow-numrering. */
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Måndag",
  tue: "Tisdag",
  wed: "Onsdag",
  thu: "Torsdag",
  fri: "Fredag",
  sat: "Lördag",
  sun: "Söndag",
};

export interface OpeningSlot {
  /** "11:00" — timmar och minuter, alltid två siffror. */
  opens: string;
  /** "14:00". Exklusiv: 14:00 räknas som stängt. */
  closes: string;
}

export type OpeningHours = Record<WeekdayKey, OpeningSlot[]>;

export const CLOSED_ALL_WEEK: OpeningHours = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** "11:00" → 660. Antal minuter sedan midnatt. */
export function timeToMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/**
 * Läser öppettider ur databasen och normaliserar dem.
 *
 * Trasiga eller okända värden tas bort i stället för att kasta. En felskriven
 * rad i JSONB ska göra restaurangen stängd den dagen, inte krascha varje
 * sidladdning för hela plattformen.
 */
export function parseOpeningHours(raw: unknown): OpeningHours {
  const result: OpeningHours = { ...CLOSED_ALL_WEEK };
  if (raw === null || typeof raw !== "object") return result;

  const input = raw as Record<string, unknown>;

  for (const day of WEEKDAY_KEYS) {
    const value = input[day];
    if (!Array.isArray(value)) continue;

    result[day] = value
      .filter((slot): slot is Record<string, unknown> => slot !== null && typeof slot === "object")
      .map((slot) => ({ opens: String(slot["opens"] ?? ""), closes: String(slot["closes"] ?? "") }))
      .filter((slot) => isValidTime(slot.opens) && isValidTime(slot.closes))
      // Ett pass som slutar innan det börjar är alltid ett misstag, och
      // is_restaurant_open() skulle aldrig matcha det ändå.
      .filter((slot) => timeToMinutes(slot.opens) < timeToMinutes(slot.closes))
      .sort((a, b) => timeToMinutes(a.opens) - timeToMinutes(b.opens));
  }

  return result;
}

export type OpeningHoursProblem =
  | { day: WeekdayKey; kind: "INVALID_TIME"; slot: number }
  | { day: WeekdayKey; kind: "CLOSES_BEFORE_OPENS"; slot: number }
  | { day: WeekdayKey; kind: "OVERLAP"; slot: number };

/**
 * Kontrollerar öppettider innan de sparas.
 *
 * Överlappande pass är det fel som är lättast att göra och svårast att se:
 * 11–15 och 14–22 ser rimligt ut i ett formulär, men beskriver samma timme
 * två gånger. `is_restaurant_open()` skulle svara rätt ändå, men
 * omsättningsstatistik per pass och kommande schemaläggning skulle inte.
 */
export function validateOpeningHours(hours: OpeningHours): OpeningHoursProblem[] {
  const problems: OpeningHoursProblem[] = [];

  for (const day of WEEKDAY_KEYS) {
    const slots = hours[day];

    slots.forEach((slot, index) => {
      if (!isValidTime(slot.opens) || !isValidTime(slot.closes)) {
        problems.push({ day, kind: "INVALID_TIME", slot: index });
        return;
      }
      if (timeToMinutes(slot.opens) >= timeToMinutes(slot.closes)) {
        problems.push({ day, kind: "CLOSES_BEFORE_OPENS", slot: index });
      }
    });

    const sorted = [...slots]
      .map((slot, index) => ({ ...slot, index }))
      .filter((slot) => isValidTime(slot.opens) && isValidTime(slot.closes))
      .sort((a, b) => timeToMinutes(a.opens) - timeToMinutes(b.opens));

    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      if (timeToMinutes(current.opens) < timeToMinutes(previous.closes)) {
        problems.push({ day, kind: "OVERLAP", slot: current.index });
      }
    }
  }

  return problems;
}

/** Läsbar sammanfattning av en dag: "11:00–14:00, 17:00–22:00" eller "Stängt". */
export function describeDay(slots: readonly OpeningSlot[]): string {
  if (slots.length === 0) return "Stängt";
  return slots.map((slot) => `${slot.opens}–${slot.closes}`).join(", ");
}

/**
 * Är restaurangen öppen vid en given lokal tidpunkt?
 *
 * Speglar `is_restaurant_open()` i databasen. Används för att visa öppet eller
 * stängt i gränssnittet — beslutet om en order får läggas fattas alltid på
 * servern, eftersom klientens klocka inte går att lita på.
 *
 * Pass över midnatt stöds inte, precis som i databasfunktionen.
 */
export function isOpenAt(hours: OpeningHours, dayIndex: number, minutes: number): boolean {
  // dayIndex följer Postgres dow: 0 = söndag. WEEKDAY_KEYS börjar på måndag.
  const key = WEEKDAY_KEYS[(dayIndex + 6) % 7];
  if (!key) return false;

  return hours[key].some(
    (slot) => timeToMinutes(slot.opens) <= minutes && timeToMinutes(slot.closes) > minutes,
  );
}
