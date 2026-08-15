import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { publicEnv } from "@/lib/env";
import "./globals.css";

/*
 * Typsnitten laddas via next/font, som självvärdar filerna och bakar in dem i
 * bygget. Ingen request till Google vid körning: en extra DNS-uppslagning och
 * TLS-handskakning innan texten kan ritas är precis det man inte vill ha på en
 * QR-sida där gästen står och väntar med telefonen i handen.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

// Display-antikvan. Bara en vikt — den används enbart till rubriker.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument",
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
  themeColor: "#f7f3ec",
  width: "device-width",
  initialScale: 1,
  // Gästen sitter vid bordet med en meny på skärmen. Zoom får aldrig låsas —
  // det gör sidan oanvändbar för den som behöver större text.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
