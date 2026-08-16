import {
  COUNTRY_INFO,
  isCountryCode,
  normalizeOrgNumber,
  normalizePostalCode,
  type CountryCode,
} from "@burp/core";

/**
 * Validering av en restaurangansökan.
 *
 * Ligger skilt från serveråtgärderna därför att exakt samma regler gäller för
 * både sökandens formulär och Burps egen uppläggning. Två kopior av "vad är
 * ett giltigt organisationsnummer" hade glidit isär första gången ett land
 * lades till — och den sortens glidning syns inte förrän en restaurang inte
 * går att spara.
 */

export interface ApplicationInput {
  name: string;
  country: string;
  orgNumber: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  description: string;
}

export interface ValidApplication {
  name: string;
  country: CountryCode;
  org_number: string;
  street_address: string;
  postal_code: string;
  city: string;
  phone: string;
  email: string;
  description: string;
}

export type Validation =
  | { ok: true; value: ValidApplication }
  | { ok: false; message: string };

export function validateApplication(input: ApplicationInput): Validation {
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, message: "Restaurangen behöver ett namn." };

  if (!isCountryCode(input.country)) {
    return { ok: false, message: "Välj ett land." };
  }
  const country = input.country;
  const info = COUNTRY_INFO[country];

  /*
   * Organisationsnumret har olika form i varje land: JIB har tretton siffror,
   * OIB elva, PIB nio. Felmeddelandet namnger numret som det heter lokalt —
   * "organisationsnumret ser fel ut" hjälper ingen som söker med ett JIB.
   */
  const orgNumber = normalizeOrgNumber(country, input.orgNumber);
  if (!orgNumber) {
    return {
      ok: false,
      message: `${info.orgNumberLabel} ser inte ut att gälla i ${info.name}.`,
    };
  }

  const postalCode = normalizePostalCode(country, input.postalCode);
  if (!postalCode) {
    return { ok: false, message: `Postnumret ser inte ut att gälla i ${info.name}.` };
  }

  const street = input.streetAddress.trim();
  if (!street) return { ok: false, message: "Gatuadressen får inte vara tom." };

  const city = input.city.trim();
  if (!city) return { ok: false, message: "Staden får inte vara tom." };

  const email = input.email.trim();
  // Avsiktligt slapp kontroll. En reguljär uttryck som försöker vara exakt om
  // e-post avvisar giltiga adresser, och adressen bekräftas ändå av att någon
  // svarar på den.
  if (email && !email.includes("@")) {
    return { ok: false, message: "E-postadressen ser inte ut att stämma." };
  }

  return {
    ok: true,
    value: {
      name,
      country,
      org_number: orgNumber,
      street_address: street,
      postal_code: postalCode,
      city,
      phone: input.phone.trim(),
      email,
      description: input.description.trim().slice(0, 600),
    },
  };
}

/**
 * Översätter databasfel till något en människa kan agera på.
 *
 * `restaurants_org_number_key` är den som faktiskt inträffar: någon söker om
 * med samma nummer, eller Burp lägger upp ett ställe som redan ansökt. Utan
 * översättningen möts de av "duplicate key value violates unique constraint",
 * vilket varken säger vad som gick fel eller vad man ska göra.
 */
export function readableDatabaseError(message: string, label: string): string {
  if (message.includes("restaurants_org_number_key")) {
    return `Det finns redan en restaurang med det ${label.toLowerCase()}et. Har någon redan ansökt?`;
  }
  if (message.includes("restaurants_org_number_format")) {
    return `${label} har fel format för landet.`;
  }
  return message;
}
