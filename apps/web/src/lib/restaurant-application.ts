import {
  COUNTRY_INFO,
  isCountryCode,
  normalizeOrgNumber,
  normalizePostalCode,
  type CountryCode,
} from "@burp/core";
import { fill, type Dictionary } from "./i18n";

/**
 * Validering av en restaurangansökan.
 *
 * Ligger skilt från serveråtgärderna därför att exakt samma regler gäller för
 * både sökandens formulär och Burps egen uppläggning. Två kopior av "vad är
 * ett giltigt organisationsnummer" hade glidit isär första gången ett land
 * lades till — och den sortens glidning syns inte förrän en restaurang inte
 * går att spara.
 *
 * Modulen returnerar KODER och inte meningar. De två anroparna talar olika
 * språk: `/anslut` talar gästens fem, backoffice talar svenska och bara
 * svenska. En delad funktion som bar färdig text kunde bara någonsin bära ett
 * av dem — och den som lade till ett språk hade fått veta det av en restauratör
 * i Zagreb, inte av bygget.
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

/**
 * Vad som är fel, som en nyckel i `join.errors`.
 *
 * Namnen är med flit desamma som ordbokens nycklar. En kod som hette något
 * annat hade krävt en översättningstabell till, och den tabellen är exakt det
 * ställe där en ny kod glöms bort.
 */
export type ApplicationErrorCode =
  | "nameRequired"
  | "countryRequired"
  | "orgNumberInvalid"
  | "postalCodeInvalid"
  | "streetRequired"
  | "cityRequired"
  | "emailInvalid";

export interface ApplicationProblem {
  code: ApplicationErrorCode;
  /**
   * Landet som gällde när felet uppstod.
   *
   * `null` bara innan landet är känt — alltså för `countryRequired` och för
   * `nameRequired`, som prövas före det. Behövs för att kunna säga "JIB" och
   * inte "organisationsnumret", och för att kunna namnge landet på läsarens
   * språk i stället för på engelska.
   */
  country: CountryCode | null;
}

export type Validation =
  | { ok: true; value: ValidApplication }
  | { ok: false; problem: ApplicationProblem };

const problem = (
  code: ApplicationErrorCode,
  country: CountryCode | null = null,
): Validation => ({ ok: false, problem: { code, country } });

export function validateApplication(input: ApplicationInput): Validation {
  const name = input.name.trim();
  if (name.length < 2) return problem("nameRequired");

  if (!isCountryCode(input.country)) return problem("countryRequired");

  const country = input.country;

  /*
   * Organisationsnumret har olika form i varje land: JIB har tretton siffror,
   * OIB elva, PIB nio. Felmeddelandet namnger numret som det heter lokalt —
   * "organisationsnumret ser fel ut" hjälper ingen som söker med ett JIB.
   */
  const orgNumber = normalizeOrgNumber(country, input.orgNumber);
  if (!orgNumber) return problem("orgNumberInvalid", country);

  const postalCode = normalizePostalCode(country, input.postalCode);
  if (!postalCode) return problem("postalCodeInvalid", country);

  const street = input.streetAddress.trim();
  if (!street) return problem("streetRequired", country);

  const city = input.city.trim();
  if (!city) return problem("cityRequired", country);

  const email = input.email.trim();
  // Avsiktligt slapp kontroll. En reguljär uttryck som försöker vara exakt om
  // e-post avvisar giltiga adresser, och adressen bekräftas ändå av att någon
  // svarar på den.
  if (email && !email.includes("@")) return problem("emailInvalid", country);

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
 * Felet som en mening, på läsarens språk.
 *
 * Tar ordboken utifrån i stället för att hämta den själv. `/anslut` skickar
 * gästens språk och backoffice skickar `untranslatedSurface()` — att den här
 * funktionen inte kan välja åt dem är poängen med att den finns.
 *
 * `{label}` är organisationsnumrets lokala namn och översätts aldrig: en
 * restauratör i Zagreb letar efter sitt OIB. `{country}` gör det däremot, och
 * kommer ur ordbokens `country`-avsnitt och inte ur `COUNTRY_INFO.name`, som
 * står på engelska.
 */
export function applicationErrorText(
  { code, country }: ApplicationProblem,
  texts: Dictionary,
): string {
  const template = texts.join.errors[code];
  if (!country) return template;

  return fill(template, {
    label: COUNTRY_INFO[country].orgNumberLabel,
    country: texts.country[country],
  });
}

/**
 * Översätter databasfel till något en människa kan agera på.
 *
 * `restaurants_org_number_key` är den som faktiskt inträffar: någon söker om
 * med samma nummer, eller Burp lägger upp ett ställe som redan ansökt. Utan
 * översättningen möts de av "duplicate key value violates unique constraint",
 * vilket varken säger vad som gick fel eller vad man ska göra.
 *
 * Ett fel vi inte känner igen skickas vidare ORÖRT, på Postgres eget språk.
 * Det är fult men ärligt — alternativet är ett svepande "något gick fel" som
 * döljer exakt den information som behövs för att förstå vad.
 */
export function databaseErrorText(
  message: string,
  country: CountryCode,
  texts: Dictionary,
): string {
  const code = message.includes("restaurants_org_number_key")
    ? "orgNumberTaken"
    : message.includes("restaurants_org_number_format")
      ? "orgNumberFormat"
      : null;

  if (!code) return message;

  return fill(texts.join.errors[code], {
    label: COUNTRY_INFO[country].orgNumberLabel,
  });
}
