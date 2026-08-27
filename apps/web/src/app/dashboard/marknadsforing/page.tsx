import type { Metadata } from "next";
import QRCode from "qrcode";
import { StaffShell } from "@/components/staff/staff-shell";
import { MarketingKit } from "@/components/staff/marketing-kit";
import { requireStaff } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { DEFAULT_LOCALE_BY_COUNTRY, dictionary, LOCALE_LABELS } from "@/lib/i18n";
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
    </StaffShell>
  );
}
