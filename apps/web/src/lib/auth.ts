import "server-only";

import { redirect } from "next/navigation";
import { COUNTRY_INFO, type CountryCode, type CurrencyCode, type StaffRole } from "@burp/core";
import { dictionary, type Dictionary } from "./i18n";
import { staffLocale, type Locale } from "./i18n/config";
import { ROLE_HOME } from "./auth-roles";
import { getPlatformAdmin } from "./platform";
import { createClient } from "./supabase/server";

export { ROLE_HOME };

/**
 * Rollhämtning för personalytorna.
 *
 * Rollen läses ur `staff`-tabellen, som är navet i hela RLS-modellen. Det är
 * medvetet samma källa som policyerna använder — hade gränssnittet läst rollen
 * någon annanstans ifrån kunde de två komma i otakt, och en användare se en
 * knapp som databasen sedan vägrar utföra.
 *
 * Det här är LAGER TVÅ av tre. Proxy:n (lager ett) släpper in en inloggad
 * användare på /dashboard; den här funktionen avgör om hen hör till någon
 * restaurang; RLS (lager tre) avgör vad hen faktiskt får läsa och skriva.
 * Inget av lagren räcker ensamt.
 */

export interface StaffContext {
  userId: string;
  email: string | null;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  role: StaffRole;
  /**
   * Restaurangens land, valuta och tidszon.
   *
   * Ligger på sessionen därför att varenda personalyta behöver det: notan i
   * dashboarden, statistiken, köksskärmen. En yta som hämtar det själv kommer
   * förr eller senare att låta bli, och då visas beloppen i fel valuta —
   * vilket är precis vad som hände när Burp bara fanns i Sverige.
   */
  country: CountryCode;
  currency: CurrencyCode;
  timeZone: string;
  /**
   * Personalytornas språk för den här personen.
   *
   * Ligger på sessionen av samma skäl som landet: varje personalyta behöver
   * det, och en yta som hämtar det själv kommer förr eller senare att låta bli.
   *
   * Redan upplöst — `staff.locale` om hen valt, annars restaurangens land. Den
   * som läser fältet ska aldrig behöva veta att NULL betyder något.
   */
  locale: Locale;
}


/**
 * Hämtar inloggad personal, eller null.
 *
 * Använder `getUser()` och inte `getSession()`. getSession läser cookien rakt
 * av utan att verifiera signaturen mot Supabase — en förfalskad cookie skulle
 * passera.
 */
export async function getStaff(): Promise<StaffContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("staff")
    .select("role, locale, restaurant_id, restaurants!inner (id, name, slug, country, currency)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;

  const restaurant = data.restaurants as unknown as {
    id: string;
    name: string;
    slug: string;
    country: CountryCode;
    currency: CurrencyCode;
  };

  return {
    userId: user.id,
    email: user.email ?? null,
    restaurantId: data.restaurant_id,
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
    role: data.role as StaffRole,
    country: restaurant.country,
    currency: restaurant.currency,
    timeZone: COUNTRY_INFO[restaurant.country].timeZone,
    locale: staffLocale(data.locale, restaurant.country),
  };
}

/**
 * Kräver inloggad personal med en av de tillåtna rollerna.
 *
 * Redirectar i stället för att kasta, så att en anställd som klickat fel
 * hamnar någonstans vettigt i stället för på en felsida.
 */
export async function requireStaff(allowed?: readonly StaffRole[]): Promise<StaffContext> {
  const staff = await getStaff();

  if (!staff) {
    /*
     * Inloggad utan anställning är inte samma sak som utloggad.
     *
     * Skickade den här grenen alla till `/logga-in` hamnade en inloggad gäst
     * eller en plattformsadmin i en studs: formuläret skickade dem till
     * `/dashboard`, dashboarden skickade dem tillbaka, och det såg ut som att
     * lösenordet var fel. `requirePlatformAdmin` gjorde redan skillnad på de
     * två fallen; den här gjorde det inte.
     *
     * En egen `getUser()` här och inte `landingPath()`: den funktionen
     * anropar `getStaff()` igen, och vi vet redan svaret på den frågan.
     */
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/logga-in");

    const admin = await getPlatformAdmin();
    redirect(admin ? "/backoffice" : "/konto");
  }

  if (allowed && !allowed.includes(staff.role)) {
    redirect(ROLE_HOME[staff.role]);
  }

  return staff;
}

/**
 * Serveråtgärdernas felmeddelanden på personens eget språk.
 *
 * Ligger här och inte i i18n-modulen därför att den behöver `StaffContext`,
 * och i18n får inte veta något om inloggning — beroendet går åt ett håll.
 *
 * Tar emot kontexten i stället för att hämta den själv. En åtgärd har redan
 * anropat `requireStaff()`, och ett andra databasanrop bara för att kunna
 * formulera ett felmeddelande vore att betala för texten två gånger.
 */
export function staffErrors(staff: StaffContext): Dictionary["staff"]["errors"] {
  return dictionary(staff.locale).staff.errors;
}
