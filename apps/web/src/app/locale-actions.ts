"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n";

/**
 * Gästens språkval, på ytorna som inte har språket i adressen.
 *
 * QR-sidan, kvittot och `/konto` är noindex och saknar därför en egen URL per
 * språk. Ett språkbyte där kan alltså inte vara en länk till `/de/...` — det
 * finns ingen sådan adress att gå till. Valet skrivs i stället i kakan, som
 * `requestLocale()` läser före `Accept-Language`.
 *
 * Serveråtgärd och inte en route handler: en route handler hade behövt en
 * `next`-parameter med sidans adress i, och en öppen vidarebefordran är
 * precis vad `lib/redirect.ts` finns för att stoppa. Här finns ingen adress
 * att skicka in — sidan ritas om där den står.
 *
 * Ett okänt språk skriver ingenting. Kakan ska innehålla en av fem koder,
 * aldrig det klienten råkade skicka.
 */
export async function setGuestLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  // Sidan läser språket på servern. Utan det här steget står den kvar på det
  // gamla språket tills gästen laddar om själv.
  revalidatePath("/", "layout");
}
