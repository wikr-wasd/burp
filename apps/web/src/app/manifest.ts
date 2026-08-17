import type { MetadataRoute } from "next";
import { BRAND_PAPER } from "@/lib/brand-glyph";

/**
 * Webbmanifestet — det som gör Burp installerbar på hemskärmen.
 *
 * Gästen ska kunna lägga Burp bland sina appar utan att gå via en appbutik.
 * Det är också vad som skiljer "en sajt som funkar i mobilen" från något som
 * beter sig som en app: egen ikon, egen startskärm och ingen webbläsarrad.
 *
 * `display: "standalone"` tar bort adressfältet. Det gör QR-flödet lugnare —
 * gästen vid bordet ska se menyn, inte en URL.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Burp — beställ mat",
    short_name: "Burp",
    description:
      "Beställ mat för avhämtning, leverans eller direkt vid bordet. Burp kopplar ihop dig med restauranger i din stad.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "sv-SE",
    dir: "ltr",
    /*
     * Papperstonen, inte den röda accenten — samma värde som `themeColor` i
     * layouten. De två stod på var sitt värde: layouten sa papper och
     * manifestet rött, vilket gav olika systemfärg beroende på om gästen
     * öppnat sajten eller startat den från hemskärmen.
     */
    background_color: BRAND_PAPER,
    theme_color: BRAND_PAPER,
    categories: ["food", "shopping"],
    icons: [
      {
        src: "/pwa-ikon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-ikon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Android ritar egen mask över den här. Motivet måste tåla att kanterna
        // kapas — därför ett centrerat märke på fylld platta, inte text i kant.
        src: "/pwa-ikon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
