import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  ORDER_STATUSES,
  PAYMENT_PROVIDERS,
  STAFF_ROLES,
  WEEKDAY_KEYS,
} from "@burp/core";
import {
  DEFAULT_LOCALE,
  DEFAULT_LOCALE_BY_COUNTRY,
  fill,
  isLocale,
  staffLocale,
  LOCALES,
  LOCALE_ALTERNATE_TAGS,
  LOCALE_DATE_TAGS,
  LOCALE_LABELS,
  LOCALE_TAGS,
  dictionary,
  localeFromCookie,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  localePath,
  pickLocale,
} from "./index";
import { bs } from "./bs";
import { de } from "./de";
import { en } from "./en";
import { no } from "./no";
import { sv } from "./sv";

/** Varje språk med sin ordbok. Testerna nedan går igenom allihop. */
const ALL = { bs, de, en, no, sv } as const;

/** Alla utom svenskan, som är formen de andra jämförs mot. */
const TRANSLATIONS = { bs, de, en, no } as const;

/**
 * Nycklarna måste vara identiska mellan språken.
 *
 * TypeScript fångar en saknad nyckel redan vid bygget, men inte en EXTRA i
 * engelskan — en nyckel som inte längre används någonstans. Den blir kvar och
 * blir så småningom en text ingen vet om den stämmer.
 */
