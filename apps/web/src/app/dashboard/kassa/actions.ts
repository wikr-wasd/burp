"use server";

import { revalidatePath } from "next/cache";
import {
  isStaffRegistered,
  parseAmount,
  settleCash,
  settlesOutsideBurp,
  type CurrencyCode,
  type PaymentProviderId,
} from "@burp/core";
import { requireStaff } from "@/lib/auth";
import { paymentProvider, PaymentProviderError } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Registrering av kontantbetalning (öppen fråga 6).
 *
 * Servitören, chefen och ägaren får kvittera. Köket får inte — det hanterar
 * mat, inte kassa — och RLS i migration 0024 säger samma sak. `requireStaff`
 * här finns för att ge ett begripligt svar i stället för ett tomt databasfel.
 *
 * Klienten skickar beloppet som text, inte som öre. `parseAmount()` tolkar det
 * i restaurangens valuta: "1200" i ett serbiskt fält är 1200 dinarer, inte
 * 12,00. Att låta klienten räkna om till minsta enhet hade betytt att varje
 * fält behöver veta hur många decimaler valutan har — och det är exakt den
 * kunskapen som ligger i @burp/core just för att inte spridas ut.
 *
 * Summan tas INTE från klienten som ett färdigt öresbelopp av samma skäl som
 * priser aldrig gör det: ordersumman läses här ur databasen, och avvikelsen
 * mot den räknas fram på servern.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const REGISTER_ROLES = ["owner", "manager", "staff"] as const;

/**
 * Registrerar det gästen betalade med, kontant eller i restaurangens terminal.
 *
 * Leverantören kommer från klienten och kontrolleras därför här: bara de två
 * betalsätt personalen får registrera för hand släpps igenom. Ett `STRIPE` i
 * fältet hade annars gett en betalrad som ser ut att komma från en leverantör
 * men aldrig passerat någon. RLS i migration 0044 säger samma sak en gång till.
 */
