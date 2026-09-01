import { describe, expect, it } from "vitest";
import { scrubPath, scrubQuery, scrubUrl } from "./sentry-scrub";

/**
 * Skrubbningen är det som gör felrapportering ofarlig i Burp.
 *
 * Produkten lägger nycklar i sökvägen: bordets token är tryckt på en dekal och
 * byts aldrig, och kvittots order-id ÄR åtkomsten. En felrapport bär
 * `request.url`, och Sentry-fel går vidare till inkorgar och skärmdumpar.
 *
 * Faller ett test här är svaret nästan aldrig att ändra testet.
 */

describe("scrubPath", () => {
  it("döljer bordets token", () => {
    expect(scrubPath("/t/abc123def")).toBe("/t/<dolt>");
  });

  it("döljer BÅDA nycklarna på bordets kvittosida", () => {
    // /t/<token>/order/<orderId> bär två nycklar i samma adress. Att bara
    // dölja den första hade lämnat notan öppen.
    expect(scrubPath("/t/abc123/order/11111111-2222-3333-4444-555555555555")).toBe(
      "/t/<dolt>/order/<dolt>",
    );
  });

  it("döljer kvittots order-id", () => {
    expect(scrubPath("/order/11111111-2222-3333-4444-555555555555")).toBe("/order/<dolt>");
  });

  it("döljer bokningens id", () => {
    expect(scrubPath("/bokning/abc-def")).toBe("/bokning/<dolt>");
  });

  it("döljer personalinbjudans token", () => {
    expect(scrubPath("/personal/inbjudan/xyz789")).toBe("/personal/inbjudan/<dolt>");
  });

  it("rör inte vanliga sidor", () => {
    expect(scrubPath("/sv/sarajevo")).toBe("/sv/sarajevo");
    expect(scrubPath("/sv/r/sarajevo/zeljo")).toBe("/sv/r/sarajevo/zeljo");
    expect(scrubPath("/backoffice/restauranger")).toBe("/backoffice/restauranger");
    expect(scrubPath("/dashboard/kassa")).toBe("/dashboard/kassa");
  });

  it("förväxlar inte språkprefixet med en nyckelrutt", () => {
    // `/sv/…` och `/t/…` börjar båda med ett kort segment. Skulle
    // språkhoppet appliceras på `/t/` hade token:en lämnats kvar.
    expect(scrubPath("/t/abc")).toBe("/t/<dolt>");
    expect(scrubPath("/sv/upptack")).toBe("/sv/upptack");
  });

  it("tar inte en rutt som bara BÖRJAR som en nyckelrutt", () => {
    // En framtida /taxi/ ska inte träffas av regeln för /t/. Matchningen går
    // på segment, inte på strängprefix.
    expect(scrubPath("/taxi/boka")).toBe("/taxi/boka");
    expect(scrubPath("/orderregler")).toBe("/orderregler");
  });

  it("klarar en rutt utan sitt nyckelsegment", () => {
    // /t/ utan token ska inte krascha och inte hitta på ett segment.
    expect(scrubPath("/t")).toBe("/t");
    expect(scrubPath("/t/")).toBe("/t");
  });

  it("behåller inledande snedstreck", () => {
    expect(scrubPath("/sv")).toBe("/sv");
  });
});

describe("scrubQuery", () => {
  it("döljer koder och token", () => {
    expect(scrubQuery("kod=SOMMAR20&stad=mostar")).toBe("?kod=<dolt>&stad=mostar");
    expect(scrubQuery("access_token=xyz")).toBe("?access_token=<dolt>");
  });

  it("rör inte vanliga filter", () => {
    expect(scrubQuery("stad=sarajevo&kok=Grill&oppet=1")).toBe("?stad=sarajevo&kok=Grill&oppet=1");
  });

  it("ger tom sträng för tom fråga", () => {
    expect(scrubQuery("")).toBe("");
  });

  it("klarar en parameter utan värde", () => {
    expect(scrubQuery("oppet")).toBe("?oppet");
  });
});

describe("scrubUrl", () => {
  it("behåller värdnamnet men rensar sökvägen", () => {
    expect(scrubUrl("https://burp.se/t/hemligt123")).toBe("https://burp.se/t/<dolt>");
  });

  it("rensar både sökväg och frågesträng", () => {
    expect(scrubUrl("https://burp.se/order/abc?kod=X&fran=meny")).toBe(
      "https://burp.se/order/<dolt>?kod=<dolt>&fran=meny",
    );
  });

  it("klarar en naken sökväg", () => {
    // Felrapporter bär båda formerna beroende på var i stacken de fångas.
    expect(scrubUrl("/t/abc?x=1")).toBe("/t/<dolt>?x=1");
  });

  it("behåller fragmentet men rensar det som ligger före", () => {
    expect(scrubUrl("https://burp.se/order/abc#kvitto")).toBe("https://burp.se/order/<dolt>#kvitto");
  });

  it("returnerar tom sträng oförändrad", () => {
    expect(scrubUrl("")).toBe("");
  });

  it("rör inte en URL utan sökväg", () => {
    expect(scrubUrl("https://burp.se")).toBe("https://burp.se");
  });
});