function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object" && child !== null && !Array.isArray(child)
      ? keys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("ordböckerna", () => {
  it("finns för varje språk", () => {
    // `dictionary()` faller tillbaka på svenskan för okända värden, så ett
    // språk utan egen ordbok hade sett ut att fungera — på svenska.
    for (const locale of LOCALES) {
      expect(dictionary(locale), locale).toBe(ALL[locale]);
    }
  });

  it("har exakt samma nycklar", () => {
    for (const [locale, dict] of Object.entries(TRANSLATIONS)) {
      expect(keys(dict).sort(), locale).toEqual(keys(sv).sort());
    }
  });

  it("saknar tomma texter", () => {
    for (const [locale, dict] of Object.entries(ALL)) {
      for (const [path, value] of Object.entries(flatten(dict))) {
        if (typeof value === "string") {
          expect(value.trim(), `tom text: ${locale}.${path}`).not.toBe("");
        }
      }
    }
  });

  it("har etikett, språktagg och datumformat", () => {
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale], `etikett saknas: ${locale}`).toBeTruthy();
      expect(LOCALE_TAGS[locale], `språktagg saknas: ${locale}`).toBeTruthy();
      expect(LOCALE_DATE_TAGS[locale], `datumformat saknas: ${locale}`).toBeTruthy();
      expect(LOCALE_ALTERNATE_TAGS[locale].length, `hreflang saknas: ${locale}`)
        .toBeGreaterThan(0);
    }
  });

  /**
   * Etiketten står på sitt eget språk och aldrig översatt.
   *
   * Den som letar efter tyska i menyn letar efter "Deutsch". En meny skriven på
   * ett språk hon inte läser är precis den situation hon försöker ta sig ur.
   */
  it("namnger språken på deras egna språk", () => {
    expect(LOCALE_LABELS.de).toBe("Deutsch");
    expect(LOCALE_LABELS.en).toBe("English");
    expect(LOCALE_LABELS.no).toBe("Norsk");
  });

  /**
   * `/bs/` är en ordbok för tre standarder och ska hittas av alla tre.
   *
   * Utan de extra taggarna når sidan bara den som söker på bosniska — inte den
   * i Zagreb eller Belgrad, alltså två av tre marknader.
   */
  it("pekar ut kroatiska och serbiska mot den bosniska sidan", () => {
    expect(LOCALE_ALTERNATE_TAGS.bs).toContain("hr");
    expect(LOCALE_ALTERNATE_TAGS.bs).toContain("sr-Latn");
  });

  /**
   * Ingen ordbok får råka vara en kopia av svenskan.
   *
   * En oöversatt sträng är lättare att missa än en saknad: den syns inte som
   * ett fel, bara som fel språk. Typkontrollen fångar den aldrig — en svensk
   * mening är en fullt giltig `string`.
   *
   * ── Undantagen ────────────────────────────────────────────────────────────
   *
   * Varje rad har ett skäl, och listan är per språk. En generell uppmjukning —
   * "hoppa över korta strängar", till exempel — hade släppt igenom precis det
   * testet finns för.
   *
   * Norskan har flest, och det är inte slarv. Svenska och norska delar ord i en
   * omfattning som gör att "Rabatt" och "Telefon" är rätt på båda språken. Att
   * skriva om dem för att undvika en kollision hade gjort norskan sämre.
   */
  const SAMMA_SOM_SVENSKAN: Record<string, readonly string[]> = {
    // 404 är en siffra, och presentkortskoden är ett format och inte en text.
    // Båda ser likadana ut på alla språk.
    bs: [
      "errors.notFoundLabel",
      "menu.giftCardPlaceholder",
      /*
       * Allergennamn som ÄR samma ord. "Gluten" heter gluten överallt, och att
       * skriva om det för att undvika en kollision hade gjort listan sämre —
       * det är dessutom det enda fältet på menyn där en missförståelse är
       * farlig.
       */
      "allergen.GLUTEN",
      "allergen.SOY",
      // Ett NAMN i ett platshållarfält. "Amina S." ser likadant ut på alla
      // fem språken, av samma skäl som presentkortskoden gör det.
      "account.displayNamePlaceholder",
      // Lånord ur samma rot. "Telefon" är rätt på bosniska.
      "restaurant.phone",
      // "min" är samma förkortning på alla fem språken.
      "staff.kitchen.minutes",
      "staff.kitchen.prepMinutes",
      // Lånordet igen — samma rot, samma stavning.
      "staff.settings.phone",
      "staff.reports.code",
      "join.phone",
      // "Datum" är samma ord på bosniska. "Vrijeme" och "Sto" är det inte,
      // vilket är kvittot på att bokningsavsnittet faktiskt är översatt.
      "booking.date",
      // "Kontrast" är samma lånord som på svenska.
      "staff.image.contrast",
    ],

    de: [
      "errors.notFoundLabel",
      "menu.giftCardPlaceholder",
      /*
       * Allergennamn som ÄR samma ord. "Gluten" heter gluten överallt, och att
       * skriva om det för att undvika en kollision hade gjort listan sämre —
       * det är dessutom det enda fältet på menyn där en missförståelse är
       * farlig.
       */
      "allergen.GLUTEN",
      "allergen.SOY",
      "allergen.SESAME",
      // Ett NAMN i ett platshållarfält. "Amina S." ser likadant ut på alla
      // fem språken, av samma skäl som presentkortskoden gör det.
      "account.displayNamePlaceholder",
      // Tyska och svenska delar de här orden rakt av.
      "restaurant.phone",
      "menu.discount",
      "receipt.discount",
      "receipt.reviewComment",
      // "Statistik" stavas likadant på tyska och svenska.
      "staff.section.statistik",
      // "min" är samma förkortning på alla fem språken.
      "staff.kitchen.minutes",
      "staff.settings.phone",
      // "Bild" och "Rabatt" stavas likadant på tyska och svenska.
      "staff.menu.image",
      "staff.reports.discount",
      // "Land", "Telefon" och "Ort" delas rakt av.
      "join.country",
      "join.phone",
      "account.city",
      /*
       * Kroatien och Serbien heter likadant på tyska och svenska.
       *
       * Notera vilka som INTE står här: Bosnien und Herzegowina och Schweden
       * skiljer sig, vilket är kvittot på att raderna är tyska och inte
       * kopierade.
       */
      "country.HR",
      "country.RS",
      /*
       * "Banner" är samma lånord här som på svenska.
       *
       * Notera vad som INTE står här: `bannerHint` och `bannerUpload` skiljer
       * sig, vilket är kvittot på att raden är en riktig kollision och inte en
       * oöversatt ruta.
       */
      "staff.settings.bannerTitle",
      // "Datum" delas rakt av. "Tisch" och "Uhrzeit" gör det inte.
      "booking.date",
      // "Kontrast" är samma lånord som på svenska.
      "staff.image.contrast",
      // "Titel" delas rakt av. "Weinkarte 2026" och resten av avsnittet gör det inte.
      "staff.documents.titleLabel",
      // "Text" är samma ord på tyska. "Theke", "Wand" och "Treppe" i samma
      // avsnitt är det inte — kvittot på att inredningen faktiskt är översatt.
      "staff.floorItem.TEXT",
    ],

    en: [
      "errors.notFoundLabel",
      "menu.giftCardPlaceholder",
      /*
       * Allergennamn som ÄR samma ord. "Gluten" heter gluten överallt, och att
       * skriva om det för att undvika en kollision hade gjort listan sämre —
       * det är dessutom det enda fältet på menyn där en missförståelse är
       * farlig.
       */
      "allergen.GLUTEN",
      "allergen.LUPIN",
      // Ett NAMN i ett platshållarfält. "Amina S." ser likadant ut på alla
      // fem språken, av samma skäl som presentkortskoden gör det.
      "account.displayNamePlaceholder",
      "staff.kitchen.minutes",
      // "min" igen, och "{n} min" med den.
      "staff.kitchen.prepMinutes",
      /*
       * "Banner" är samma lånord här som på svenska.
       *
       * Notera vad som INTE står här: `bannerHint` och `bannerUpload` skiljer
       * sig, vilket är kvittot på att raden är en riktig kollision och inte en
       * oöversatt ruta.
       */
      "staff.settings.bannerTitle",
      // "Bar" och "Text" är samma ord på engelska. "Restroom" och "Stairs" i
      // samma avsnitt är det inte.
      "staff.floorItem.BAR",
      "staff.floorItem.TEXT",
    ],

    /*
     * Norskan har flest, och det är inte slarv.
     *
     * Svenska och norska delar ord i en omfattning som gör att "Rabatt",
     * "Telefon" och "Onsdag" är rätt på båda språken. Att skriva om dem för att
     * undvika en kollision hade gjort norskan sämre, inte bättre.
     *
     * Att listan är explicit och inte en generell uppmjukning är poängen: en NY
     * nyckel som glöms oöversatt står inte här, och testet faller. Notera också
     * vilka veckodagar som INTE står med — måndag, tisdag, lördag och söndag
     * stavas olika, vilket är ett tecken på att filen faktiskt är norsk.
     */
    no: [
      "errors.notFoundLabel",
      "receipt.cancelConfirm",
      "menu.allergens",
      "menu.giftCardPlaceholder",
      /*
       * Allergennamn som ÄR samma ord. "Gluten" heter gluten överallt, och att
       * skriva om det för att undvika en kollision hade gjort listan sämre —
       * det är dessutom det enda fältet på menyn där en missförståelse är
       * farlig.
       */
      "allergen.GLUTEN",
      "allergen.FISH",
      "allergen.SESAME",
      "allergen.CELERY",
      "allergen.LUPIN",
      // Ett NAMN i ett platshållarfält. "Amina S." ser likadant ut på alla
      // fem språken, av samma skäl som presentkortskoden gör det.
      "account.displayNamePlaceholder",
      "site.language",
      "site.becomePartner",
      "restaurant.menu",
      "restaurant.phone",
      "restaurant.ratingOutOf",
      "menu.table",
      "menu.payByCard",
      "menu.paymentCancel",
      "menu.discount",
      "receipt.table",
      "receipt.discount",
      "receipt.total",
      "receipt.reviewFood",
      "receipt.reviewService",
      "receipt.reviewComment",
      "receipt.reviewStar",
      "receipt.reviewCancel",
      "receipt.almostReady",
      "receipt.status.DRAFT",
      "receipt.status.READY",
      "weekday.wed",
      "weekday.thu",
      "weekday.fri",
      /*
       * Bokningen. Fyra uttryck som stavas likadant på norska och svenska.
       *
       * Notera vilka som INTE står här: `booking.date` är "Dato" mot "Datum",
       * `booking.submit` är "Reserver" mot "Boka" och `booking.cancel` är
       * "Avbestill" mot "Avboka". Kollisionerna sitter i de ord där språken
       * faktiskt sammanfaller, inte i avsnittet.
       */
      "booking.tableLabel",
      "booking.attribute.OUTDOOR",
      "booking.attribute.BOOTH",
      "booking.status.NO_SHOW",
      /*
       * Personalens bokningsvy. "Bord" och "Kom" delas rakt av.
       *
       * Notera vilka som INTE står här: `noShow` är "Kom ikke" mot "Kom inte"
       * och `cancel` är "Avbestill" mot "Avboka".
       */
      "staff.bookings.table",
      "staff.bookings.seat",
      // "E-post" stavas likadant. "Passord" och "Navn" gör det inte,
      // vilket är kvittot på att avsnittet faktiskt är norskt.
      "auth.email",
      // "Betalt" är samma ord. "Sum" och "Bestillinger" är det inte.
      "staff.tableView.paid",
      // "Kontrast" är samma lånord som på svenska.
      "staff.image.contrast",

      // "stopp" är samma ord på norska. "Ny rute" och "Endret" är det inte.
      "routes.stopCount",
      /*
       * Marknadsföringsytan. "Skriv ut" och "Google-profilen" delas rakt av.
       *
       * Notera vilka som INTE står här: `posterTitle` är "Plakat" mot
       * "Affisch" och `copied` är "Kopiert" mot "Kopierat".
       */
      "staff.marketing.print",
      "staff.marketing.google",
      // "{dish} i {city}" är samma mall på norska. `fromPrice` är "Fra" mot
      // "Från" och `priceTitle` "Hva" mot "Vad".
      "dish.title",
      /*
       * "Avbryt" stavas likadant på norska och svenska.
       *
       * Notera vilka av tvåstegspanelens texter som INTE står här: `mfaVerify`
       * är "Bekreft" mot "Bekräfta" och `mfaDisable` är "Slå av" mot "Stäng
       * av". Kollisionen sitter i ett enda ord, inte i avsnittet.
       */
      "staff.settings.mfaCancel",
      /*
       * "Banner" är samma lånord här som på svenska.
       *
       * Notera vad som INTE står här: `bannerHint` och `bannerUpload` skiljer
       * sig, vilket är kvittot på att raden är en riktig kollision och inte en
       * oöversatt ruta.
       */
      "staff.settings.bannerTitle",
      /*
       * Värvningssidan. Fyra fältetiketter som stavas likadant på båda språken.
       *
       * Notera vilka som INTE står här: `join.city` är "Sted" mot "Stad" och
       * `join.street` är "Gateadresse" mot "Gatuadress". Kollisionerna sitter i
       * de fyra ord där språken faktiskt sammanfaller, inte i avsnittet.
       */
      "join.country",
      "join.postalCode",
      "join.phone",
      "join.email",
      // Sverige heter Sverige på norska. Bosnia-Hercegovina, Kroatia och
      // Serbia gör det inte, vilket är kvittot på att raderna är norska.
      "country.SE",
      /*
       * Kontoytan. Tre ord som stavas likadant på båda språken.
       *
       * Notera vilka som INTE står här: `account.orders` är "Bestillinger" mot
       * "Beställningar", `account.remove` är "Fjern" mot "Ta bort", och
       * `account.details` är "Mine opplysninger" mot "Mina uppgifter".
       */
      "account.addresses",
      "account.postalCode",
      "account.cancel",
      // "Klart om" och "{n} min" stavas likadant på norska och svenska.
      // Notera att `staff.kitchen.stepACCEPTED` INTE står här: "Ta imot" mot
      // "Ta emot" är kvittot på att avsnittet faktiskt är norskt.
      "staff.kitchen.prepTime",
      "staff.kitchen.prepMinutes",
      /*
       * Personalytorna. Samma mönster som ovan: norskan och svenskan delar
       * orden rakt av, och att skriva om dem för att slippa en kollision hade
       * gjort norskan sämre.
       *
       * "Kort i terminal" är hela vägen identisk, och det säger något om hur
       * nära språken ligger — inte att raden är oöversatt. Notera att
       * `staff.provider.GIFT_CARD` INTE står här: "Gavekort" mot
       * "Presentkort" är kvittot på att avsnittet faktiskt är norskt.
       */
      "staff.language",
      "staff.section.meny",
      "staff.status.DRAFT",
      "staff.status.READY",
      "staff.provider.CASH",
      "staff.provider.TERMINAL",
      "staff.provider.STRIPE",
      "staff.provider.MONRI",
      // Köksskärmen. "Bord", "Klar", "Avbryt", "på" och "av" är rätt på båda
      // språken; "Henting" mot "Avhämtning" och "Servert" mot "Serverad" är
      // kvittot på att avsnittet faktiskt är norskt.
      "staff.kitchen.soundOn",
      "staff.kitchen.soundOff",
      "staff.kitchen.table",
      "staff.kitchen.typeTable",
      "staff.kitchen.minutes",
      "staff.kitchen.stepREADY",
      "staff.kitchen.cancel",
      /*
       * Kassan. "Bord", "Avbryt", "kontant" och "betalt av" är rätt på båda
       * språken — men "Gjør opp" mot "Kvittera", "regningen" mot "notan" och
       * "Driks" mot "Dricks" står inte här, och det är där skillnaden syns.
       */
      "staff.orderType.table",
      "staff.orderType.TABLE",
      "staff.register.paidToday",
      "staff.register.paidOfTotal",
      "staff.register.cancel",
      "staff.register.tipsCash",
      // Översikten och personalsidan. "Bord" och "(du)" stavas likadant.
      "staff.overview.tables",
      "staff.staffAdmin.you",
      // Inställningarna. Fyra ord till som norskan och svenskan delar.
      "staff.settings.editWindowUnit",
      "staff.settings.cap",
      "staff.settings.phone",
      "staff.settings.postalCode",
      // Menyredigeraren. Nio ord till som norskan och svenskan delar rakt av;
      // "Utsolgt", "Slett" och "Beskrivelse" står inte här.
      "staff.menu.newMenu",
      "staff.menu.cancel",
      "staff.menu.dayWed",
      "staff.menu.dayFri",
      "staff.menu.newCategory",
      "staff.menu.price",
      "staff.menu.details",
      "staff.menu.allergens",
      "staff.menu.min",
      // Bordsytan. "Uteservering", "Låst" och "Lås bordet" är rätt på båda.
      "staff.tables.zonePlaceholder",
      "staff.tables.locked",
      "staff.tables.lock",
      "staff.tables.cancel",
      // Rapportytorna. Sju ord till som norskan och svenskan delar.
      "staff.reports.discount",
      "staff.reports.none",
      "staff.reports.cancel",
      "staff.reports.turnOn",
      "staff.reports.usedOf",
      "staff.reports.inDiscount",
      "staff.reports.amountIn",
      "staff.reports.actorSystem",
      // "Form", "Bar" och "Toalett" stavas likadant på norska. Att "Dybde",
      // "Firkantet" och "Kjøkken" gör det INTE är kvittot på att raderna är
      // norska och inte kopierade.
      "staff.tables.shape",
      "staff.floorItem.BAR",
      "staff.floorItem.WC",
      // "Utkast" stavas likadant på norska. Att "Kom ikke fram" och
      // "Emnefelt" i samma avsnitt INTE gör det är kvittot på att raderna är
      // norska och inte kopierade.
      "staff.campaigns.statusDRAFT",
    ],
  };

  it("är faktiskt översatt", () => {
    const svFlat = flatten(sv);
    const problems: string[] = [];

    for (const [locale, dict] of Object.entries(TRANSLATIONS)) {
      const allowed = new Set(SAMMA_SOM_SVENSKAN[locale] ?? []);
      const flat = flatten(dict);

      for (const key of Object.keys(svFlat)) {
        if (typeof svFlat[key] !== "string") continue;
        if (svFlat[key] !== flat[key]) continue;
        if (allowed.has(key)) continue;
        problems.push(`${locale}.${key} = ${JSON.stringify(svFlat[key])}`);
      }
    }

    expect(problems).toEqual([]);
  });

  /**
   * Undantagslistan får inte ruttna.
   *
   * En nyckel som byter namn, eller en text som senare faktiskt översätts,
   * lämnar en rad kvar i listan som inte gör något. Nästa gång någon läser den
   * tror hon att kollisionen fortfarande finns — och listan blir en samling
   * påståenden ingen längre kan lita på.
   */
  it("har inga undantag som inte behövs", () => {
    const svFlat = flatten(sv);
    const stale: string[] = [];

    for (const [locale, allowed] of Object.entries(SAMMA_SOM_SVENSKAN)) {
      const flat = flatten(TRANSLATIONS[locale as keyof typeof TRANSLATIONS]);
      for (const key of allowed) {
        if (svFlat[key] !== flat[key]) stale.push(`${locale}.${key}`);
      }
    }

    expect(stale).toEqual([]);
  });
});

