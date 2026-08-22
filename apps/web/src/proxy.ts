import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, isCachedRoute } from "@/lib/csp";

/**
 * Rapportläge. Byt till "Content-Security-Policy" för att slå på på riktigt —
 * men först efter att de ISR-cachade sidorna fått ett svar på nonce-frågan.
 * Se `lib/csp.ts` och docs/TODO.md.
 */
const CSP_HEADER = "Content-Security-Policy-Report-Only";

/**
 * Förnyar Supabase-sessionen på varje request och skyddar dashboard-ytorna.
 *
 * Server components kan inte skriva cookies, så utan det här steget skulle en
 * utgången access-token aldrig bytas mot en ny och personalen loggas ut mitt i
 * en lunchrush.
 *
 * Proxy är FÖRSTA lagret, aldrig det enda. Route handlers verifierar rollen
 * på nytt och RLS är sista ordet (samma tre lager som 123Connect).
 *
 * Filen hette `middleware.ts` fram till Next 16, som bytte konventionen till
 * `proxy.ts`. Beteendet är detsamma.
 */

/** Ytor som kräver inloggad personal. */
const STAFF_PATHS = ["/dashboard", "/kok", "/backoffice"];

export default async function proxy(request: NextRequest) {
  /*
   * Nonce och CSP byggs FÖRE sessionen.
   *
   * Next läser nonce:n ur CSP-huvudet på REQUESTEN — både `Content-Security-
   * Policy` och `-Report-Only` fungerar (se `app-render.js`) — och stämplar
   * sina egna skript med den. Sätts huvudet bara på svaret får Next aldrig
   * veta om den, och varje skript hade rapporterats som blockerat.
   *
   * De ISR-cachade sidorna får ingen nonce alls: deras HTML återanvänds i en
   * timme och en nonce i den är gammal från andra besökaren. Se `lib/csp.ts`.
   */
  const cached = isCachedRoute(request.nextUrl.pathname);
  const nonce = cached ? null : Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = buildCsp({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    mapTileUrl:
      process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  });

  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set(CSP_HEADER, csp);
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // Samma `requestHeaders` som ovan. Byggs svaret om utan dem tappas
          // nonce:n, och Next stämplar inte sina skript med den.
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() — inte getSession(). getSession läser cookien rakt av utan att
  // verifiera signaturen mot Supabase; en förfalskad cookie skulle passera.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && STAFF_PATHS.some((prefix) => path.startsWith(prefix))) {
    const loginUrl = new URL("/logga-in", request.url);
    loginUrl.searchParams.set("next", path);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set(CSP_HEADER, csp);
    return redirect;
  }

  /*
   * Rapportläge, inte blockering.
   *
   * En för snäv CSP ger inget felmeddelande — den ger en sida där något tyst
   * slutar fungera. Listan över ursprung i `lib/csp.ts` är läst ur koden, och
   * läst är inte samma sak som bevisad. Rapporterna säger vilket som.
   */
  response.headers.set(CSP_HEADER, csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Allt utom statiska filer och bilder.
     *
     * /t/:token är MED avsikt inkluderat trots att gästen är anonym: en
     * inloggad restaurangägare som skannar sitt eget bord ska få sin session
     * förnyad som vanligt.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
