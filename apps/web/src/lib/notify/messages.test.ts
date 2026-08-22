import { COUNTRY_INFO } from "@burp/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE_BY_COUNTRY, dictionary } from "@/lib/i18n";
import {
  applicationEmail,
  escapeHtml,
  invitationEmail,
  orderEmail,
  type OrderNotice,
} from "./messages";

/**
 * Breven är den enda delen av notissystemet som är värd att enhetstesta.
 *
 * Att en HTTP-post mot en leverantör fungerar avgörs av leverantören. Att
 * beloppet står i restaurangens valuta, att klockslaget står i restaurangens
 * tidszon och att ett rättnamn inte kan bryta sig ut ur markupen avgörs av oss.
 */

/**
 * Det hårda mellanslaget mellan beloppet och valutasymbolen.
 *
 * `formatMoney` sätter det med flit, så att "24,50 KM" aldrig bryts över två
 * rader. Skrivs ut som en escape här — ett hårt mellanslag i källkoden ser
 * identiskt ut med ett vanligt och gör felet omöjligt att se i en diff.
 */
const NBSP = "\u00A0";

const BASE: OrderNotice = {
  restaurantName: "Ćevabdžinica Željo",
  tableLabel: "7 · Uteserveringen",
  type: "TABLE",
  // 18:30 i Sarajevo är 16:30 UTC i augusti.
  placedAt: new Date("2026-08-16T16:30:00Z"),
  timeZone: COUNTRY_INFO.BA.timeZone,
  lines: [
    { quantity: 2, name: "Ćevapi", note: "utan lök", options: ["10 st"] },
    { quantity: 1, name: "Jogurt", note: null, options: [] },
  ],
  totalOre: 2450,
  currency: "BAM",
  note: null,
  scheduledFor: null,
  dashboardUrl: "https://burp.se/dashboard",
};

