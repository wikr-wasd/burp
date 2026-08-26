import { formatMoney, type CurrencyCode } from "@burp/core";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Breven Burp skickar.
 *
 * Ren modul: inga databasanrop, ingen nätverkstrafik, ingen `serverEnv()`. Det
 * är därför den går att enhetstesta — och den enda delen av notissystemet som
 * är värd att testa. Att en HTTP-post mot en leverantör fungerar avgörs av
 * leverantören, inte av oss.
 *
 * Språket är svenska UTOM i `guestOrderEmail()`, som går till gästen och tar
 * sina texter utifrån. Personalytorna är svenska (se CLAUDE.md) och ett brev om
 * en ny order är en personalyta som råkar levereras i en inkorg. Köket ska
 * inte behöva byta språk för att en gäst gjorde det.
 */

export interface OrderNoticeLine {
  quantity: number;
  name: string;
  note: string | null;
  options: string[];
}

export interface OrderNotice {
  restaurantName: string;
  /** "Bord 7 · Uteserveringen", eller null för avhämtning och leverans. */
  tableLabel: string | null;
  type: "TABLE" | "PICKUP" | "DELIVERY";
  placedAt: Date;
  /** Restaurangens tidszon. Klockslaget ska vara det köket ser på väggen. */
  timeZone: string;
  lines: OrderNoticeLine[];
  totalOre: number;
  currency: CurrencyCode;
  /** Gästens meddelande till köket. */
  note: string | null;
  /** Hämttid för en förbeställning. */
  scheduledFor: Date | null;
  dashboardUrl: string;
}

export interface ApplicationNotice {
  restaurantName: string;
  city: string;
  country: string;
  orgNumber: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
  backofficeUrl: string;
}

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

const TYPE_LABELS: Record<OrderNotice["type"], string> = {
  TABLE: "Bordsbeställning",
  PICKUP: "Avhämtning",
  DELIVERY: "Leverans",
};

/**
 * Klockslaget i restaurangens tidszon.
 *
 * Servern kör i UTC på Vercel. Utan tidszonen står det 16:30 i ett brev om en
 * order som lades 18:30 i Sarajevo, och personalen letar efter en beställning
 * som inte finns.
 */
function clockAt(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

/**
 * Dagen i restaurangens tidszon.
 *
 * Bokningen kan ligga veckor fram, till skillnad från en order. Utan datum
 * säger "19:00" ingenting — och `clockAt` ensam hade gett en notis som ser ut
 * att gälla i kväll.
 */
function dayAt(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
}

/**
 * Escapar text som ska in i HTML.
 *
 * Rättnamn, bordsnamn och gästens meddelande är text någon annan skrivit. En
 * rätt som heter `Pizza <3` får inte kunna stänga ett element — och det
 * mailklienten gör med brustet markup är oförutsägbart.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** En orderrad som en läsbar mening: "2× Ćevapi (10 st) — utan lök". */
function lineToText(line: OrderNoticeLine): string {
  const options = line.options.length > 0 ? ` (${line.options.join(", ")})` : "";
  const note = line.note ? ` — ${line.note}` : "";
  return `${line.quantity}× ${line.name}${options}${note}`;
}

/**
 * Brevet till restaurangen när en order kommer in.
 *
 * Bär allt köket behöver för att agera utan att öppna dashboarden: vad, var,
 * när och hur mycket. Länken finns för den som ändå vill kvittera direkt.
 * Ett brev som bara säger "du har en ny order" tvingar fram en inloggning i
 * det ögonblick personalen har som minst tid.
 */
export function orderEmail(notice: OrderNotice): EmailMessage {
  const where = notice.tableLabel ?? TYPE_LABELS[notice.type];
  const time = clockAt(notice.placedAt, notice.timeZone);
  const total = formatMoney(notice.totalOre, notice.currency);

  const subject = `Ny beställning · ${where} · ${total}`;

  const scheduled = notice.scheduledFor
    ? `Hämtas: ${clockAt(notice.scheduledFor, notice.timeZone)}`
    : null;

  const textParts = [
    `${notice.restaurantName} — ny beställning ${time}`,
    "",
    `${TYPE_LABELS[notice.type]}${notice.tableLabel ? ` · ${notice.tableLabel}` : ""}`,
    scheduled,
    "",
    ...notice.lines.map(lineToText),
    "",
    `Att betala: ${total}`,
    notice.note ? `\nMeddelande från gästen: ${notice.note}` : null,
    "",
    notice.dashboardUrl,
  ].filter((part): part is string => part !== null);

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:520px">
  <p style="font-size:13px;color:#6b7280;margin:0 0 4px">${escapeHtml(notice.restaurantName)}</p>
  <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 2px">Ny beställning ${escapeHtml(time)}</h1>
  <p style="font-size:14px;color:#4b5563;margin:0 0 16px">${escapeHtml(TYPE_LABELS[notice.type])}${
    notice.tableLabel ? ` · ${escapeHtml(notice.tableLabel)}` : ""
  }${scheduled ? `<br>${escapeHtml(scheduled)}` : ""}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
${notice.lines
  .map(
    (line) => `    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(lineToText(line))}</td>
    </tr>`,
  )
  .join("\n")}
    <tr>
      <td style="padding:10px 0;font-weight:700">Att betala: ${escapeHtml(total)}</td>
    </tr>
  </table>${
    notice.note
      ? `\n  <p style="font-size:14px;background:#fef2f2;border-radius:10px;padding:12px;margin:0 0 16px"><strong>Meddelande från gästen:</strong> ${escapeHtml(
          notice.note,
        )}</p>`
      : ""
  }
  <p style="margin:16px 0 0"><a href="${escapeHtml(
    notice.dashboardUrl,
  )}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">Öppna beställningen</a></p>
