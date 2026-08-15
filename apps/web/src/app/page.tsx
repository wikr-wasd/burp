import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pickLocale } from "@/lib/i18n";

/**
 * Roten väljer språk åt gästen.
 *
 * `/` har inget innehåll — de publika sidorna ligger under `/sv` och `/en`.
 * Valet görs på `Accept-Language`, alltså det språk webbläsaren redan är
 * inställd på, och inte på var gästen befinner sig: en bosnier på semester i
 * Sverige ska inte tvingas läsa svenska.
 *
 * Omdirigeringen är tillfällig (307), inte permanent. En permanent
 * omdirigering cachas hårt av webbläsare och skulle låsa fast gästen vid det
 * språk hen råkade ha första gången.
 */
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const locale = pickLocale((await headers()).get("accept-language"));
  redirect(`/${locale}`);
}
