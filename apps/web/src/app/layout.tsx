import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { publicEnv } from "@/lib/env";
import "./globals.css";

/*
 * Typsnitten laddas via next/font, som självvärdar filerna och bakar in dem i
 * bygget. Ingen request till Google vid körning: en extra DNS-uppslagning och
 * TLS-handskakning innan texten kan ritas är precis det man inte vill ha på en
 * QR-sida där gästen står och väntar med telefonen i handen.
 */
/*
 * Geist — 123Connect-systemets brödtext och rubriker.
 *
 * `latin-ext` är inte valfritt: Ćevabdžinica, Aščinica och Tri Šešira faller
 * annars tillbaka på ett systemtypsnitt mitt i ett ord, och det syns.
 *
 * Ett typsnitt i stället för två. Systemet använder samma familj till både
 * rubrik och brödtext, med vikten som skillnad.
 */
const geist = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "Burp — beställ mat från restauranger nära dig",
    template: "%s | Burp",
  },
  description:
    "Beställ mat för avhämtning, leverans eller direkt vid bordet. Burp kopplar ihop dig med restauranger i din stad.",
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Burp",
  },
  robots: { index: true, follow: true },
  // iOS läser inte `display: standalone` ur manifestet. Utan det här öppnas
  // Burp i Safari med adressfält även när gästen startat den från hemskärmen.
  appleWebApp: {
    capable: true,
    title: "Burp",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // Papperstonen, inte den röda accenten. Färgen ramar in appen i telefonens
  // systemgränssnitt och ska smälta in i sidan, inte konkurrera med den.
  themeColor: "#f3f4f6",
  width: "device-width",
  initialScale: 1,
  // Gästen sitter vid bordet med en meny på skärmen. Zoom får aldrig låsas —
  // det gör sidan oanvändbar för den som behöver större text.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
