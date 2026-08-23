import { describe, expect, it } from "vitest";
import {
  CLOSED_ALL_WEEK,
  daySlots,
  describeDay,
  isOpenAt,
  nextOpening,
  parseOpeningHours,
  timeToMinutes,
  validateOpeningHours,
  type OpeningHours,
} from "./opening-hours";

function hours(overrides: Partial<OpeningHours> = {}): OpeningHours {
  return { ...CLOSED_ALL_WEEK, ...overrides };
}

describe("parseOpeningHours", () => {
  it("läser lunch och kväll som två pass", () => {
    const parsed = parseOpeningHours({
      mon: [
        { opens: "11:00", closes: "14:00" },
        { opens: "17:00", closes: "22:00" },
      ],
    });

    expect(parsed.mon).toHaveLength(2);
    expect(parsed.tue).toHaveLength(0);
  });

  it("sorterar passen i tidsordning", () => {
    const parsed = parseOpeningHours({
      fri: [
        { opens: "17:00", closes: "22:00" },
        { opens: "11:00", closes: "14:00" },
      ],
    });

    expect(parsed.fri[0]!.opens).toBe("11:00");
  });

  /**
   * En felskriven rad i JSONB ska göra restaurangen stängd den dagen, inte
   * krascha varje sidladdning för hela plattformen.
   */
  it("kastar bort trasiga pass i stället för att kasta", () => {
    const parsed = parseOpeningHours({
      mon: [
        { opens: "25:00", closes: "26:00" },
        { opens: "11:00", closes: "14:00" },
        // Noll minuter långt — eller ett dygn, och det går inte att veta vilket.
        { opens: "18:00", closes: "18:00" },
        "inte ett objekt",
        null,
      ],
    });

    expect(parsed.mon).toEqual([{ opens: "11:00", closes: "14:00" }]);
  });

  it("behåller pass som går över midnatt", () => {
    // Tiderna ser omvända ut men är avsiktliga: en kafana som stänger klockan
    // två. Tidigare filtrerades de här bort som trasiga.
    const parsed = parseOpeningHours({
      fri: [{ opens: "22:00", closes: "02:00" }],
    });

    expect(parsed.fri).toEqual([{ opens: "22:00", closes: "02:00" }]);
  });

  it("hanterar null, fel typ och okända veckodagar", () => {
    expect(parseOpeningHours(null)).toEqual(CLOSED_ALL_WEEK);
    expect(parseOpeningHours("stängt")).toEqual(CLOSED_ALL_WEEK);
    expect(parseOpeningHours({ blursdag: [{ opens: "11:00", closes: "14:00" }] })).toEqual(
      CLOSED_ALL_WEEK,
    );
  });
});