</div>`;

  return { subject, text: textParts.join("\n"), html };
}

/**
 * Brevet till Burp när en restaurang ansöker via /anslut.
 *
 * Ansökan låg tidigare och väntade i backoffice tills någon råkade titta.
 * En restaurang som söker och inte hör något på en vecka söker inte igen.
 */
export function applicationEmail(notice: ApplicationNotice): EmailMessage {
  const subject = `Ny restaurangansökan · ${notice.restaurantName}, ${notice.city}`;

  const rows: [string, string][] = [
    ["Restaurang", notice.restaurantName],
    ["Ort", `${notice.city}, ${notice.country}`],
    ["Org.nr", notice.orgNumber],
    ["E-post", notice.contactEmail || "—"],
    ["Telefon", notice.contactPhone || "—"],
  ];

  const text = [
    "Ny restaurangansökan.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    notice.description || "(ingen beskrivning)",
    "",
    notice.backofficeUrl,
  ].join("\n");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:520px">
  <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">Ny restaurangansökan</h1>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
${rows
  .map(
    ([label, value]) => `    <tr>
      <td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap">${escapeHtml(label)}</td>
      <td style="padding:6px 0">${escapeHtml(value)}</td>
    </tr>`,
  )
  .join("\n")}
  </table>
${
  notice.description
    ? `  <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:16px 0 0">${escapeHtml(
        notice.description,
      )}</p>`
    : ""
}
  <p style="margin:16px 0 0"><a href="${escapeHtml(
    notice.backofficeUrl,
  )}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">Granska ansökan</a></p>
</div>`;

  return { subject, text, html };
}

/* ── Inbjudan till personalen ────────────────────────────────────────────── */

export interface InvitationNotice {
  restaurantName: string;
  /** Rollen, skriven som den visas för människor. */
  roleLabel: string;
  link: string;
  /**
   * Texterna på restaurangens landsspråk.
   *
   * Inte på den inbjudandes: den som bjuder in har ett eget språkval, men
   * brevet går till någon som ännu inte har ett konto och som ska arbeta i det
   * land restaurangen ligger i.
   */
  texts: Dictionary["email"];
}

/**
 * Brevet den inbjudna får.
 *
 * Säger vem som bjudit in, till vad, och att länken har ett slutdatum. Det
 * sista är inte formalia: en person som klickar dag åtta möts annars av ett
 * avslag utan förklaring, och hör av sig till restaurangen i stället för att be
 * om en ny länk.
 *
 * Adressen står inte i brevet. Det går till den, och att upprepa den ger inget
 * — men gör brevet till en bekräftelse på att adressen finns hos Burp, om det
 * hamnar hos fel person.
 *
 * Rollen skrivs som ordboken stavar den. Den tidigare versionen gjorde
 * `roleLabel.toLowerCase()` för att meningen skulle flyta på svenska — vilket
 * på tyska ger "koch" i stället för "Koch", ett stavfel i det första brev en
 * nyanställd får från oss.
 */
export function invitationEmail(notice: InvitationNotice): EmailMessage {
  const { texts, restaurantName, roleLabel } = notice;

  const subject = fill(texts.invitationSubject, { restaurant: restaurantName });

  const text = [
    fill(texts.invitationBody, { restaurant: restaurantName, role: roleLabel }),
    "",
    texts.invitationOpenLink,
    notice.link,
    "",
    texts.invitationExpiry,
  ].join("\n");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:520px">
  <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">${escapeHtml(
    fill(texts.invitationHeading, { restaurant: restaurantName }),
  )}</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${escapeHtml(
    fill(texts.invitationBody, { restaurant: restaurantName, role: roleLabel }),
  )}</p>
  <p style="margin:0 0 20px"><a href="${escapeHtml(
    notice.link,
  )}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${escapeHtml(
    texts.invitationCta,
  )}</a></p>
  <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0">${escapeHtml(
    texts.invitationExpiry,
  )}</p>