function flatten(value: unknown, prefix = ""): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return { [prefix]: value };

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, child]) => {
    if (typeof child === "object" && child !== null && !Array.isArray(child)) {
      return { ...acc, ...flatten(child, `${prefix}${key}.`) };
    }
    acc[`${prefix}${key}`] = child;
    return acc;
  }, {});
}

/**
 * Avsnitten som skickas vidare till klientkomponenter måste vara rena strängar.
 *
 * `labels`-objektet passerar server/klient-gränsen, och React kan inte
 * serialisera en funktion — sidan svarar 500. Felet syns varken i
 * typkontrollen eller i ett grep av HTML:en: sidan returnerar en felpayload
 * som ändå innehåller de strängar man letar efter. QR-sidan var trasig på
 * precis det sättet, och såg fungerande ut.
 */
describe("texter som korsar server/klient-gränsen", () => {
  for (const section of ["menu", "table", "receipt", "join", "account"] as const) {
    it(`${section} innehåller bara strängar`, () => {
      for (const dict of Object.values(ALL)) {
        for (const [key, value] of Object.entries(dict[section])) {
          // `receipt.status` är ett nästlat objekt av strängar — kontrollera
          // dess värden i stället för objektet självt.
          if (typeof value === "object" && value !== null) {
            for (const [nested, text] of Object.entries(value)) {
              expect(typeof text, `${section}.${key}.${nested}`).toBe("string");
            }
            continue;
          }
          expect(typeof value, `${section}.${key} måste vara en sträng`).toBe("string");
        }
      }
    });
  }

  /**
   * `staff` är ett SPECIALFALL: avsnittet skickas aldrig i sin helhet.
   *
   * Sidorna plockar ut `staff.kitchen`, `staff.status`, `staff.role` och
   * `staff.provider` och skickar dem var för sig till klientkomponenter. Just
   * de fyra måste därför vara rena strängar rakt igenom.
   *
   * Resten av `staff` får bära funktioner, och gör det: `upcomingLater` böjer
   * ett substantiv efter räkneord och kan inte vara en mall, eftersom
   * bosniskan har tre former och undantag på 11–14. Den läses bara av
   * serverrenderade sidor.
   *
   * Testet finns för att skillnaden inte syns i koden. Den dag någon lägger
   * en funktion i `staff.kitchen` för att "det behövs en variabel där" faller
   * köksskärmen med 500 — och felpayloaden innehåller ändå texterna.
   */
  const CLIENT_SECTIONS = [
    "kitchen",
    "status",
    "role",
    "provider",
    "orderType",
    "register",
    "overview",
    "staffAdmin",
    "settings",
    "menu",
    "tables",
    "reports",
    "image",
    "invitation",
  ] as const;

  for (const section of CLIENT_SECTIONS) {
    it(`staff.${section} innehåller bara strängar`, () => {
      for (const [locale, dict] of Object.entries(ALL)) {
        for (const [key, value] of Object.entries(dict.staff[section])) {
          expect(typeof value, `${locale}.staff.${section}.${key}`).toBe("string");
        }
      }
    });
  }
});