describe("validateOpeningHours", () => {
  it("godkänner lunch och kväll med stängt emellan", () => {
    const problems = validateOpeningHours(
      hours({
        mon: [
          { opens: "11:00", closes: "14:00" },
          { opens: "17:00", closes: "22:00" },
        ],
      }),
    );
    expect(problems).toHaveLength(0);
  });

  /**
   * 11–15 och 14–22 ser rimligt ut i ett formulär men beskriver samma timme
   * två gånger. Det är felet som är lättast att göra och svårast att se.
   */
  it("hittar överlappande pass", () => {
    const problems = validateOpeningHours(
      hours({
        tue: [
          { opens: "11:00", closes: "15:00" },
          { opens: "14:00", closes: "22:00" },
        ],
      }),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ day: "tue", kind: "OVERLAP" });
  });

  it("hittar överlapp även när passen skrivits i omvänd ordning", () => {
    const problems = validateOpeningHours(
      hours({
        tue: [
          { opens: "14:00", closes: "22:00" },
          { opens: "11:00", closes: "15:00" },
        ],
      }),
    );
    expect(problems.some((problem) => problem.kind === "OVERLAP")).toBe(true);
  });

  it("accepterar pass som möts exakt", () => {
    // 11–14 och 14–22 överlappar inte: closes är exklusiv.
    const problems = validateOpeningHours(
      hours({
        wed: [
          { opens: "11:00", closes: "14:00" },
          { opens: "14:00", closes: "22:00" },
        ],
      }),
    );
    expect(problems).toHaveLength(0);
  });

  it("godkänner ett pass över midnatt", () => {
    const problems = validateOpeningHours(hours({ thu: [{ opens: "22:00", closes: "02:00" }] }));
    expect(problems).toHaveLength(0);
  });

  it("hittar ett pass som är noll minuter långt", () => {
    const problems = validateOpeningHours(hours({ thu: [{ opens: "18:00", closes: "18:00" }] }));
    expect(problems[0]).toMatchObject({ kind: "ZERO_LENGTH" });
  });

  /**
   * Fredag 22:00–03:00 och lördag 01:00–05:00 ligger i olika dagsnycklar men
   * beskriver samma timmar. En kontroll som bara jämför inom en dag ser det
   * inte, och restaurangen tror att den har två pass när den har ett.
   */
  it("hittar överlapp över dygnsgränsen", () => {
    const problems = validateOpeningHours(
      hours({
        fri: [{ opens: "22:00", closes: "03:00" }],
        sat: [{ opens: "01:00", closes: "05:00" }],
      }),
    );

    expect(problems.some((problem) => problem.kind === "OVERLAP")).toBe(true);
  });

  it("hittar överlapp när söndagsnatten viker in i måndagen", () => {
    const problems = validateOpeningHours(
      hours({
        sun: [{ opens: "22:00", closes: "04:00" }],
        mon: [{ opens: "02:00", closes: "06:00" }],
      }),
    );

    expect(problems.some((problem) => problem.kind === "OVERLAP")).toBe(true);
  });

  it("godkänner ett nattpass som slutar innan nästa dag öppnar", () => {
    const problems = validateOpeningHours(
      hours({
        fri: [{ opens: "22:00", closes: "02:00" }],
        sat: [{ opens: "11:00", closes: "14:00" }],
      }),
    );

    expect(problems).toHaveLength(0);
  });

  it("hittar ogiltiga klockslag", () => {
    const problems = validateOpeningHours(hours({ fri: [{ opens: "9:00", closes: "17:00" }] }));
    expect(problems[0]).toMatchObject({ kind: "INVALID_TIME" });
  });

  it("godkänner en helt stängd vecka", () => {
    expect(validateOpeningHours(CLOSED_ALL_WEEK)).toHaveLength(0);
  });
});

describe("isOpenAt", () => {
  const week = hours({
    // dayIndex följer Postgres dow: 0 = söndag, 1 = måndag, 2 = tisdag.
    tue: [
      { opens: "11:00", closes: "14:00" },
      { opens: "17:00", closes: "22:00" },
    ],
  });

  it("är öppen mitt i lunchen", () => {
    expect(isOpenAt(week, 2, timeToMinutes("12:00"))).toBe(true);
  });

  it("är stängd mellan passen", () => {
    expect(isOpenAt(week, 2, timeToMinutes("15:30"))).toBe(false);
  });

  it("öppnar exakt på starttiden och stänger exakt på sluttiden", () => {
    expect(isOpenAt(week, 2, timeToMinutes("11:00"))).toBe(true);
    expect(isOpenAt(week, 2, timeToMinutes("10:59"))).toBe(false);
    expect(isOpenAt(week, 2, timeToMinutes("13:59"))).toBe(true);
    expect(isOpenAt(week, 2, timeToMinutes("14:00"))).toBe(false);
  });

  it("är stängd på en dag utan pass", () => {
    expect(isOpenAt(week, 1, timeToMinutes("12:00"))).toBe(false);
  });

  it("mappar söndag rätt", () => {
    const sunday = hours({ sun: [{ opens: "12:00", closes: "20:00" }] });
    expect(isOpenAt(sunday, 0, timeToMinutes("13:00"))).toBe(true);
    expect(isOpenAt(sunday, 1, timeToMinutes("13:00"))).toBe(false);
  });

  describe("pass över midnatt", () => {
    // Fredag 22:00 till lördag 02:00. dayIndex: 5 = fredag, 6 = lördag.
    const kafana = hours({ fri: [{ opens: "22:00", closes: "02:00" }] });

    it("är öppen sent på fredagskvällen", () => {
      expect(isOpenAt(kafana, 5, timeToMinutes("23:30"))).toBe(true);
    });

    it("är öppen efter midnatt, alltså på lördagen", () => {
      // Det här är hela poängen. Passet ligger under fredagens nyckel men
      // timmarna hör till lördagen, och utan gårdagskontrollen är kafanan
      // stängd i egna ögon under precis de timmar den har flest gäster.
      expect(isOpenAt(kafana, 6, timeToMinutes("01:00"))).toBe(true);
    });

    it("stänger exakt på sluttiden", () => {
      expect(isOpenAt(kafana, 6, timeToMinutes("01:59"))).toBe(true);
      expect(isOpenAt(kafana, 6, timeToMinutes("02:00"))).toBe(false);
    });

    it("är inte öppen tidigare på fredagen", () => {
      expect(isOpenAt(kafana, 5, timeToMinutes("21:59"))).toBe(false);
    });

    it("smetar inte ut sig till andra dagar", () => {
      // Söndag natt: fredagens pass hör inte hit.
      expect(isOpenAt(kafana, 0, timeToMinutes("01:00"))).toBe(false);
    });

    it("viker runt från söndag till måndag", () => {
      const sundayNight = hours({ sun: [{ opens: "20:00", closes: "01:00" }] });
      // dayIndex 1 = måndag.
      expect(isOpenAt(sundayNight, 1, timeToMinutes("00:30"))).toBe(true);
      expect(isOpenAt(sundayNight, 1, timeToMinutes("01:00"))).toBe(false);
    });

    it("ett pass som slutar 00:00 räknas som över midnatt och stänger där", () => {
      const untilMidnight = hours({ tue: [{ opens: "18:00", closes: "00:00" }] });
      expect(isOpenAt(untilMidnight, 2, timeToMinutes("23:59"))).toBe(true);
      // dayIndex 3 = onsdag, klockan noll.
      expect(isOpenAt(untilMidnight, 3, timeToMinutes("00:00"))).toBe(false);
    });
  });
});

