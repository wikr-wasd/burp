import { oreToKronor, type Ore } from "@burp/core";

/**
 * Strukturerad data enligt schema.org (avsnitt 9.2).
 *
 * Det här är markupen som kan ge rika resultat i Google — betyg, prisklass och
 * öppettider direkt i sökträffen. Ingen kan lova placeringar, men utan markup
 * får sidan definitivt inte det utrymmet.
 *
 * `AggregateRating` bygger enbart på Burps egna verifierade recensioner, alltså
 * betyg kopplade till en genomförd order (avsnitt 7). Att publicera betyg som
 * inte går att härleda till ett köp bryter mot Googles riktlinjer och riskerar
 * en manuell åtgärd mot hela domänen.
 */

export interface RestaurantJsonLdInput {
  name: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  streetAddress: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  /** Prisklass 1–4 → "$".."$$$$" i schema.org:s notation. */
  priceTier: number | null;
  cuisines: readonly string[];
  openingHours: readonly OpeningHoursSpec[];
  rating: { average: number; count: number } | null;
}

export interface OpeningHoursSpec {
  /** "Monday", "Tuesday", … enligt schema.org. */
  dayOfWeek: string;
  /** "11:00" */
  opens: string;
  /** "22:00" */
  closes: string;
}

export function restaurantJsonLd(input: RestaurantJsonLdInput): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: input.name,
    url: input.url,
    address: {
      "@type": "PostalAddress",
      streetAddress: input.streetAddress,
      postalCode: input.postalCode,
      addressLocality: input.city,
      addressCountry: "SE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: input.latitude,
      longitude: input.longitude,
    },
    currenciesAccepted: "SEK",
  };

  if (input.description) jsonLd["description"] = input.description;
  if (input.imageUrl) jsonLd["image"] = input.imageUrl;
  if (input.phone) jsonLd["telephone"] = input.phone;
  if (input.cuisines.length > 0) jsonLd["servesCuisine"] = [...input.cuisines];
  if (input.priceTier) jsonLd["priceRange"] = "$".repeat(Math.min(4, Math.max(1, input.priceTier)));

  if (input.openingHours.length > 0) {
    jsonLd["openingHoursSpecification"] = input.openingHours.map((spec) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: spec.dayOfWeek,
      opens: spec.opens,
      closes: spec.closes,
    }));
  }

  // Utelämnas helt när det inte finns några betyg. En AggregateRating med
  // ratingCount 0 är ogiltig markup och kan få hela blocket ignorerat.
  if (input.rating && input.rating.count > 0) {
    jsonLd["aggregateRating"] = {
      "@type": "AggregateRating",
      ratingValue: input.rating.average.toFixed(1),
      reviewCount: input.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return jsonLd;
}

export interface MenuJsonLdInput {
  restaurantUrl: string;
  sections: readonly {
    name: string;
    description: string | null;
    items: readonly { name: string; description: string | null; priceOre: Ore }[];
  }[];
}

export function menuJsonLd(input: MenuJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    url: `${input.restaurantUrl}/meny`,
    hasMenuSection: input.sections.map((section) => ({
      "@type": "MenuSection",
      name: section.name,
      ...(section.description ? { description: section.description } : {}),
      hasMenuItem: section.items.map((item) => ({
        "@type": "MenuItem",
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        offers: {
          "@type": "Offer",
          price: oreToKronor(item.priceOre).toFixed(2),
          priceCurrency: "SEK",
        },
      })),
    })),
  };
}

/**
 * Serialiserar JSON-LD för inbäddning i en `<script type="application/ld+json">`.
 *
 * `<` escapas eftersom en restaurangbeskrivning som innehåller `</script>`
 * annars skulle stänga taggen och göra resten av strängen till körbar HTML.
 */
export function serializeJsonLd(jsonLd: Record<string, unknown>): string {
  return JSON.stringify(jsonLd).replace(/</g, "\\u003c");
}