describe("fill", () => {
  it("fyller i variabler", () => {
    expect(fill("Bord {number}", { number: "3" })).toBe("Bord 3");
    expect(fill("välj {min}–{max}", { min: 1, max: 3 })).toBe("välj 1–3");
  });

  /**
   * En saknad variabel lämnas synlig. Ett `{name}` i gränssnittet är en bugg
   * någon rättar; ordet "undefined" mitt i en mening ser ut som ett systemfel
   * för gästen.
   */
  it("lämnar okända variabler orörda", () => {
    expect(fill("Ta bort en {name}", {})).toBe("Ta bort en {name}");
  });
});

describe("pickLocale", () => {
  it("väljer det högst rankade språket vi har", () => {
    expect(pickLocale("en-GB,en;q=0.9,sv;q=0.8")).toBe("en");
    expect(pickLocale("sv-SE,sv;q=0.9,en;q=0.8")).toBe("sv");
    expect(pickLocale("de-AT,de;q=0.9,en;q=0.8")).toBe("de");
  });

  it("respekterar kvalitet framför ordning", () => {
    expect(pickLocale("fr;q=1.0,en;q=0.9,sv;q=0.95")).toBe("sv");
  });

  /*
   * Halva marknaden skickar `hr` eller `sr`, inte `bs`.
   *
   * En kroatisk telefon i Zagreb säger `hr-HR`. Utan alias faller den till
   * standardspråket — alltså svenska, mitt i Kroatien. Det är inte ett kantfall
   * utan två av tre marknader, och det gäller QR-sidan där gästen aldrig får
   * välja språk själv.
   */
  it("låter kroatiska och serbiska landa på den bosniska ordboken", () => {
    expect(pickLocale("hr-HR,hr;q=0.9")).toBe("bs");
    expect(pickLocale("sr-RS,sr;q=0.9")).toBe("bs");
    expect(pickLocale("bs-BA")).toBe("bs");
  });

  it("låter bokmål och nynorska landa på norskan", () => {
    expect(pickLocale("nb-NO,nb;q=0.9")).toBe("no");
    expect(pickLocale("nn-NO")).toBe("no");
  });

  it("väljer alias först när inget riktigt språk rankar högre", () => {
    // Engelska finns som egen ordbok och rankar högst — aliaset ska inte vinna
    // bara för att det står först i listan.
    expect(pickLocale("hr;q=0.5,en;q=0.9")).toBe("en");
  });

  it("hoppar över språk vi inte har", () => {
    expect(pickLocale("fr-FR,it;q=0.9,en;q=0.5")).toBe("en");
  });

  it("faller tillbaka på standardspråket", () => {
    expect(pickLocale(null)).toBe(DEFAULT_LOCALE);
    expect(pickLocale("")).toBe(DEFAULT_LOCALE);
    expect(pickLocale("fr,it;q=0.8")).toBe(DEFAULT_LOCALE);
    // q=0 betyder uttryckligen "inte det här språket".
    expect(pickLocale("en;q=0")).toBe(DEFAULT_LOCALE);
  });
});

