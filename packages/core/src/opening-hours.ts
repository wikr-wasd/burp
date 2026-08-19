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
  /**
   * "14:00". Exklusiv: 14:00 räknas som stängt.
   *
   * Ligger tiden FÖRE `opens` går passet över midnatt och slutar dagen efter:
   * `{"opens": "22:00", "closes": "02:00"}` betyder tio på kvällen till två på
   * natten. En kafana i Sarajevo eller Beograd stänger sällan före midnatt, och
   * utan det här går det inte att beskriva deras faktiska öppettider.
   *
   * `"18:00"–"00:00"` fungerar och betyder till midnatt.
   */
  closes: string;
}

/** Går passet över midnatt? Slutet ligger då på nästa dygn. */
export function crossesMidnight(slot: OpeningSlot): boolean {
  return timeToMinutes(slot.closes) < timeToMinutes(slot.opens);
}

/** Passets längd i minuter, även när det går över midnatt. */
export function slotDuration(slot: OpeningSlot): number {
  const opens = timeToMinutes(slot.opens);
  const closes = timeToMinutes(slot.closes);
  return closes > opens ? closes - opens : MINUTES_PER_DAY - opens + closes;
}

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

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
      // Ett pass som börjar och slutar på samma klockslag är noll minuter långt
      // — eller ett dygn, och det går inte att veta vilket. Det tas bort.
      // Ett pass som SLUTAR före det börjar är däremot giltigt: det går över
      // midnatt.
      .filter((slot) => slot.opens !== slot.closes)
      .sort((a, b) => timeToMinutes(a.opens) - timeToMinutes(b.opens));
  }

  return result;
}

export type OpeningHoursProblem =
  | { day: WeekdayKey; kind: "INVALID_TIME"; slot: number }
  | { day: WeekdayKey; kind: "ZERO_LENGTH"; slot: number }
  | { day: WeekdayKey; kind: "OVERLAP"; slot: number };

/**
 * Kontrollerar öppettider innan de sparas.
 *
 * Överlappande pass är det fel som är lättast att göra och svårast att se:
 * 11–15 och 14–22 ser rimligt ut i ett formulär, men beskriver samma timme
 * två gånger. `is_restaurant_open()` skulle svara rätt ändå, men
 * omsättningsstatistik per pass och kommande schemaläggning skulle inte.
 *
 * Sedan pass över midnatt stöds räcker det inte att jämföra inom en dag.
 * Fredag 22:00–03:00 och lördag 01:00–05:00 ligger i olika dagsnycklar men
 * beskriver samma timmar — och söndagens nattpass krockar med måndag morgon.
 * Kontrollen görs därför på en veckolång tidslinje som viker runt.
 */
export function validateOpeningHours(hours: OpeningHours): OpeningHoursProblem[] {
  const problems: OpeningHoursProblem[] = [];

  interface WeeklySpan {
    day: WeekdayKey;
    index: number;
    start: number;
    end: number;
  }

  const spans: WeeklySpan[] = [];

  WEEKDAY_KEYS.forEach((day, dayIndex) => {
    hours[day].forEach((slot, index) => {
      if (!isValidTime(slot.opens) || !isValidTime(slot.closes)) {
        problems.push({ day, kind: "INVALID_TIME", slot: index });
        return;
      }

      if (slot.opens === slot.closes) {
        problems.push({ day, kind: "ZERO_LENGTH", slot: index });
        return;
      }

      const start = dayIndex * MINUTES_PER_DAY + timeToMinutes(slot.opens);
      spans.push({ day, index, start, end: start + slotDuration(slot) });
    });
  });

  // Sorterade efter när de börjar i veckan, så att felet rapporteras på det
  // senare passet — det är det som lades till av misstag.
  spans.sort((a, b) => a.start - b.start);

  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const first = spans[i]!;
      const second = spans[j]!;

      // Veckan viker runt: söndagens nattpass fortsätter in i måndagen, som
      // ligger i början av tidslinjen och inte i slutet.
      const collides =
        overlaps(first, second) ||
        overlaps(first, shift(second, MINUTES_PER_WEEK)) ||
        overlaps(first, shift(second, -MINUTES_PER_WEEK));

      if (collides) {
        problems.push({ day: second.day, kind: "OVERLAP", slot: second.index });
      }
    }
  }

  return problems;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function shift(span: { start: number; end: number }, by: number) {
  return { start: span.start + by, end: span.end + by };
}

/**
 * Läsbar sammanfattning av en dag: "11:00–14:00, 17:00–22:00" eller "Stängt".
 *
 * Ett pass över midnatt märks ut. "22:00–02:00" ensamt läser som ett fel —
 * det ser ut som att någon skrivit tiderna i fel ordning.
 */
export function describeDay(slots: readonly OpeningSlot[]): string {
  if (slots.length === 0) return "Stängt";

  return slots
    .map((slot) =>
      crossesMidnight(slot)
        ? `${slot.opens}–${slot.closes} (nästa dag)`
        : `${slot.opens}–${slot.closes}`,
    )
    .join(", ");
}

/**
 * Är restaurangen öppen vid en given lokal tidpunkt?
 *
 * Speglar `is_restaurant_open()` i databasen. Används för att visa öppet eller
 * stängt i gränssnittet — beslutet om en order får läggas fattas alltid på
 * servern, eftersom klientens klocka inte går att lita på.
 *
 * **Gårdagen måste vägas in.** Ett pass som börjar 22:00 och slutar 02:00 hör
 * till gårdagens nyckel när klockan är ett på natten. Utan den kontrollen är en
 * kafana stängd i egna ögon under precis de timmar den har flest gäster.
 */
export function isOpenAt(hours: OpeningHours, dayIndex: number, minutes: number): boolean {
  // dayIndex följer Postgres dow: 0 = söndag. WEEKDAY_KEYS börjar på måndag.
  const today = WEEKDAY_KEYS[(dayIndex + 6) % 7];
  const yesterday = WEEKDAY_KEYS[(dayIndex + 5) % 7];
  if (!today || !yesterday) return false;

  const openToday = hours[today].some((slot) => {
    const opens = timeToMinutes(slot.opens);
    const closes = timeToMinutes(slot.closes);

    return crossesMidnight(slot)
      ? minutes >= opens // Resten av passet ligger på morgondagen.
      : minutes >= opens && minutes < closes;
  });

  if (openToday) return true;

  return hours[yesterday].some(
    (slot) => crossesMidnight(slot) && minutes < timeToMinutes(slot.closes),
  );
}
