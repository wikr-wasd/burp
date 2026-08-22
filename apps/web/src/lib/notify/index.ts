import "server-only";

import { COUNTRY_INFO, type CountryCode, type CurrencyCode } from "@burp/core";
import { publicEnv, serverEnv } from "@/lib/env";
import { dictionary, staffLocale } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailOutcome } from "./email";
import {
  applicationEmail,
  guestOrderEmail,
  orderEmail,
  type OrderNoticeLine,
} from "./messages";
import { sendPush } from "./push";

/**
 * Notiser.
 *
 * Fram till nu visste ingen att en order kommit om ingen stirrade på
 * köksskärmen, och ingen visste att en restaurang ansökt om ingen råkade öppna
 * backoffice. En marknadsplats där beställningen bara syns för den som redan
 * tittar är inte en marknadsplats.
 *
 * Anropas via `after()` från route handlern respektive serveråtgärden, så att
 * ingenting av det här ligger mellan gästen och svaret. Funktionerna kastar
 * aldrig — ett brev som inte gick fram loggas och orden står kvar.
 *
 * Service role används med stöd av undantag 3 i `createAdminClient()`: det här
 * är ett bakgrundsjobb utan användarsammanhang. Gästen som lade ordern har
 * ingen `auth.uid()` och skulle aldrig få läsa personalens adresser. Varje
 * fråga filtrerar därför själv på `restaurant_id`, som regeln kräver.
 */

/** Roller som ska få veta att en order kommit in. */
const NOTIFIED_ROLES = ["owner", "manager"] as const;