describe("describeDay", () => {
  it("beskriver flera pass", () => {
    expect(
      describeDay([
        { opens: "11:00", closes: "14:00" },
        { opens: "17:00", closes: "22:00" },
      ]),
    ).toBe("11:00–14:00, 17:00–22:00");
  });

  it("säger Stängt när dagen är tom", () => {
    expect(describeDay([])).toBe("Stängt");
  });

  it("märker ut ett pass över midnatt", () => {
    // "22:00–02:00" ensamt läser som ett fel — det ser ut som att någon skrivit
    // tiderna i fel ordning.
    expect(describeDay([{ opens: "22:00", closes: "02:00" }])).toBe("22:00–02:00 (nästa dag)");
  });
});

/**
 * `dayIndex` följer Postgres `dow`: 0 är söndag, 1 måndag, 6 lördag. Samma
 * räkning som `isOpenAt`, och testerna nedan skriver ut vilken dag varje siffra
 * är — en tyst av-med-ett här ger ett svar som stämmer sex dagar i veckan.
 */
describe("nextOpening", () => {
  const veckan = hours({
    mon: [{ opens: "08:00", closes: "22:00" }],
    tue: [{ opens: "08:00", closes: "22:00" }],
    wed: [{ opens: "08:00", closes: "22:00" }],
    thu: [{ opens: "08:00", closes: "22:00" }],
    fri: [{ opens: "08:00", closes: "23:00" }],
    sat: [{ opens: "09:00", closes: "23:00" }],
    sun: [],
  });

  it("pekar på dagens öppning när klockan ännu inte är där", () => {
    // Måndag (dow 1) klockan 07:00. Öppnar 08:00 samma dag.
    expect(nextOpening(veckan, 1, timeToMinutes("07:00"))).toEqual({
      daysAhead: 0,
      day: "mon",
      opens: "08:00",
    });
  });

  it("hoppar till nästa dag när dagens öppning passerat", () => {
    // Måndag 23:00 — efter stängning. Nästa är tisdag 08:00.
    expect(nextOpening(veckan, 1, timeToMinutes("23:00"))).toEqual({
      daysAhead: 1,
      day: "tue",
      opens: "08:00",
    });
  });

  it("hoppar över en stängd dag", () => {
    // Lördag (dow 6) efter stängning. Söndagen är tom, så nästa är måndag.
    expect(nextOpening(veckan, 6, timeToMinutes("23:30"))).toEqual({
      daysAhead: 2,
      day: "mon",
      opens: "08:00",
    });
  });

  it("hittar dagens andra pass", () => {
    // Delat dygn: lunch och kväll. Klockan 15:00 är kvällen nästa, inte
    // morgondagens lunch.
    const delat = hours({
      wed: [
        { opens: "17:00", closes: "22:00" },
        { opens: "11:00", closes: "14:00" },
      ],
    });

    // Onsdag är dow 3.
    expect(nextOpening(delat, 3, timeToMinutes("15:00"))).toEqual({
      daysAhead: 0,
      day: "wed",
      opens: "17:00",
    });
  });

  it("väljer det tidigaste passet oavsett inmatningsordning", () => {
    // Passen står i fel ordning i objektet. Gästen väntar på det tidigaste.
    const delat = hours({
      wed: [
        { opens: "17:00", closes: "22:00" },
        { opens: "11:00", closes: "14:00" },
      ],
    });

    expect(nextOpening(delat, 3, timeToMinutes("06:00"))).toEqual({
      daysAhead: 0,
      day: "wed",
      opens: "11:00",
    });
  });

  it("ger null när stället har stängt hela veckan", () => {
    // Ingen dag att lova. Sidan måste då säga något annat än ett klockslag.
    expect(nextOpening(CLOSED_ALL_WEEK, 3, 0)).toBeNull();
  });

  it("räknar aldrig mer än sex dagar framåt", () => {
    // Bara söndag öppet, och det är söndag kväll: nästa är om sju dagar, vilket
    // ligger utanför fönstret. Att svara "om 0 dagar" vore värre än att inte
    // svara — gästen hade väntat vid ett stängt bord.
    const baraSondag = hours({ sun: [{ opens: "12:00", closes: "16:00" }] });
    expect(nextOpening(baraSondag, 0, timeToMinutes("20:00"))).toBeNull();
  });
});

