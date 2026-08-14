import { describe, expect, it } from "vitest";
import {
  CLOSED_ALL_WEEK,
  describeDay,
  isOpenAt,
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
        { opens: "22:00", closes: "17:00" },
        "inte ett objekt",
        null,
      ],
    });

    expect(parsed.mon).toEqual([{ opens: "11:00", closes: "14:00" }]);
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

  it("hittar sluttid före starttid", () => {
    const problems = validateOpeningHours(hours({ thu: [{ opens: "22:00", closes: "11:00" }] }));
    expect(problems[0]).toMatchObject({ kind: "CLOSES_BEFORE_OPENS" });
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
});