export async function notifyNewOrder(orderId: string): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, restaurant_id, type, table_id, note, total_ore, currency, placed_at, created_at, scheduled_for",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      console.error(`[notis] Ordern ${orderId} kunde inte läsas: ${error?.message ?? "saknas"}`);
      return;
    }

    const restaurantId = order.restaurant_id as string;

    const [{ data: restaurant }, { data: items }, { data: table }] = await Promise.all([
      supabase
        .from("restaurants")
        .select("name, email, country")
        .eq("id", restaurantId)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select("id, name_snapshot, quantity, note")
        .eq("order_id", orderId)
        .eq("restaurant_id", restaurantId),
      order.table_id
        ? supabase
            .from("tables")
            .select("table_number, zone")
            .eq("id", order.table_id as string)
            .eq("restaurant_id", restaurantId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (!restaurant) {
      console.error(`[notis] Restaurangen till order ${orderId} kunde inte läsas.`);
      return;
    }

    const itemRows = items ?? [];

    // Tillvalen hämtas i en fråga för alla rader. En fråga per rad hade blivit
    // ett anrop per rätt i varje order som läggs.
    const { data: optionRows } = itemRows.length
      ? await supabase
          .from("order_item_options")
          .select("order_item_id, name_snapshot")
          .in(
            "order_item_id",
            itemRows.map((item) => item.id as string),
          )
          .eq("restaurant_id", restaurantId)
      : { data: [] };

    const lines: OrderNoticeLine[] = itemRows.map((item) => ({
      quantity: item.quantity as number,
      name: item.name_snapshot as string,
      note: (item.note as string | null) ?? null,
      options: (optionRows ?? [])
        .filter((option) => option.order_item_id === item.id)
        .map((option) => option.name_snapshot as string),
    }));

    const placedAtRaw = (order.placed_at ?? order.created_at) as string | null;

    const message = orderEmail({
      restaurantName: restaurant.name as string,
      tableLabel: table
        ? [table.table_number, table.zone].filter(Boolean).join(" · ")
        : null,
      type: order.type as "TABLE" | "PICKUP" | "DELIVERY",
      placedAt: placedAtRaw ? new Date(placedAtRaw) : new Date(),
      timeZone: COUNTRY_INFO[(restaurant.country as CountryCode) ?? "BA"].timeZone,
      lines,
      totalOre: order.total_ore as number,
      currency: order.currency as CurrencyCode,
      note: (order.note as string | null) ?? null,
      scheduledFor: order.scheduled_for ? new Date(order.scheduled_for as string) : null,
      // Till orderlistan, inte till översikten. Brevet handlar om en
      // beställning; länken ska landa där den går att göra något åt.
      dashboardUrl: `${publicEnv.NEXT_PUBLIC_SITE_URL}/dashboard/order`,
    });

    const recipients = await orderRecipients(restaurantId, restaurant.email as string | null);

    /*
     * Brev OCH push, inte det ena eller det andra.
     *
     * De löser olika problem. Brevet är underlaget som ligger kvar i en inkorg
     * och går att gå tillbaka till; pushen är larmet som når fram i samma
     * minut. En restaurang utan uppkopplad telefon behöver det första, en som
     * står mitt i en rush behöver det andra.
     *
     * Parallellt, eftersom ingen väntar på den andra. Båda körs efter svaret.
     */
    const [emailOutcome, pushOutcome] = await Promise.all([
      sendEmail(recipients, message),
      sendPush(restaurantId, {
        title: table
          ? `Ny beställning · bord ${table.table_number as string}`
          : "Ny beställning",
        body: lines
          .map((line) => `${line.quantity}× ${line.name}`)
          .join(", ")
          .slice(0, 160),
        url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/dashboard/order`,
        // Order-id som tagg: en gäst som ändrar sin beställning lämnar inte två
        // notiser efter sig, men två olika order larmar var för sig.
        tag: orderId,
      }),
    ]);

    report(emailOutcome, `order ${orderId}`);

    if (!pushOutcome.delivered && pushOutcome.reason === "NO_SUBSCRIBERS") {
      // Ingen har slagit på notiser än. Inget fel — men värt att veta för den
      // som undrar varför telefonen är tyst.
      console.info(`[push] Ingen enhet prenumererar för restaurang ${restaurantId}.`);
    }
  } catch (error) {
    // En notis får aldrig bli ett fel gästen ser. Ordern ligger redan i
    // databasen när den här körs.
    console.error(`[notis] Oväntat fel för order ${orderId}:`, error);
  }
}

/**
 * Vem som ska ha brevet om en ny order.
 *
 * Restaurangens egen adress först — det är den som står i kassan och som
 * restaurangen själv valt. Ägare och chefer läggs till, eftersom en
 * restaurangadress ofta är en inkorg ingen öppnar en fredag kväll.
 *
 * Kockar och servitörer får inget: de står i lokalen och har köksskärmen.
 */
async function orderRecipients(
  restaurantId: string,
  restaurantEmail: string | null,
): Promise<string[]> {
  const supabase = createAdminClient();

  const { data: staffRows } = await supabase
    .from("staff")
    .select("user_id")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .in("role", NOTIFIED_ROLES);

  const userIds = (staffRows ?? []).map((row) => row.user_id as string);

  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("email").in("id", userIds)
    : { data: [] };

  return [
    restaurantEmail,
    ...(profiles ?? []).map((profile) => profile.email as string | null),
  ].filter((address): address is string => Boolean(address));
}

export interface ApplicationDetails {
  restaurantName: string;
  city: string;
  country: CountryCode;
  orgNumber: string;
  email: string;
  phone: string;
  description: string;
}

/**
 * Brevet till Burp när någon ansöker via /anslut.
 *
 * Går till `BURP_OPS_EMAIL`. Är den inte satt skickas ingenting — och det är
 * rätt: en ansökan ska inte tystna, men den ska inte heller skickas till en
 * gissad adress.
 */
export async function notifyRestaurantApplication(
  details: ApplicationDetails,
): Promise<void> {
  try {
    const opsEmail = serverEnv().BURP_OPS_EMAIL;

    const message = applicationEmail({
      restaurantName: details.restaurantName,
      city: details.city,
      country: COUNTRY_INFO[details.country].name,
      orgNumber: details.orgNumber,
      contactEmail: details.email,
      contactPhone: details.phone,
      description: details.description,
      backofficeUrl: `${publicEnv.NEXT_PUBLIC_SITE_URL}/backoffice/restauranger`,
    });

    report(
      await sendEmail(opsEmail ? [opsEmail] : [], message),
      `ansökan från ${details.restaurantName}`,
    );
  } catch (error) {
    console.error("[notis] Oväntat fel för restaurangansökan:", error);
  }
}

/**
 * Skriver utfallet i loggen.
 *
 * NOT_CONFIGURED är inget fel — det är utvecklingsmiljön utan nyckel, och
 * brevet står redan i loggen. NO_RECIPIENTS är däremot värt en varning: en
 * restaurang utan en enda adress får aldrig veta att en order kommit.
 */
function report(outcome: EmailOutcome, subject: string): void {
  if (outcome.delivered) return;

  if (outcome.reason === "NOT_CONFIGURED") return;

  if (outcome.reason === "NO_RECIPIENTS") {
    console.warn(`[notis] Ingen mottagare för ${subject}. Brevet skickades inte.`);
    return;
  }

  console.error(`[notis] Utskicket för ${subject} misslyckades: ${outcome.detail ?? ""}`);
}

/* ── Utkorgen ────────────────────────────────────────────────────────────── */

/** Hur många brev en körning tar. Håller jobbet under Vercels tidsgräns. */
const NOTICE_BATCH = 50;

/**
 * Hur många gånger ett brev får misslyckas innan det får ligga.
 *
 * En adress som inte finns kommer aldrig att finnas. Utan taket hade jobbet
 * försökt på samma rad varje kvart i evighet, och kön aldrig blivit tom —
 * vilket är samma sak som att inte kunna se att något är fel.
 */
const NOTICE_MAX_ATTEMPTS = 5;

export interface NoticeRun {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Tömmer notiskön (migration 0049).
 *
 * Raderna skrivs av en trigger i samma transaktion som statusändringen, så den
 * här funktionen kan aldrig missa en notis — bara vara sen med den. Det är den
 * avvägning som valdes 2026-08-22: köksskärmen skriver direkt mot Supabase, och
 * hellre en fördröjd notis än ett mellanlager som upprepar RLS-kontroller.
 *
 * Kastar aldrig. Ett brev som inte gick fram kvitteras som ett försök med sitt
 * fel, och nästa körning tar raden igen.
 */
export async function sendPendingNotices(): Promise<NoticeRun> {
  const supabase = createAdminClient();
  const run: NoticeRun = { sent: 0, failed: 0, skipped: 0 };

  const { data: pending, error } = await supabase
    .from("notification_outbox")
    .select("id, order_id, kind, recipient_id, attempts")
    .is("sent_at", null)
    .lt("attempts", NOTICE_MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(NOTICE_BATCH);

  if (error) {
    console.error(`[notis] Kön kunde inte läsas: ${error.message}`);
    return run;
  }

  for (const row of pending ?? []) {
    try {
      const outcome = await sendOneNotice(supabase, row);
      if (outcome === "SENT") run.sent += 1;
      else run.skipped += 1;
    } catch (cause) {
      run.failed += 1;
      const message = cause instanceof Error ? cause.message : String(cause);
      await acknowledge(supabase, row.id, message.slice(0, 500));
      console.error(`[notis] Brev ${row.id} misslyckades: ${message}`);
    }
  }

  return run;
}

type PendingNotice = {
  id: string;
  order_id: string;
  kind: string;
  recipient_id: string;
  attempts: number;
};

/**
 * Ett brev ur kön.
 *
 * `SKIPPED` när det inte finns någon adress att skriva till. Raden kvitteras
 * ändå som skickad: ett konto utan adress kommer inte att få en, och en rad
 * som ligger kvar för alltid gör kön obrukbar som larm.
 */
async function sendOneNotice(
  supabase: ReturnType<typeof createAdminClient>,
  row: PendingNotice,
): Promise<"SENT" | "SKIPPED"> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, restaurant_id, prep_minutes, guest_locale")
    .eq("id", row.order_id)
    .maybeSingle();

  if (!order) return "SKIPPED";

  // Adressen ur `profiles` och inte ur auth-API:t. Triggern i migration 0002
  // skapar profilen när kontot registreras, så raden finns alltid — och det är
  // samma källa som personalens brev använder.
  const [{ data: restaurant }, { data: profile }] = await Promise.all([
    supabase
      .from("restaurants")
      .select("name, country")
      .eq("id", order.restaurant_id as string)
      .maybeSingle(),
    supabase.from("profiles").select("email").eq("id", row.recipient_id).maybeSingle(),
  ]);

  const address = (profile?.email as string | null) ?? null;

  if (!restaurant || !address) {
    await acknowledge(supabase, row.id);
    return "SKIPPED";
  }

  /*
   * Språket kommer från ordern, inte från en header.
   *
   * Brevet skrivs när gästen inte tittar, så `Accept-Language` finns inte att
   * läsa. `guest_locale` frystes när hon beställde. Är den null — en order
   * lagd före migration 0049 — faller vi tillbaka på restaurangens land, vilket
   * är samma ärliga gissning som personalytorna gör.
   */
  const locale = staffLocale(order.guest_locale, restaurant.country as CountryCode);
  const texts = dictionary(locale).email;

  const message = guestOrderEmail({
    kind: row.kind === "ORDER_READY" ? "ORDER_READY" : "ORDER_ACCEPTED",
    restaurantName: restaurant.name as string,
    prepMinutes: (order.prep_minutes as number | null) ?? null,
    orderUrl: new URL(`/order/${order.id}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString(),
    texts,
  });

  const outcome = await sendEmail([address], message);

  /*
   * `NOT_CONFIGURED` är inte ett fel att försöka om.
   *
   * Det betyder att `RESEND_API_KEY` saknas — lokalt, eller i en miljö där
   * breven aldrig var tänkta att gå ut. Att låta raden ligga kvar och räknas
   * upp fem gånger hade fyllt kön med rader som beskriver en avsiktlig
   * konfiguration, och gjort den obrukbar som larm. Brevet loggas i stället av
   * `sendEmail` själv.
   */
  if (!outcome.delivered && outcome.reason !== "NOT_CONFIGURED") {
    throw new Error(`${outcome.reason}${outcome.detail ? `: ${outcome.detail}` : ""}`);
  }

  await acknowledge(supabase, row.id);
  return outcome.delivered ? "SENT" : "SKIPPED";
}

/**
 * Kvitterar en rad i kön.
 *
 * Egen funktion för att felet ska LÄSAS. Anropet låg först inline med sitt
 * `error` ignorerat, och funktionen saknade dessutom `grant execute` till
 * service_role — kön fylldes på utan att någonsin tömmas, och det syntes inte
 * på något annat än att jobbet rapporterade samma rader varje körning. En
 * kvittering som misslyckas tyst betyder att brevet skickas igen nästa gång.
 */
async function acknowledge(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  error: string | null = null,
): Promise<void> {
  const { error: rpcError } = await supabase.rpc("mark_notice_sent", {
    p_id: id,
    p_error: error,
  });

  if (rpcError) {
    console.error(`[notis] Kunde inte kvittera ${id}: ${rpcError.message}`);
  }
}
