import type { Metadata } from "next";
import QRCode from "qrcode";
import { StaffShell } from "@/components/staff/staff-shell";
import { MarketingKit } from "@/components/staff/marketing-kit";
import { CampaignComposer } from "@/components/staff/campaign-composer";
import { CAMPAIGN_TEMPLATES, type CampaignTemplate } from "@/lib/campaign-types";
import { getCampaignOverview } from "@/lib/campaigns";
import { requireStaff } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { DEFAULT_LOCALE_BY_COUNTRY, dictionary, fill, LOCALE_LABELS } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

/**
 * Marknadsföringsmaterial.
 *
 * ── Varför det här är ett VERKTYG och inte en tjänst ────────────────────────
 *
 * "Vi marknadsför er via Google, TikTok, Instagram och WhatsApp" är en
 * byråtjänst: annonskonton, kreativproduktion, budgethantering och rapportering
 * per kund. Det är arbete Burp inte kan leverera vid sidan av utvecklingen, och
 * som skadar förtroendet hos de första restaurangerna om det säljs och inte
 * levereras.
 *
 * Det som ger merparten av värdet till en bråkdel av arbetet är att göra
 * materialet färdigt: en affisch att skriva ut, en ruta att fotografera, och
 * texter som går att klistra in. Restaurangen publicerar själv — den har redan
 * konton, följare och en telefon.
 *
 * ── Varför texterna är på gästernas språk och inte personalens ──────────────
 *
 * Resten av personalytan följer `staff.locale`, alltså den inloggades eget
 * språk. Det gör den för att den som arbetar ska förstå. Men ett inlägg skrivs
 * till GÄSTERNA, och en tysk chef i Sarajevo ska inte råka publicera tyska till
 * bosniska följare. Texterna kommer därför ur restaurangens LAND —
 * `DEFAULT_LOCALE_BY_COUNTRY` — och sidan säger vilket språk de är på.
 */

export const metadata: Metadata = {
  title: "Marknadsföring",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const staff = await requireStaff(["owner", "manager"]);
  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, slug, city, city_slug, cuisines")
    .eq("id", staff.restaurantId)
    .single();

  const t = dictionary(staff.locale).staff;

  /*
   * Adressen utan språk, med flit.
   *
   * `/r/{stad}/{slug}` väljer språk åt besökaren efter webbläsarens
   * inställning (se app/r/[city]/[slug]/page.tsx). En affisch i ett fönster
   * läses av både en granne och en turist, och den som skriver ut den ska inte
   * behöva välja vilken av dem som ska förstå.
   */
  const url = `${publicEnv.NEXT_PUBLIC_SITE_URL}/r/${restaurant?.city_slug}/${restaurant?.slug}`;

  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    // Samma höga felkorrigering som bordsdekalerna: en affisch i ett fönster
    // blir solblekt och en story komprimeras av appen som visar den.
    errorCorrectionLevel: "H",
  });

  const marketingLocale = DEFAULT_LOCALE_BY_COUNTRY[staff.country];
  const guestTexts = dictionary(marketingLocale).marketing;

  /*
   * Utskicken: saldot, mottagarantalet och historiken.
   *
   * Bara ANTALET mottagare når sidan — adresserna hämtas först i
   * serveråtgärden, när ett utskick faktiskt görs. En sida som råkar bära
   * gästernas e-postadresser i sin nyttolast är en läcka utan angripare.
   */
  const campaigns = await getCampaignOverview(staff.restaurantId);

  // Mallarna på gästernas språk, färdiga att skriva om.
  const campaignTemplates = Object.fromEntries(
    CAMPAIGN_TEMPLATES.map((template) => [
      template,
      {
        subject: fill(guestTexts[`campaign${template}`], {
          name: restaurant?.name ?? staff.restaurantName,
        }),
        body: guestTexts[`campaign${template}Body`],
      },
    ]),
  ) as Record<CampaignTemplate, { subject: string; body: string }>;

  return (
    <StaffShell
      staff={staff}
      current="marknadsforing"
      title={t.section.marknadsforing}
      intro={t.marketing.intro}
      width="narrow"
    >
      <MarketingKit
        restaurantName={restaurant?.name ?? staff.restaurantName}
        city={restaurant?.city ?? ""}
        url={url}
        qrSvg={qrSvg}
        labels={t.marketing}
        guestTexts={guestTexts}
        guestLanguage={LOCALE_LABELS[marketingLocale]}
      />

      {/*
        Utskicken efter materialet, inte före.

        Affischen och texterna fungerar från dag ett. Ett utskick kräver
        gäster som sagt ja OCH handlat hos restaurangen — alltså en lista som
        fylls med tiden. Den som just öppnat ska mötas av det som går att
        använda i dag.
      */}
      <section className="mt-14 border-t border-[var(--rule)] pt-10">
        <h2 className="font-display text-2xl">{t.campaigns.title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{t.campaigns.intro}</p>

        <CampaignComposer
          labels={t.campaigns}
          templates={campaignTemplates}
          credits={campaigns.credits}
          audience={campaigns.audience}
          history={campaigns.history}
          guestLanguage={LOCALE_LABELS[marketingLocale]}
        />
      </section>
    </StaffShell>
  );
}
