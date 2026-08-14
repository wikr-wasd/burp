import { describe, expect, it } from "vitest";
import { menuJsonLd, restaurantJsonLd, serializeJsonLd } from "./jsonld";

function input(overrides: Partial<Parameters<typeof restaurantJsonLd>[0]> = {}) {
  return {
    name: "Pizzeria Roma",
    description: "Vedugnsbakad pizza",
    url: "https://burp.se/r/malmo/pizzeria-roma",
    imageUrl: null,
    streetAddress: "Bergsgatan 12",
    postalCode: "21422",
    city: "Malmö",
    latitude: 55.5906,
    longitude: 13.0007,
    phone: null,
    priceTier: 2,
    cuisines: ["Pizza"],
    openingHours: [],
    rating: null,
    ...overrides,
  };
}

describe("restaurantJsonLd", () => {
  it("bygger giltig Restaurant-markup", () => {
    const jsonLd = restaurantJsonLd(input());

    expect(jsonLd["@type"]).toBe("Restaurant");
    expect(jsonLd["currenciesAccepted"]).toBe("SEK");
    expect(jsonLd["address"]).toMatchObject({
      "@type": "PostalAddress",
      addressCountry: "SE",
      addressLocality: "Malmö",
    });
    expect(jsonLd["geo"]).toMatchObject({ latitude: 55.5906, longitude: 13.0007 });
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

describe("menuJsonLd", () => {
  it("anger priser i kronor med två decimaler", () => {
    const jsonLd = menuJsonLd({
      restaurantUrl: "https://burp.se/r/malmo/pizzeria-roma",
      sections: [
        {
          name: "Pizza",
          description: null,
          items: [{ name: "Margherita", description: null, priceOre: 12900 }],
        },
      ],
    });

    const section = (jsonLd["hasMenuSection"] as Record<string, unknown>[])[0]!;
    const item = (section["hasMenuItem"] as Record<string, unknown>[])[0]!;

    expect(item["offers"]).toMatchObject({ price: "129.00", priceCurrency: "SEK" });
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
