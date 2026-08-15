import { notFound } from "next/navigation";
import { isLocale, LOCALE_TAGS, LOCALES } from "@/lib/i18n";

/**
 * Språklagret runt de publika ytorna.
 *
 * Bara språken i `LOCALES` släpps igenom. Utan kontrollen skulle `/de/sarajevo`
 * rendera svenska texter under en adress som påstår sig vara tysk — och Google
 * skulle indexera den som en egen sida med dubblerat innehåll.
 *
 * OBS: `<html lang>` sätts i rotlayouten och kan inte läsa språket härifrån —
 * Next tillåter bara ett `<html>`, och det ligger utanför det här segmentet.
 * Språket märks därför ut på ett omslutande element i stället. Skärmläsare
 * respekterar `lang` var det än sitter, och Google går på `hreflang`-länkarna
 * som sidorna själva anger.
 */

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <div lang={LOCALE_TAGS[locale]}>{children}</div>;
}
