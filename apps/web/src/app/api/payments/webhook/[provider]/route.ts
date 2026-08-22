import { after, NextResponse } from "next/server";
import { statusAfterRefund, type PaymentProviderId } from "@burp/core";
import { notifyNewOrder } from "@/lib/notify";
import {
  paymentProvider,
  PaymentProviderUnavailableError,
  WebhookVerificationError,
  type ProviderEvent,
} from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { nullableArg } from "@/lib/supabase/types";

/**
 * Betalleverantörens webhook.
 *
 * Det här är den enda platsen där en kortorder blir en riktig order. Gästen
 * betalar i sin telefon, leverantören bekräftar hit, och först då lyfts ordern
 * ur `DRAFT` och köket får sitt brev. Det är avsiktligt: en order som köket ser
 * är en order som är betald.
 *
 * Tre saker gör anropet ofarligt, och alla tre behövs:
 *
 *   1. SIGNATUREN. Requesten kommer från internet. Utan verifierad signatur kan
 *      vem som helst markera vilken order som helst som betald.
 *   2. IDEMPOTENSEN. Leverantörer garanterar leverans MINST en gång. Samma
 *      händelse kommer igen efter en timeout eller när någon trycker "skicka
 *      om" i portalen. `payment_events` gör dubbletten till en krock i
 *      databasen i stället för en bedömning i kod.
 *   3. BELOPPET. Leverantören säger vad den debiterat; databasen jämför mot
 *      ordersumman och vägrar om det inte räcker (`confirm_order_payment`).
 *
 * Service role används därför att det inte finns något användarsammanhang alls
 * — det är precis det undantag regel 5 pekar ut. Varje fråga nedan filtrerar
 * själv på betalningen den fått av leverantören.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Context {
  params: Promise<{ provider: string }>;
}

const KNOWN: readonly string[] = ["STRIPE", "MONRI"];

export async function POST(request: Request, context: Context) {
  const { provider: raw } = await context.params;
  const providerId = raw.toUpperCase();

  if (!KNOWN.includes(providerId)) {
    return NextResponse.json({ error: "Okänd leverantör" }, { status: 404 });
  }

  /*
   * Rå kropp, inte tolkad JSON.
   *
   * Signaturen räknas på byten som de kom. Att läsa `request.json()` och sedan
   * serialisera om skulle ändra nyckelordning och blanksteg, och signaturen
   * hade slutat stämma — ett fel som ser ut som fel hemlighet.
   */
  const body = await request.text();

  let event: ProviderEvent;
  try {
    event = await paymentProvider(providerId as PaymentProviderId).parseWebhook(
      body,
      request.headers,
    );
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      // 400 så att leverantören slutar försöka. En felaktig signatur blir inte
      // rätt av att skickas om.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PaymentProviderUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 501 });
    }
    throw error;
  }

  if (event.kind === "IGNORED") {
    // Leverantörerna skickar långt fler händelsetyper än vi bryr oss om. En
    // okänd typ är inte ett fel — svarar vi 400 skickas den om i tre dygn.
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  const supabase = createAdminClient();

  /* ── Har vi sett den här händelsen förut? ──────────────────────────────── */

  const { error: duplicateError } = await supabase.from("payment_events").insert({
    provider: providerId,
    event_id: event.eventId,
    kind: event.kind,
    payload: event.raw as never,
  });

  if (duplicateError) {
    // 23505 = unikt index. Händelsen är redan behandlad; kvittera med 200 så
    // att leverantören slutar skicka om den.
    if (duplicateError.code === "23505") {
      return NextResponse.json({ duplicate: true }, { status: 200 });
    }
    return NextResponse.json({ error: duplicateError.message }, { status: 500 });
  }

  /* ── Kontot bytte status ───────────────────────────────────────────────── */

  if (event.kind === "ACCOUNT_UPDATED") {
    if (!event.externalAccountId) {
      return NextResponse.json({ ignored: true }, { status: 200 });
    }

    await supabase
      .from("restaurant_payment_accounts")
      .update({ status: event.accountIsActive ? "ACTIVE" : "DISABLED" })
      .eq("provider", providerId)
      .eq("external_account_id", event.externalAccountId);

    return NextResponse.json({ ok: true }, { status: 200 });
  }

  /* ── Slå upp betalningen ───────────────────────────────────────────────── */

  if (!event.reference) {
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, order_id, restaurant_id, amount_ore, status")
    .eq("provider", providerId)
    .eq("provider_reference", event.reference)
    .maybeSingle();

  if (!payment) {
    // Betalningen finns inte hos oss. Det händer när en händelse gäller ett
    // annat system på samma konto, och det är inget vi ska klaga på.
    return NextResponse.json({ unknown_payment: true }, { status: 200 });
  }

  await supabase.from("payment_events").update({ payment_id: payment.id }).eq("provider", providerId).eq("event_id", event.eventId);

  switch (event.kind) {
    case "PAYMENT_SUCCEEDED": {
      const wasAlreadySettled = payment.status === "CAPTURED";

      const { data: status, error } = await supabase.rpc("confirm_order_payment", {
        p_payment_id: payment.id,
        // Leverantören säger inte alltid hur kortet lästes. Se `nullableArg`.
        p_method: nullableArg(event.method),
      });

      if (error) {
        // Beloppet täckte inte ordern, eller så gick statusövergången inte.
        // 500 gör att leverantören försöker igen — vilket är rätt, eftersom en
        // betald order som inte lagts är värre än en omsändning.
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Leverantörens egen avgift är restaurangens kostnad, inte ett avdrag
      // från Burps 3,4 % (öppen fråga 1, besvarad).
      if (event.providerFeeOre !== null) {
        await supabase
          .from("fees")
          .update({ provider_fee_ore: event.providerFeeOre })
          .eq("order_id", payment.order_id);
      }

      // Brevet till köket går bara första gången. En omsänd händelse ska inte
      // ge ännu en biljett på samma mat.
      if (!wasAlreadySettled) {
        after(() => notifyNewOrder(payment.order_id));
      }

      return NextResponse.json({ ok: true, status }, { status: 200 });
    }

    case "PAYMENT_FAILED":
    case "PAYMENT_CANCELLED": {
      const { error } = await supabase.rpc("fail_order_payment", {
        p_payment_id: payment.id,
        // Leverantören anger inte alltid ett skäl. Se `nullableArg`.
        p_reason: nullableArg(event.failureReason),
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    case "REFUND_SUCCEEDED": {
      // Motbokningen skapades av personalen och ligger som PENDING tills
      // leverantören bekräftat. Den äldsta väntande raden är den här händelsen
      // — flera samtidiga återbetalningar på samma betalning skulle annars
      // kunna avslutas i fel ordning, och beloppen är ändå desamma.
      const { data: pending } = await supabase
        .from("refunds")
        .select("id")
        .eq("payment_id", payment.id)
        .eq("status", "PENDING")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!pending) {
        // Återbetalningen startades i leverantörens portal, inte hos oss.
        // Statusen på betalningen ska ändå följa med.
        if (event.amountOre !== null) {
          const next = statusAfterRefund(payment.amount_ore, event.amountOre);
          if (payment.status !== next) {
            await supabase.from("payments").update({ status: next }).eq("id", payment.id);
          }
        }
        return NextResponse.json({ ok: true, external: true }, { status: 200 });
      }

      // Statusen räknas i databasen ur summan av lyckade motbokningar, inte ur
      // vad leverantören råkar skicka med i just den här händelsen.
      const { data: status, error } = await supabase.rpc("settle_refund", {
        p_refund_id: pending.id,
        p_provider_reference: event.reference,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, status }, { status: 200 });
    }
  }
}