describe("orderEmail", () => {
  it("skriver klockslaget i restaurangens tidszon, inte serverns", () => {
    const message = orderEmail(BASE);
    expect(message.text).toContain("18:30");
    expect(message.text).not.toContain("16:30");
  });

  /*
   * Mellanrummet mellan beloppet och symbolen är ett HÅRT mellanslag.
   * `formatMoney` sätter det med flit, så att "24,50 KM" aldrig bryts över två
   * rader. Ett test som skriver ett vanligt mellanslag faller på något som ser
   * identiskt ut i utskriften — vilket det gjorde första gången.
   */
  it("skriver beloppet i restaurangens valuta", () => {
    const message = orderEmail(BASE);
    expect(message.subject).toContain(`24,50${NBSP}KM`);
    expect(message.text).toContain(`Att betala: 24,50${NBSP}KM`);
  });

  /*
   * Serbiska dinarer har noll decimaler. Beloppet lagras ändå i para, som allt
   * annat: 245 000 para är 2 450 dinarer. Ett brev som skriver "2.450,00" har
   * hårdkodat två decimaler i stället för att läsa valutans.
   */
  it("följer valutans decimaler — dinar visas utan", () => {
    const message = orderEmail({ ...BASE, currency: "RSD", totalOre: 245_000 });
    expect(message.text).toContain(`2.450${NBSP}дин.`);
    expect(message.text).not.toContain("2.450,00");
  });

  it("tar med antal, tillval och radens anteckning", () => {
    const message = orderEmail(BASE);
    expect(message.text).toContain("2× Ćevapi (10 st) — utan lök");
    expect(message.text).toContain("1× Jogurt");
  });

  it("namnger bordet när det finns och beställningstypen annars", () => {
    expect(orderEmail(BASE).subject).toContain("7 · Uteserveringen");
    expect(orderEmail({ ...BASE, tableLabel: null, type: "PICKUP" }).subject).toContain(
      "Avhämtning",
    );
  });

  it("visar hämttiden för en förbeställning", () => {
    const message = orderEmail({
      ...BASE,
      scheduledFor: new Date("2026-08-16T17:00:00Z"),
    });
    expect(message.text).toContain("Hämtas: 19:00");
  });

  it("utelämnar gästens meddelande när det inte finns", () => {
    expect(orderEmail(BASE).text).not.toContain("Meddelande från gästen");
    expect(orderEmail({ ...BASE, note: "Vi är allergiska mot nötter" }).text).toContain(
      "Meddelande från gästen: Vi är allergiska mot nötter",
    );
  });

  /*
   * Rättnamnet är text någon annan skrivit. Kan det stänga ett element kan
   * det också rita om brevet — och vad en mailklient gör med brustet markup
   * är oförutsägbart.
   */
  it("escapar rättnamn i HTML-versionen", () => {
    const message = orderEmail({
      ...BASE,
      lines: [{ quantity: 1, name: "Pizza <script>alert(1)</script>", note: null, options: [] }],
    });

    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("har både text och HTML", () => {
    const message = orderEmail(BASE);
    expect(message.text.length).toBeGreaterThan(0);
    expect(message.html).toContain("<div");
  });
});

describe("applicationEmail", () => {
  const APPLICATION = {
    restaurantName: "Tri Šešira",
    city: "Beograd",
    country: "Serbien",
    orgNumber: "123456789",
    contactEmail: "kontakt@trisesira.rs",
    contactPhone: "+381 11 000 000",
    description: "Kafana i Skadarlija sedan 1864.",
    backofficeUrl: "https://burp.se/backoffice/restauranger",
  };

  it("namnger restaurangen och orten i ämnesraden", () => {
    const message = applicationEmail(APPLICATION);
    expect(message.subject).toContain("Tri Šešira");
    expect(message.subject).toContain("Beograd");
  });

  it("tar med kontaktuppgifterna", () => {
    const message = applicationEmail(APPLICATION);
    expect(message.text).toContain("kontakt@trisesira.rs");
    expect(message.text).toContain("+381 11 000 000");
    expect(message.text).toContain("123456789");
  });

  it("klarar en ansökan utan beskrivning", () => {
    const message = applicationEmail({ ...APPLICATION, description: "" });
    expect(message.text).toContain("(ingen beskrivning)");
  });
});

describe("invitationEmail", () => {
  /*
   * Brevet gick på svenska till alla fram till 2026-08-23, oavsett var
   * restaurangen låg. Det var den sista personalytan som satt kvar.
   */
  const bjudIn = (country: "BA" | "SE") => {
    const texts = dictionary(DEFAULT_LOCALE_BY_COUNTRY[country]);
    return invitationEmail({
      restaurantName: "Ćevabdžinica Željo",
      roleLabel: texts.staff.role.kitchen,
      link: "https://burp.se/personal/inbjudan/abc",
      texts: texts.email,
    });
  };

  it("skriver brevet på restaurangens landsspråk", () => {
    const bosniska = bjudIn("BA");
    expect(bosniska.subject).toContain("Pozvani ste");
    expect(bosniska.text).toContain("Kuhar");
    expect(bosniska.subject).not.toContain("inbjuden");
  });

  it("skriver svenska för en svensk restaurang", () => {
    expect(bjudIn("SE").subject).toContain("Du har blivit inbjuden");
  });

  it("namnger restaurangen i både ämnesrad och brödtext", () => {
    const brev = bjudIn("BA");
    expect(brev.subject).toContain("Ćevabdžinica Željo");
    expect(brev.text).toContain("Ćevabdžinica Željo");
  });

  /*
   * Den gamla koden gjorde roleLabel.toLowerCase() för att meningen skulle
   * flyta på svenska. På tyska ger det "koch" — ett stavfel i det första
   * brev en nyanställd får från oss.
   */
  it("behåller rollens versal", () => {
    const tyska = dictionary("de");
    const brev = invitationEmail({
      restaurantName: "Gasthaus",
      roleLabel: tyska.staff.role.kitchen,
      link: "https://burp.se/personal/inbjudan/abc",
      texts: tyska.email,
    });
    expect(brev.text).toContain(tyska.staff.role.kitchen);
    expect(brev.text).not.toContain(tyska.staff.role.kitchen.toLowerCase());
  });

  it("escapar restaurangnamnet i HTML-versionen", () => {
    const texts = dictionary("bs");
    const brev = invitationEmail({
      restaurantName: "<script>x</script>",
      roleLabel: texts.staff.role.owner,
      link: "https://burp.se/personal/inbjudan/abc",
      texts: texts.email,
    });
    expect(brev.html).not.toContain("<script>");
    expect(brev.html).toContain("&lt;script&gt;");
  });

  it("har både text och HTML, och länken i båda", () => {
    const brev = bjudIn("BA");
    expect(brev.text).toContain("https://burp.se/personal/inbjudan/abc");
    expect(brev.html).toContain("https://burp.se/personal/inbjudan/abc");
  });
});

describe("escapeHtml", () => {
  it("ersätter alla fem tecknen", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });

  it("escapar ampersanden först, så att en entitet inte dubbelescapas fel", () => {
    expect(escapeHtml("A & <b>")).toBe("A &amp; &lt;b&gt;");
  });
});