describe("localeFromCookie", () => {
  it("läser ett giltigt språkval", () => {
    for (const locale of LOCALES) expect(localeFromCookie(locale)).toBe(locale);
  });

  /*
   * Kakan kommer från klienten och är därför inte att lita på. Skräp i den är
   * inget språkval — inte ett fel heller: gästen ska få `Accept-Language` i
   * stället, aldrig en kraschad sida.
   */
  it("ger null för allt annat", () => {
    expect(localeFromCookie("hr")).toBeNull();
    expect(localeFromCookie("SV")).toBeNull();
    expect(localeFromCookie("")).toBeNull();
    expect(localeFromCookie(undefined)).toBeNull();
    expect(localeFromCookie(null)).toBeNull();
  });

  it("håller kakan ett år", () => {
    // Ett språkval är inte en session. Den som kommer tillbaka nästa sommar
    // ska läsa samma språk som förra sommaren.
    expect(LOCALE_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
    expect(LOCALE_COOKIE).toBe("burp_sprak");
  });
});

describe("localePath", () => {
  it("prefixar sökvägar", () => {
    expect(localePath("en", "/sarajevo")).toBe("/en/sarajevo");
    expect(localePath("sv", "sarajevo")).toBe("/sv/sarajevo");
    expect(localePath("bs", "/sarajevo")).toBe("/bs/sarajevo");
  });

  it("ger roten utan efterföljande snedstreck", () => {
    expect(localePath("sv", "/")).toBe("/sv");
  });
});

describe("isLocale", () => {
  it("känner igen språken och inget annat", () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);

    /*
     * `hr` och `sr` är MED i listan över det som inte är ett språk här.
     *
     * De är alias i `pickLocale` men inga egna adresser: `/hr/sarajevo` ska
     * 404:a. Två URL:er med samma innehåll är dubblerat innehåll för Google,
     * och hela skälet till att språket ligger i adressen är sökbarheten.
     */
    for (const bad of ["hr", "sr", "nb", "fr", "sv-SE", "", null, 1, {}]) {
      expect(isLocale(bad), String(bad)).toBe(false);
    }
  });
});