</div>`;

  return { subject, text, html };
}

/* ── Brevet till gästen ──────────────────────────────────────────────────── */

export interface GuestOrderNotice {
  kind: "ORDER_ACCEPTED" | "ORDER_READY";
  restaurantName: string;
  /** Kökets uppskattning i minuter, eller null om ingen satt någon. */
  prepMinutes: number | null;
  /** Absolut adress till gästens kvitto. */
  orderUrl: string;
  /** Texterna på gästens eget språk — fryst på ordern, se migration 0049. */
  texts: Dictionary["email"];
}

/**
 * Brevet gästen får när köket tagit emot ordern, och när maten är klar.
 *
 * Det enda brevet i produkten som skrivs på gästens språk. De andra går till
 * restaurangen eller till Burp och är svenska; det här går till någon som
 * kanske aldrig sett ett svenskt ord.
 *
 * Kort med flit. Det läses på en telefon i gånghastighet, och allt utom
 * beskedet och länken är i vägen. Ingen ordersammanfattning: den står på
 * kvittosidan, som länken leder till.
 */
export function guestOrderEmail(notice: GuestOrderNotice): EmailMessage {
  const { texts, restaurantName } = notice;

  const subject =
    notice.kind === "ORDER_READY"
      ? texts.readySubject
      : fill(texts.acceptedSubject, { restaurant: restaurantName });

  const body =
    notice.kind === "ORDER_READY"
      ? fill(texts.readyBody, { restaurant: restaurantName })
      : notice.prepMinutes !== null
        ? fill(texts.acceptedBody, { n: notice.prepMinutes })
        : texts.acceptedBodyNoTime;

  const text = [body, "", texts.viewOrder + ":", notice.orderUrl, "", texts.footer].join("\n");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:520px">
  <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">${escapeHtml(
    subject,
  )}</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${escapeHtml(body)}</p>
  <p style="margin:0 0 20px"><a href="${escapeHtml(
    notice.orderUrl,
  )}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${escapeHtml(
    texts.viewOrder,
  )}</a></p>
  <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0">${escapeHtml(texts.footer)}</p>
</div>`;

  return { subject, text, html };
}

/* ── Bordsbokning ────────────────────────────────────────────────────────── */

export interface ReservationNotice {
  restaurantName: string;
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  /** När sällskapet kommer. */
  startsAt: Date;
  timeZone: string;
  tableLabel: string;
  note: string | null;
  /** Vart personalen ska för att se den. */
  dashboardUrl: string;
}

/**
 * Brevet om en ny bokning.
 *
 * Svenskt som de andra breven hit: mottagaren är restaurangens inkorg, och
 * texterna i `notify/` är personalens ytor på Burps eget språk tills
 * `staff.locale` går att läsa utan en session — brevet skrivs av ett jobb som
 * inte har någon.
 *
 * Rubriken bär TID och ANTAL. Det är de två talen som avgör om raden behöver
 * läsas nu eller i morgon, och de ska synas i en notisrad på en låst skärm.
 */
export function reservationEmail(notice: ReservationNotice): EmailMessage {
  const time = clockAt(notice.startsAt, notice.timeZone);
  const day = dayAt(notice.startsAt, notice.timeZone);

  const subject = `Ny bokning · ${day} ${time} · ${notice.partySize} pers`;

  const textParts = [
    `${notice.restaurantName} — ny bordsbokning`,
    "",
    `${day} ${time}`,
    `${notice.partySize} gäster · ${notice.tableLabel}`,
    `${notice.guestName}${notice.guestPhone ? ` · ${notice.guestPhone}` : ""}`,
    notice.note ? `
Meddelande från gästen: ${notice.note}` : null,
    "",
    notice.dashboardUrl,
  ].filter((part): part is string => part !== null);

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:520px">
  <p style="font-size:13px;color:#6b7280;margin:0 0 4px">${escapeHtml(notice.restaurantName)}</p>
  <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 2px">Ny bokning ${escapeHtml(day)} ${escapeHtml(time)}</h1>
  <p style="font-size:14px;color:#4b5563;margin:0 0 16px">${escapeHtml(String(notice.partySize))} gäster · ${escapeHtml(notice.tableLabel)}</p>
  <p style="font-size:15px;margin:0 0 16px">${escapeHtml(notice.guestName)}${
    notice.guestPhone ? ` · ${escapeHtml(notice.guestPhone)}` : ""
  }</p>${
    notice.note
      ? `
  <p style="font-size:14px;color:#4b5563;margin:0 0 16px"><em>${escapeHtml(notice.note)}</em></p>`
      : ""
  }
  <p style="margin:0"><a href="${escapeHtml(notice.dashboardUrl)}" style="color:#dc2626;font-weight:600">Se bokningarna</a></p>
</div>`;

  return { subject, text: textParts.join("\n"), html };
}
