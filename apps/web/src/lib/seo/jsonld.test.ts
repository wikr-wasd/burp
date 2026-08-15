import { describe, expect, it } from "vitest";
import { menuJsonLd, restaurantJsonLd, serializeJsonLd } from "./jsonld";

function input(overrides: Partial<Parameters<typeof restaurantJsonLd>[0]> = {}) {
  return {
    name: "Ćevabdžinica Željo",
    description: "Ćevapi i sarajevska somun",
    url: "https://burp.se/r/sarajevo/cevabdzinica-zeljo",
    imageUrl: null,
    streetAddress: "Kundurdžiluk 19",
    postalCode: "71000",
    city: "Sarajevo",
    latitude: 43.8586,
    longitude: 18.4298,
    phone: null,
    priceTier: 2,
    cuisines: ["Bosniskt"],
    openingHours: [],
    rating: null,
    country: "BA" as const,
    currency: "BAM" as const,
    ...overrides,
  };
}

describe("restaurantJsonLd", () => {
  it("bygger giltig Restaurant-markup", () => {
    const jsonLd = restaurantJsonLd(input());

    expect(jsonLd["@type"]).toBe("Restaurant");
    expect(jsonLd["currenciesAccepted"]).toBe("BAM");
    expect(jsonLd["address"]).toMatchObject({
      "@type": "PostalAddress",
      addressCountry: "BA",
      addressLocality: "Sarajevo",
    });
    expect(jsonLd["geo"]).toMatchObject({ latitude: 43.8586, longitude: 18.4298 });
  });

  it("utelämnar fält som saknas i stället för att skriva null", () => {
    const jsonLd = restaurantJsonLd(input({ description: null, phone: null, imageUrl: null }));

    expect(jsonLd).not.toHaveProperty("description");
    expect(jsonLd).not.toHaveProperty("telephone");
    expect(jsonLd).not.toHaveProperty("image");
  });

  it("översätter prisklass till schema.org-notation", () => {
    expect(restaurantJsonLd(input({ priceTier: 1 }))["priceRange"]).toBe("$");
    expect(restaurantJsonLd(input({ priceTier: 4 }))["priceRange"]).toBe("$$$$");
  });

  it("klampar prisklass till intervallet 1–4", () => {
    expect(restaurantJsonLd(input({ priceTier: 9 }))["priceRange"]).toBe("$$$$");
  });

  /**
   * En AggregateRating med ratingCount 0 är ogiltig markup och kan få Google
   * att ignorera hela blocket. Utelämna hellre än att skriva en nolla.
   */
  it("utelämnar betyg helt när inga omdömen finns", () => {
    expect(restaurantJsonLd(input({ rating: null }))).not.toHaveProperty("aggregateRating");
    expect(
      restaurantJsonLd(input({ rating: { average: 0, count: 0 } })),
    ).not.toHaveProperty("aggregateRating");
  });

  it("tar med betyg när det finns omdömen", () => {
    const jsonLd = restaurantJsonLd(input({ rating: { average: 4.25, count: 12 } }));
    expect(jsonLd["aggregateRating"]).toMatchObject({
      ratingValue: "4.3",
      reviewCount: 12,
      bestRating: 5,
    });
  });
});

describe("restaurantJsonLd — land och valuta", () => {
  /**
   * Google läser markupen bokstavligt. Stod "SE" och "SEK" hårdkodat påstod
   * varje restaurang i Sarajevo att den låg i Sverige — fel data i ett index
   * som är svårt att rätta i efterhand.
   */
  it("följer restaurangens land, inte kodens", () => {
    const kroatisk = restaurantJsonLd(input({ country: "HR", currency: "EUR" }));

    expect(kroatisk["currenciesAccepted"]).toBe("EUR");
    expect(kroatisk["address"]).toMatchObject({ addressCountry: "HR" });
  });
});

describe("menuJsonLd", () => {
  function menu(currency: "BAM" | "RSD", priceOre: number) {
    return menuJsonLd({
      restaurantUrl: "https://burp.se/r/sarajevo/cevabdzinica-zeljo",
      currency,
      sections: [
        {
          name: "Sa roštilja",
          description: null,
          items: [{ name: "Ćevapi 10 kom", description: null, priceOre }],
        },
      ],
    });
  }

  function offer(jsonLd: Record<string, unknown>) {
    const section = (jsonLd["hasMenuSection"] as Record<string, unknown>[])[0]!;
    const item = (section["hasMenuItem"] as Record<string, unknown>[])[0]!;
    return item["offers"];
  }

  it("anger priset i restaurangens valuta", () => {
    expect(offer(menu("BAM", 1200))).toMatchObject({ price: "12.00", priceCurrency: "BAM" });
  });

  /**
   * Dinar har inga decimaler i praktiken. Med två skulle 1200 lagrade enheter
   * skrivas som "12.00 RSD" — tolv dinarer i stället för tolv hundra.
   */
  it("skriver dinar utan decimaler", () => {
    expect(offer(menu("RSD", 120000))).toMatchObject({ price: "1200", priceCurrency: "RSD" });
  });
});

describe("serializeJsonLd", () => {
  /**
   * Blocket bäddas in i en <script>-tagg. En restaurangbeskrivning som
   * innehåller </script> skulle annars stänga taggen och göra resten av
   * strängen till körbar HTML — och beskrivningen skrivs av restaurangen själv.
   */
  it("escapar < så att en beskrivning inte kan stänga script-taggen", () => {
    const serialized = serializeJsonLd(
      restaurantJsonLd(input({ description: "</script><img src=x onerror=alert(1)>" })),
    );

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<img");
    expect(serialized).toContain("\\u003c");
  });

  it("ger fortfarande giltig JSON efter escapning", () => {
    const jsonLd = restaurantJsonLd(input({ description: "a < b" }));
    expect(JSON.parse(serializeJsonLd(jsonLd))["description"]).toBe("a < b");
  });
});
