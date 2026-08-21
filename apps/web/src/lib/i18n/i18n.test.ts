import { describe, expect, it } from "vitest";
import {
  ORDER_STATUSES,
  PAYMENT_PROVIDERS,
  STAFF_ROLES,
  WEEKDAY_KEYS,
} from "@burp/core";
import {
  DEFAULT_LOCALE,
  fill,
  isLocale,
  LOCALES,
  LOCALE_ALTERNATE_TAGS,
  LOCALE_DATE_TAGS,
  LOCALE_LABELS,
  LOCALE_TAGS,
  dictionary,
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
      // Lånord ur samma rot. "Telefon" är rätt på bosniska.
      "restaurant.phone",
      // "min" är samma förkortning på alla fem språken.
      "staff.kitchen.minutes",
      // Lånordet igen — samma rot, samma stavning.
      "staff.settings.phone",
      "staff.reports.code",
    ],

    de: [
      "errors.notFoundLabel",
      "menu.giftCardPlaceholder",
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
    ],

    en: ["errors.notFoundLabel", "menu.giftCardPlaceholder", "staff.kitchen.minutes"],

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
  for (const section of ["menu", "table", "receipt"] as const) {
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