export async function registerPayment(
  orderId: string,
  amountInput: string,
  provider: PaymentProviderId = "CASH",
): Promise<ActionResult> {
  const staff = await requireStaff(REGISTER_ROLES);

  if (!isStaffRegistered(provider)) {
    return { ok: false, message: "Bara kontant och kort i terminal kan registreras här." };
  }

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, total_ore, currency, restaurant_id")
    .eq("id", orderId)
    .maybeSingle();

  // Ordern kan saknas antingen för att den inte finns eller för att RLS gömmer
  // en annan restaurangs order. Svaret är detsamma — vi bekräftar inte att ett
  // främmande order-id existerar.
  if (!order || order.restaurant_id !== staff.restaurantId) {
    return { ok: false, message: "Ordern hittades inte." };
  }

  if (order.status !== "COMPLETED") {
    return {
      ok: false,
      message: "Bara en slutförd order kan kvitteras. Markera den som serverad först.",
    };
  }

  const currency = order.currency as CurrencyCode;
  const receivedOre = parseAmount(amountInput, currency);

  if (receivedOre === null) {
    return { ok: false, message: "Beloppet gick inte att tolka." };
  }

  /*
   * Avstämningen sker mot vad som ÅTERSTÅR, inte mot hela notan.
   *
   * Ett presentkort kan ha betalat en del av ordern. Räknades avvikelsen mot
   * hela notan skulle varje sådan order se ut att ha betalats för lite med
   * exakt presentkortets belopp — och kassaavstämningen bli meningslös just på
   * de order där den behövs mest.
   */
  const { data: existing } = await supabase
    .from("payments")
    .select("amount_ore")
    .eq("order_id", order.id)
    .neq("status", "FAILED");

  const paidOre = (existing ?? []).reduce((sum, row) => sum + row.amount_ore, 0);
  const dueOre = order.total_ore - paidOre;

  if (dueOre <= 0) {
    return { ok: false, message: "Ordern är redan betald." };
  }

  // Kastar på noll, negativa belopp och på allt som inte är ett heltal i
  // valutans minsta enhet. Fångas här så att felet blir en mening i
  // gränssnittet i stället för en 500:a.
  let settlement;
  try {
    settlement = settleCash(receivedOre, dueOre);
  } catch {
    return { ok: false, message: "Beloppet måste vara större än noll." };
  }

  const { error } = await supabase.from("payments").insert({
    order_id: order.id,
    restaurant_id: order.restaurant_id,
    amount_ore: receivedOre,
    // Valutan fryses på ordern (migration 0020). Betalningen ärver den i
    // stället för att läsa restaurangens nuvarande — byter restaurangen valuta
    // ska en gammal nota fortfarande stämma.
    currency,
    provider,
    // `method` är hur betalningen gick till, `provider` vem som tog emot den.
    // För en terminal är kortet närvarande i lokalen — samma ord som
    // betalbranschen använder, och det som skiljer den från ett kort gästen
    // skrev in i sin telefon.
    method: provider === "CASH" ? "cash" : "card_present",
    status: "CAPTURED",
    captured_at: new Date().toISOString(),
    idempotency_key: crypto.randomUUID(),
    // Avvikelsen sparas som den räknades, inte som den skrevs in. Vill någon
    // veta varför kassan gick plus 3 fening en fredag står svaret här.
    provider_payload: {
      settlement: settlement.kind,
      difference_ore: settlement.differenceOre,
      order_total_ore: order.total_ore,
      // Vad som återstod när kassan kvitterade. Utan den går avvikelsen inte
      // att förklara i efterhand på en order som delbetalats med presentkort.
      due_ore: dueOre,
      registered_by: staff.userId,
    },
  });

  if (error) {
    // 23505 = unique_violation. Det enda unika indexet som kan slå här är
    // `payments_staff_registered_key`: samma betalsätt är redan registrerat på
    // ordern, antingen för att någon hann först eller för att knappen trycktes
    // två gånger. Databasen är det som avgör, inte gränssnittet — därför ett
    // begripligt svar i stället för felkoden.
    //
    // Det andra betalsättet går fortfarande att lägga till: en nota kan delas
    // mellan sedlar och terminal, och indexet är per order OCH leverantör.
    if (error.code === "23505") {
      return {
        ok: false,
        message:
          provider === "CASH"
            ? "Ordern är redan kvitterad kontant."
            : "Ordern är redan kvitterad i terminalen.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/kassa");
  return { ok: true };
}

/* ── Bordets gemensamma nota ─────────────────────────────────────────────── */

/**
 * Kvitterar hela bordets nota i ett svep.
 *
 * Fyra personer vid samma bord beställer var för sig i sina egna telefoner men
 * delar nota — det är hela poängen med att sessionen hör till bordet. Kassan
 * krävde förut fyra kvitteringar av en servitör som tagit emot ett handslag.
 *
 * Fördelningen per order sker i databasen och inte här. Avgiften, momsen och en
 * framtida återbetalning räknas per order, så böckerna måste veta hur mycket av
 * beloppet som hörde till vilken — och den räkningen ska ske i samma
 * transaktion som raderna skrivs.
 */
export async function settleTableSession(
  sessionId: string,
  amountInput: string,
  provider: PaymentProviderId = "CASH",
): Promise<ActionResult> {
  const staff = await requireStaff(REGISTER_ROLES);

  if (!isStaffRegistered(provider)) {
    return { ok: false, message: "Bara kontant och kort i terminal kan registreras här." };
  }

  const supabase = await createClient();

  // Sessionen måste vara restaurangens egen. RLS gömmer andras, så ett okänt id
  // och ett främmande id ger samma svar — vi bekräftar inte att det finns.
  const { data: session } = await supabase
    .from("table_sessions")
    .select("id, restaurant_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.restaurant_id !== staff.restaurantId) {
    return { ok: false, message: "Bordets nota hittades inte." };
  }

  const currency = staff.currency as CurrencyCode;
  const receivedOre = parseAmount(amountInput, currency);

  if (receivedOre === null || receivedOre <= 0) {
    return { ok: false, message: "Beloppet gick inte att tolka." };
  }

  const { error } = await createAdminClient().rpc("settle_table_session", {
    p_session_id: sessionId,
    p_received_ore: receivedOre,
    p_actor_id: staff.userId,
    p_provider: provider,
  });

  if (error) {
    // 23505 = det unika indexet på ett betalsätt per order. Någon hann kvittera
    // en av bordets order först.
    if (error.code === "23505") {
      return { ok: false, message: "En av bordets order är redan kvitterad." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/kassa");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Stänger bordets nota utan att kvittera något.
 *
 * Sällskapet gick utan att beställa, eller betalade på ett sätt som inte hör
 * hemma i Burp. Notan ska ändå kunna avslutas — annars står bordet som upptaget
 * i Översikten för alltid, och nästa sällskap ärver sessionen.
 */
export async function closeTableSession(sessionId: string): Promise<ActionResult> {
  const staff = await requireStaff(REGISTER_ROLES);
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("table_sessions")
    .select("id, restaurant_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.restaurant_id !== staff.restaurantId) {
    return { ok: false, message: "Bordets nota hittades inte." };
  }

  const { error } = await createAdminClient().rpc("close_table_session", {
    p_session_id: sessionId,
    p_actor_id: staff.userId,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/kassa");
  revalidatePath("/dashboard");
  return { ok: true };
}

/* ── Återbetalning ───────────────────────────────────────────────────────── */

/**
 * Betalar tillbaka hela eller en del av en nota.
 *
 * Formen är en MOTBOKNING. Beloppet på betalningen skrivs aldrig om — det som
 * hände står kvar, och rättelsen är en egen rad. Samma princip som
 * `order_events` och `loyalty_transactions`, och den som migration 0024
 * utlovade: "en felkvittering rättas med en motbokning när återbetalningsflödet
 * byggs".
 *
 * Ägare och chef, inte servitören. Att lämna tillbaka pengar är ett ekonomiskt
 * beslut, samma gräns som statistiksidan drar.
 *
 * Ordningen är avsiktlig: raden skrivs FÖRST, sedan anropas leverantören. Går
 * anropet fel markeras raden som misslyckad. Motsatt ordning — leverantören
 * först — hade kunnat lämna pengar utbetalda utan en rad som säger det, om
 * processen dog mellan de två stegen.
 */
export async function refundPayment(
  paymentId: string,
  amountInput: string,
  reason: string,
): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  if (!reason.trim()) {
    return { ok: false, message: "Skriv varför notan betalas tillbaka." };
  }

  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, restaurant_id, amount_ore, currency, provider, provider_reference, status")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment || payment.restaurant_id !== staff.restaurantId) {
    return { ok: false, message: "Betalningen hittades inte." };
  }

  const currency = payment.currency as CurrencyCode;
  const amountOre = parseAmount(amountInput, currency);

  if (amountOre === null || amountOre <= 0) {
    return { ok: false, message: "Beloppet gick inte att tolka." };
  }

  const admin = createAdminClient();

  const { data: refundId, error: requestError } = await admin.rpc("request_refund", {
    p_payment_id: payment.id,
    p_amount_ore: amountOre,
    p_reason: reason.trim(),
    p_actor_id: staff.userId,
  });

  if (requestError || typeof refundId !== "string") {
    return { ok: false, message: requestError?.message ?? "Motbokningen kunde inte skapas." };
  }

  // Kontant, terminal och presentkort är redan avslutade av `request_refund` —
  // det finns ingen leverantör som ska bekräfta att sedlarna lämnades över disk
  // eller att kortet drogs tillbaka i kortläsaren.
  if (settlesOutsideBurp(payment.provider as PaymentProviderId)) {
    revalidatePath("/dashboard/kassa");
    return { ok: true };
  }

  const { data: account } = await admin
    .from("restaurant_payment_accounts")
    .select("provider, external_account_id, currency")
    .eq("restaurant_id", staff.restaurantId)
    .eq("provider", payment.provider)
    .maybeSingle();

  if (!account) {
    await admin.rpc("fail_refund", {
      p_refund_id: refundId,
      p_reason: "Restaurangens betalkonto hittades inte.",
    });
    return { ok: false, message: "Betalkontot hittades inte hos leverantören." };
  }

  if (!payment.provider_reference) {
    await admin.rpc("fail_refund", {
      p_refund_id: refundId,
      p_reason: "Betalningen saknar referens hos leverantören.",
    });
    return { ok: false, message: "Betalningen saknar referens hos leverantören." };
  }

  try {
    const result = await paymentProvider(payment.provider as PaymentProviderId).refund({
      // Leverantörens referens, inte vår. `refunds.provider_reference` fylls
      // sedan med motbokningens egen.
      reference: payment.provider_reference,
      amountOre,
      // Egen nyckel per motbokning. Två återbetalningar på samma nota ska gå
      // igenom båda; ett dubbeltryck på samma ska inte.
      idempotencyKey: refundId,
      account: {
        provider: account.provider as PaymentProviderId,
        externalAccountId: account.external_account_id,
        currency: account.currency as CurrencyCode,
        isActive: true,
      },
      reason: reason.trim(),
    });

    // Leverantören kan svara direkt eller bekräfta med en webhook. Är den redan
    // klar avslutas raden här; annars gör webhooken det.
    if (result.isSettled) {
      await admin.rpc("settle_refund", {
        p_refund_id: refundId,
        p_provider_reference: result.reference,
      });
    }
  } catch (error) {
    await admin.rpc("fail_refund", {
      p_refund_id: refundId,
      p_reason: error instanceof Error ? error.message : "Okänt fel hos leverantören.",
    });
    return {
      ok: false,
      message:
        error instanceof PaymentProviderError
          ? error.message
          : "Leverantören kunde inte genomföra återbetalningen.",
    };
  }

  revalidatePath("/dashboard/kassa");
  return { ok: true };
}