describe("en vecka utan alla dagar", () => {
  /*
   * Kolumnen är JSON, och en restaurang som håller stängt på måndagar skriver
   * ingen `mon`-nyckel. Seeden gör det redan: tre av sju restauranger har
   * färre än sju dagar, och Konoba Fjaka saknar både måndag och söndag.
   *
   * Typen sa ändå `Record<WeekdayKey, OpeningSlot[]>` fram till 2026-08-24,
   * alltså att varje dag alltid finns. TypeScript varnade därför aldrig, och
   * fyra funktioner gjorde `hours[day].map(...)` rakt av. Resultatet var
   * "Cannot read properties of undefined" — på QR-sidan en 500:a för en gäst
   * som står vid bordet.
   */
  const FJAKA: OpeningHours = {
    tue: [{ opens: "12:00", closes: "23:00" }],
    wed: [{ opens: "12:00", closes: "23:00" }],
    thu: [{ opens: "12:00", closes: "23:00" }],
    fri: [{ opens: "12:00", closes: "00:00" }],
    sat: [{ opens: "12:00", closes: "00:00" }],
  };

  // dayIndex följer Postgres dow: 1 = måndag, den dag som saknas.
  it("nextOpening kraschar inte på en dag som saknas", () => {
    const next = nextOpening(FJAKA, 1, 92);
    expect(next).not.toBeNull();
    expect(next?.day).toBe("tue");
    expect(next?.daysAhead).toBe(1);
  });

  it("isOpenAt svarar stängt i stället för att kasta", () => {
    expect(isOpenAt(FJAKA, 1, 92)).toBe(false);
    // Tisdag 13:00 — dagen finns, och då ska svaret vara öppet.
    expect(isOpenAt(FJAKA, 2, 13 * 60)).toBe(true);
  });

  it("validateOpeningHours godkänner en vecka med luckor", () => {
    expect(validateOpeningHours(FJAKA)).toEqual([]);
  });

  it("daySlots ger en tom lista för dagen som saknas", () => {
    expect(daySlots(FJAKA, "mon")).toEqual([]);
    expect(daySlots(FJAKA, "tue")).toHaveLength(1);
  });

  // Ett helt tomt objekt är vad en restaurang har innan ägaren fyllt i något.
  it("ett tomt schema är stängt hela veckan, inte en krasch", () => {
    expect(isOpenAt({}, 1, 600)).toBe(false);
    expect(nextOpening({}, 1, 600)).toBeNull();
    expect(validateOpeningHours({})).toEqual([]);
  });
});
