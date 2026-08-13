import { describe, expect, it } from "vitest";
import {
  generatePublicId,
  generateTableToken,
  parseToken,
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

  it("kolliderar inte i praktiken", () => {
    const ids = new Set(Array.from({ length: 5000 }, generatePublicId));
    expect(ids.size).toBe(5000);
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
