"use server";

import { revalidatePath } from "next/cache";
import { isCampaignTemplate } from "@/lib/campaign-types";
import { requireStaff } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { dictionary, DEFAULT_LOCALE_BY_COUNTRY, fill } from "@/lib/i18n";
import { escapeHtml } from "@/lib/notify/messages";
import { sendEmail } from "@/lib/notify/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Utskicket: bokför först, skicka sedan.
 *
 * `start_campaign()` (migration 0076) gör allt som rör pengar i EN
 * transaktion — skapar utskicket, låser mottagarlistan och drar krediterna.
 * Ett avbrott mitt i får inte lämna krediter dragna för brev som aldrig
 * skickades, eller tvärtom.
 *
 * Själva breven skickas efteråt, ETT PER MOTTAGARE. Aldrig ett brev med alla
 * adresser i: en gäst ska inte få veta vilka andra som äter på samma ställe,
 * och en `to`-rad med hundra adresser är en läcka utan angripare.
 *
 * Det som inte gick fram bokförs tillbaka. Restaurangen betalar för brev som
 * lämnade huset, inte för leverantörens dåliga dag.
 */

export interface CampaignResult {
  ok: boolean;
  message?: string;
  /** Hur många brev som faktiskt gick i väg. */
  delivered?: number;
}

/** Så många brev åt gången. En leverantör vill inte ha hundra samtidigt. */
const BATCH = 10;

export async function sendCampaign(input: {
  template: string;
  subject: string;
  body: string;
}): Promise<CampaignResult> {
  const staff = await requireStaff(["owner", "manager"]);

  if (!isCampaignTemplate(input.template)) {
    return { ok: false, message: "Okänd mall." };
  }

  const subject = input.subject.trim();
  const body = input.body.trim();

  if (subject.length < 1 || subject.length > 120) {
    return { ok: false, message: "Ämnesraden ska vara 1–120 tecken." };
  }
  if (body.length < 1 || body.length > 4000) {
    return { ok: false, message: "Brevtexten ska vara 1–4000 tecken." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("start_campaign", {
    p_restaurant_id: staff.restaurantId,
    p_template: input.template,
    p_subject: subject,
    p_body: body,
  });

  // Databasen bär reglerna: rollen, saldot och att det finns mottagare. Dess
  // besked är därför det besked som ska visas, inte ett eget ord ovanpå.
  if (error) return { ok: false, message: error.message };

  const rows = (data ?? []) as unknown as { campaign_id: string; email: string }[];
  const campaignId = rows[0]?.campaign_id;

  if (!campaignId || rows.length === 0) {
    return { ok: false, message: "Utskicket skapades inte." };
  }

  /*
   * Brevet skrivs på GÄSTERNAS språk, inte på personalens.
   *
   * Resten av personalytan följer `staff.locale` — den som arbetar ska förstå.
   * Men det här brevet läses av gästerna, och en norsk chef i Sarajevo ska
   * inte råka skicka norska till bosniska gäster. Samma val som
   * marknadsföringsmaterialet gör.
   */
  const guestLocale = DEFAULT_LOCALE_BY_COUNTRY[staff.country];
  const t = dictionary(guestLocale).marketing;

  const footer = fill(t.campaignFooter, {
    name: staff.restaurantName,
    url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/konto/uppgifter`,
  });

  let delivered = 0;

  for (let index = 0; index < rows.length; index += BATCH) {
    const batch = rows.slice(index, index + BATCH);

    const outcomes = await Promise.all(
      batch.map((row) =>
        sendEmail([row.email], {
          subject,
          text: `${body}\n\n—\n${footer}`,
          html: asHtml(subject, body, footer),
        }),
      ),
    );

    delivered += outcomes.filter((outcome) => outcome.delivered).length;
  }

  const failed = rows.length - delivered;

  /*
   * Bokföringen efteråt går med service role.
   *
   * service-role: hela plattformen — `refund_campaign_credits()` och
   * `finish_campaign()` skriver i en logg som ingen roll får skriva i, just
   * för att den ska vara oföränderlig. Anropet är begränsat till det utskick
   * som precis skapades, och utskicket hör redan till rätt restaurang genom
   * `start_campaign()`.
   */
  const admin = createAdminClient();

  if (failed > 0) {
    await admin.rpc("refund_campaign_credits", {
      p_campaign_id: campaignId,
      p_failed: failed,
    });
  } else {
    await admin.rpc("finish_campaign", { p_campaign_id: campaignId });
  }

  revalidatePath("/dashboard/marknadsforing");

  return { ok: true, delivered };
}

/**
 * Brevets HTML.
 *
 * Restaurangens text är FRITEXT och escapas därför hela vägen — en ägare som
 * klistrar in ett `<` ska inte kunna skicka något annat än ett `<`. Radbrytens
 * översätts till stycken efteråt, på den redan escapade texten.
 *
 * Samma nedtonade form som resten av breven: ingen bild, inga färger, ingen
 * spårpixel. Ett brev som ser ut som reklam hamnar i skräpposten, och ett brev
 * som räknar öppningar är en fråga vi inte ställt gästen.
 */
function asHtml(subject: string, body: string, footer: string): string {
  const paragraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((part) => `<p style="margin:0 0 12px">${part.replace(/\n/g, "<br>")}</p>`)
    .join("\n  ");

  return `<div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.6;color:#111827">
  <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">${escapeHtml(subject)}</h1>
  ${paragraphs}
  <p style="font-size:12px;color:#6b7280;margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:12px">${escapeHtml(footer)}</p>
</div>`;
}