describe("staffLocale", () => {
  it("varje land har ett språk", () => {
    // Kartan är typad `Record<CountryCode, Locale>`, men typen skyddar bara
    // koden i det här paketet. Testet finns för det femte landet: raden i
    // COUNTRIES läggs till, kartan glöms, och bygget faller på ett ställe som
    // inte pekar hit.
    for (const country of COUNTRIES) {
      expect(LOCALES, country).toContain(DEFAULT_LOCALE_BY_COUNTRY[country]);
    }
  });

  it("marknaden får sitt eget språk och inte svenska", () => {
    // Hela poängen med kartan. En nyanställd i Sarajevo, Zagreb eller Belgrad
    // som inte valt något ska inte mötas av svenska.
    for (const country of ["BA", "HR", "RS"] as const) {
      expect(staffLocale(null, country), country).toBe("bs");
    }

    expect(staffLocale(null, "SE")).toBe("sv");
  });

  it("det egna valet vinner över landet", () => {
    // Språkväljaren ska betyda något. En tysk kock i Sarajevo som valt tyska
    // ska ha tyska, oavsett var restaurangen ligger.
    expect(staffLocale("de", "BA")).toBe("de");
    expect(staffLocale("sv", "RS")).toBe("sv");

    // Och ett aktivt val av landets eget språk får inte tolkas om till något
    // annat — "valde bosniska" och "valde inte" ska ge samma svar i BA.
    expect(staffLocale("bs", "BA")).toBe("bs");
  });

  it("skräp i kolumnen faller tillbaka på landet, inte på svenska", () => {
    // `staff.locale` har ett villkor i schemat (migration 0047), men raden kan
    // vara äldre än villkoret eller ha skrivits förbi appen. Ett okänt värde
    // ska inte kunna dra en restaurang i Belgrad till svenska.
    for (const junk of ["hr", "sr", "", "fr", 1, {}, undefined]) {
      expect(staffLocale(junk, "RS"), String(junk)).toBe("bs");
    }
  });
});

