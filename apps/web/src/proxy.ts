import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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
    return NextResponse.redirect(loginUrl);
  }

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
