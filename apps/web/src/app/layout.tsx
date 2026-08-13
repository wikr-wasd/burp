import type { Metadata, Viewport } from "next";
import { publicEnv } from "@/lib/env";
import "./globals.css";

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
};

export const viewport: Viewport = {
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
  // Gästen sitter vid bordet med en meny på skärmen. Zoom får aldrig låsas —
  // det gör sidan oanvändbar för den som behöver större text.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
