import { describe, expect, it } from "vitest";
import { pickMenuForNow, zonedNow, type ScheduledMenu } from "./menu-schedule";
import { COUNTRY_INFO } from "./country";

const SARAJEVO = COUNTRY_INFO.BA.timeZone;

interface Named extends ScheduledMenu {
  name: string;
}

const lunch: Named = {
  name: "Lunch",
  activeDays: [1, 2, 3, 4, 5],
  activeFrom: "11:00",
  activeUntil: "14:00",
};

const kvall: Named = {
  name: "Kväll",
  activeDays: [1, 2, 3, 4, 5, 6, 0],
  activeFrom: "17:00",
  activeUntil: "22:00",
};

const alltid: Named = {
  name: "Ordinarie",
  activeDays: null,
  activeFrom: null,
  activeUntil: null,
};

/** 2026-08-11 är en tisdag. Tiderna anges i bosnisk sommartid (UTC+2). */
const tisdag = (time: string) => new Date(`2026-08-11T${time}:00+02:00`);
/** 2026-08-15 är en lördag. */
const lordag = (time: string) => new Date(`2026-08-15T${time}:00+02:00`);

describe("zonedNow", () => {
  it("ger rätt veckodag och klockslag i restaurangens tidszon", () => {
    expect(zonedNow(tisdag("12:30"), SARAJEVO)).toEqual({ dayIndex: 2, minutes: 12 * 60 + 30 });
  });

  it("räknar om från UTC till sommartid", () => {
    // 10:00 UTC är 12:00 i Sarajevo i augusti.
    expect(zonedNow(new Date("2026-08-11T10:00:00Z"), SARAJEVO).minutes).toBe(12 * 60);
  });

  it("hanterar vintertid", () => {
    // 10:00 UTC är 11:00 i Sarajevo i januari.
    expect(zonedNow(new Date("2026-01-13T10:00:00Z"), SARAJEVO).minutes).toBe(11 * 60);
  });

  it("ger 0 minuter vid midnatt, inte 1440", () => {
    expect(zonedNow(new Date("2026-08-11T00:00:00+02:00"), SARAJEVO).minutes).toBe(0);
  });

  // Poängen med hela omskrivningen: tidszonen är restaurangens, inte kodens.
  // Vid 22:30 UTC på en tisdag är klockan redan 00:30 på onsdagen i Sarajevo —
  // alltså både en annan tid OCH en annan veckodag. Med tidszonen inbakad i
  // koden hade tisdagens lunchmeny fortsatt gälla in på onsdagen.
  it("ger olika veckodag i olika tidszoner för samma ögonblick", () => {
    const stund = new Date("2026-08-11T22:30:00Z");
    expect(zonedNow(stund, "UTC")).toEqual({ dayIndex: 2, minutes: 22 * 60 + 30 });
    expect(zonedNow(stund, "Europe/Sarajevo")).toEqual({ dayIndex: 3, minutes: 30 });
  });

  it("faller inte tillbaka tyst på en veckodag den inte kunde läsa", () => {
    expect(() => zonedNow(new Date(), "Mars/Olympus_Mons")).toThrow();
  });
});

describe("pickMenuForNow", () => {
  it("väljer lunchmenyn mitt i lunchen", () => {
    expect(pickMenuForNow([alltid, lunch, kvall], SARAJEVO, tisdag("12:00"))?.name).toBe("Lunch");
  });

  it("väljer kvällsmenyn på kvällen", () => {
    expect(pickMenuForNow([alltid, lunch, kvall], SARAJEVO, tisdag("19:00"))?.name).toBe("Kväll");
  });

  it("faller tillbaka på den allmänna menyn mellan passen", () => {
    expect(pickMenuForNow([alltid, lunch, kvall], SARAJEVO, tisdag("15:30"))?.name).toBe("Ordinarie");
  });

  it("stänger lunchmenyn exakt på sluttiden", () => {
    // 13:59 är lunch, 14:00 är det inte — activeUntil är exklusiv.
    expect(pickMenuForNow([alltid, lunch], SARAJEVO, tisdag("13:59"))?.name).toBe("Lunch");
    expect(pickMenuForNow([alltid, lunch], SARAJEVO, tisdag("14:00"))?.name).toBe("Ordinarie");
  });

  it("öppnar lunchmenyn exakt på starttiden", () => {
    expect(pickMenuForNow([alltid, lunch], SARAJEVO, tisdag("10:59"))?.name).toBe("Ordinarie");
    expect(pickMenuForNow([alltid, lunch], SARAJEVO, tisdag("11:00"))?.name).toBe("Lunch");
  });

  it("respekterar veckodagar — ingen lunchmeny på lördagen", () => {
    expect(pickMenuForNow([alltid, lunch], SARAJEVO, lordag("12:00"))?.name).toBe("Ordinarie");
  });

  it("returnerar null när ingen meny gäller", () => {
    expect(pickMenuForNow([lunch], SARAJEVO, tisdag("22:00"))).toBeNull();
    expect(pickMenuForNow([], SARAJEVO, tisdag("12:00"))).toBeNull();
  });

  it("behandlar tom lista av veckodagar som alla dagar", () => {
    const alla: Named = { name: "Alla", activeDays: [], activeFrom: null, activeUntil: null };
    expect(pickMenuForNow([alla], SARAJEVO, lordag("03:00"))?.name).toBe("Alla");
  });

  it("låter en tidsatt meny vinna oavsett ordning i listan", () => {
    expect(pickMenuForNow([lunch, alltid], SARAJEVO, tisdag("12:00"))?.name).toBe("Lunch");
    expect(pickMenuForNow([alltid, lunch], SARAJEVO, tisdag("12:00"))?.name).toBe("Lunch");
  });
});