/**
 * Personalytornas etiketter.
 *
 * Låg till 2026-08-21 i `@burp/core` som `STAFF_ROLE_LABELS`,
 * `ORDER_STATUS_LABELS`, `PAYMENT_PROVIDER_LABELS` och `WEEKDAY_LABELS`, på
 * svenska. Kärnan får inte importera i18n-modulen och kunde därför bara
 * någonsin bära ett språk.
 *
 * Kraven som prövades där följer med hit, och blir strängare på köpet: de
 * gäller nu alla fem språken i stället för ett. Kärnan bidrar med nycklarna,
 * som är det den fortfarande äger.
 */
describe("personalytornas etiketter", () => {
  const TRANSLATIONS = { bs, de, en, no, sv };

  it("varje roll, status och leverantör har en etikett på varje språk", () => {
    // En saknad etikett visar rå enum-text för personalen. Testet finns för
    // att nästa leverantör inte ska kunna läggas till utan en — på något språk.
    const missing: string[] = [];

    for (const [locale, dict] of Object.entries(TRANSLATIONS)) {
      for (const role of STAFF_ROLES) {
        if (!dict.staff.role[role]) missing.push(`${locale}.staff.role.${role}`);
      }
      for (const status of ORDER_STATUSES) {
        if (!dict.staff.status[status]) missing.push(`${locale}.staff.status.${status}`);
      }
      for (const provider of PAYMENT_PROVIDERS) {
        if (!dict.staff.provider[provider]) missing.push(`${locale}.staff.provider.${provider}`);
      }
      for (const day of WEEKDAY_KEYS) {
        if (!dict.weekday[day]) missing.push(`${locale}.weekday.${day}`);
      }
      /*
       * Landsnamnen. Samma krav och samma skäl som veckodagarna.
       *
       * Ett land utan namn visar landskoden — "BA" i en rullgardin på
       * värvningssidan — och det är den enda vägen in för en restaurang.
       * Testet finns för det femte landet: raden i COUNTRIES läggs till, och
       * fyra av fem ordböcker glöms.
       */
      for (const country of COUNTRIES) {
        if (!dict.country[country]) missing.push(`${locale}.country.${country}`);
      }
    }

    expect(missing).toEqual([]);
  });

  /**
   * Ansökans felkoder har varsin text på varje språk.
   *
   * `validateApplication()` returnerar en kod och slår upp den i `join.errors`.
   * En kod utan rad ger `undefined` i felrutan — alltså en tom röd ruta på den
   * enda sida en restaurang kan ansöka från.
   */
  it("varje felkod i ansökan har en text på varje språk", () => {
    const codes = Object.keys(sv.join.errors);
    const missing: string[] = [];

    for (const [locale, dict] of Object.entries(TRANSLATIONS)) {
      for (const code of codes) {
        const text = (dict.join.errors as Record<string, string>)[code];
        if (!text) missing.push(`${locale}.join.errors.${code}`);
      }
    }

    expect(missing).toEqual([]);
  });

  /**
   * `{label}` och `{country}` måste stå kvar i översättningen.
   *
   * En översättare som skriver ut "OIB" i klartext i stället för `{label}` ger
   * en kroatisk restauratör rätt ord — och en bosnisk fel. Platshållaren är
   * inte en detalj i formuleringen utan hela skälet till att texten är en mall.
   */
  it("felkoder med variabler behåller sina platshållare", () => {
    const required: Record<string, readonly string[]> = {
      orgNumberInvalid: ["{label}", "{country}"],
      postalCodeInvalid: ["{country}"],
      orgNumberTaken: ["{label}"],
      orgNumberFormat: ["{label}"],
    };

    const missing: string[] = [];

    for (const [locale, dict] of Object.entries(TRANSLATIONS)) {
      for (const [code, placeholders] of Object.entries(required)) {
        const text = (dict.join.errors as Record<string, string>)[code] ?? "";
        for (const placeholder of placeholders) {
          if (!text.includes(placeholder)) {
            missing.push(`${locale}.join.errors.${code} saknar ${placeholder}`);
          }
        }
      }

      // Samma krav på personalytans motsvarighet, som delar formuleringen.
      if (!dict.staff.errors.postalCodeInvalid.includes("{country}")) {
        missing.push(`${locale}.staff.errors.postalCodeInvalid saknar {country}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("kort i terminal heter något annat än kontanter, på varje språk", () => {
    /*
     * Kravet kom från migration 0044 och prövades i @burp/core.
     *
     * `TERMINAL` är restaurangens egen kortläsare. Att den bokförs som en egen
     * leverantör och inte som `CASH` är hela poängen — utan skillnaden tror
     * kassaavstämningen att det ligger sedlar i lådan som inte finns. Men
     * skillnaden måste också SYNAS: en översättning som råkar kalla båda
     * "Gotovina" gör personalens avstämning omöjlig, hur rätt databasen än har.
     */
    for (const [locale, dict] of Object.entries(TRANSLATIONS)) {
      expect(dict.staff.provider.TERMINAL, locale).not.toBe(dict.staff.provider.CASH);
    }
  });

  it("varje navigeringspunkt har en etikett på varje språk", () => {
    // Nycklarna är sektionsnamnen i `staff-nav.tsx`. En ny yta som läggs till
    // där utan en rad här renderar en tom länk.
    const sections = Object.keys(sv.staff.section);
    const missing: string[] = [];

    for (const [locale, dict] of Object.entries(TRANSLATIONS)) {
      for (const section of sections) {
        const label = (dict.staff.section as Record<string, string>)[section];
        if (!label) missing.push(`${locale}.staff.section.${section}`);
      }
    }

    expect(missing).toEqual([]);
  });
});
