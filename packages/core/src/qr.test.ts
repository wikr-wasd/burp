import { describe, expect, it } from "vitest";
import {
  generatePublicId,
  generateTableToken,
  parseToken,
  PUBLIC_ID_KEYSPACE,
  PUBLIC_ID_LENGTH,
  tableQrUrl,
  TOKEN_LENGTH,
  verifyTableToken,
} from "./qr";

const SECRET = "test-secret-som-aldrig-anvands-i-produktion";

describe("generatePublicId", () => {
  it("ger rätt längd och bara tecken ur alfabetet", () => {
    for (let i = 0; i < 200; i++) {
      const id = generatePublicId();
      expect(id).toHaveLength(PUBLIC_ID_LENGTH);
      expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    }
  });

  it("undviker tecken som förväxlas när koden läses upp i telefon", () => {
    const ids = Array.from({ length: 500 }, generatePublicId).join("");
    for (const forbidden of ["I", "L", "O", "U"]) {
      expect(ids).not.toContain(forbidden);
    }
  });

  /**
   * Testet drog tidigare 5000 id och krävde noll kollisioner.
   *
   * Med sex tecken ur ett alfabet på 32 är nyckelrymden 32^6 ≈ 1,07 miljarder.
   * Födelsedagsparadoxen ger då 5000²/(2·1,07e9) ≈ **1,16 %** risk att minst
   * två av dem sammanfaller. Testet föll alltså ungefär var åttiofemte körning
   * — inte för att generatorn var trasig utan för att kravet var fel ställt.
   *
   * En flaxig testrad är värre än ingen: den lär teamet att köra om i stället
   * för att läsa. Urvalet är därför litet nog att risken är försumbar
   * (500²/(2·1,07e9) ≈ 1 på 8500), och skalfrågan prövas separat nedan.
   */
  it("ger unika id över ett litet urval", () => {
    const ids = new Set(Array.from({ length: 500 }, generatePublicId));
    expect(ids.size).toBe(500);
  });

  /**
   * Nyckelrymden räcker inte för hur många som helst, och det är avsiktligt.
   *
   * Sex tecken valdes för att koden ska gå att läsa upp i telefon och skrivas
   * av för hand från en dekal. Priset är att kollisioner blir SANNOLIKA i
   * skala: vid 100 000 bord är risken att minst två sammanfaller över 99 %.
   *
   * Det är därför `tables.qr_public_id` har ett unikt index och varför
   * `createTable` provar om vid felkod 23505. Sänks längden ytterligare, eller
   * tas återförsöket bort, går det sönder — den här raden finns för att göra
   * kopplingen svår att missa.
   */
  it("har en nyckelrymd som kräver återförsök vid insert", () => {
    expect(PUBLIC_ID_KEYSPACE).toBe(32 ** 6);

    const collisionRisk = (tables: number) =>
      1 - Math.exp((-tables * tables) / (2 * PUBLIC_ID_KEYSPACE));

    // Enstaka restaurang: försumbart. Hela plattformen: nästan säkert.
    expect(collisionRisk(100)).toBeLessThan(0.00001);
    expect(collisionRisk(100_000)).toBeGreaterThan(0.99);
  });
});

describe("generateTableToken / verifyTableToken", () => {
  it("skapar ett token som verifierar mot sin egen nyckel", async () => {
    const token = await generateTableToken(SECRET);
    expect(token).toHaveLength(TOKEN_LENGTH);
    expect(await verifyTableToken(token, SECRET)).toBe(token.slice(0, PUBLIC_ID_LENGTH));
  });

  it("avvisar ett token signerat med en annan nyckel", async () => {
    const token = await generateTableToken(SECRET);
    expect(await verifyTableToken(token, "en-helt-annan-nyckel")).toBeNull();
  });

  it("avvisar ett påhittat token utan att röra databasen", async () => {
    expect(await verifyTableToken("AAAAAAAAAA", SECRET)).toBeNull();
    expect(await verifyTableToken("R7K2M9ZZZZ", SECRET)).toBeNull();
  });

  it("avvisar fel längd och otillåtna tecken", async () => {
    expect(await verifyTableToken("R7K2M9", SECRET)).toBeNull();
    expect(await verifyTableToken("R7K2M9X4TBX", SECRET)).toBeNull();
    expect(await verifyTableToken("R7K2M9X4TI", SECRET)).toBeNull(); // I finns inte i alfabetet
  });

  it("accepterar gemener — gästen kan skriva in koden för hand", async () => {
    const token = await generateTableToken(SECRET);
    expect(await verifyTableToken(token.toLowerCase(), SECRET)).toBe(
      token.slice(0, PUBLIC_ID_LENGTH),
    );
  });

  it("kastar om nyckeln saknas i stället för att signera med tom sträng", async () => {
    await expect(generateTableToken("")).rejects.toThrow(/QR_TOKEN_SECRET/);
  });

  it("ger samma signatur varje gång för samma id — koden är statisk", async () => {
    const token = await generateTableToken(SECRET);
    const publicId = token.slice(0, PUBLIC_ID_LENGTH);
    expect(await verifyTableToken(token, SECRET)).toBe(publicId);
    expect(await verifyTableToken(token, SECRET)).toBe(publicId);
  });
});

describe("parseToken", () => {
  it("delar upp token i publikt id och signatur", () => {
    expect(parseToken("R7K2M9X4TB")).toEqual({ publicId: "R7K2M9", signature: "X4TB" });
  });

  it("returnerar null för allt som inte har rätt form", () => {
    expect(parseToken("")).toBeNull();
    expect(parseToken("kort")).toBeNull();
    expect(parseToken(undefined as unknown as string)).toBeNull();
  });
});

describe("tableQrUrl", () => {
  it("bygger URL:en som trycks på dekalen", () => {
    expect(tableQrUrl("R7K2M9X4TB", "https://burp.se")).toBe("https://burp.se/t/R7K2M9X4TB");
  });
});
