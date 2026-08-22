"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyRestaurantApplication } from "@/lib/notify";
import { dictionary, isLocale, localePath, type Locale } from "@/lib/i18n";
import {
  applicationErrorText,
  databaseErrorText,
  validateApplication,
  type ApplicationInput,
} from "@/lib/restaurant-application";
import { createClient } from "@/lib/supabase/server";

/**
 * Restaurangens ansökan om att ansluta sig.
 *
 * Fram till nu fanns ingen väg in i marknadsplatsen utom SQL. Backoffice har
 * hela tiden kunnat godkänna väntande restauranger, men ingenting har kunnat
 * skapa dem — vilket betydde att det inte var en marknadsplats, utan en demo.
 *
 * Ansökan går genom `apply_for_restaurant` (migration 0021), som skapar
 * restaurangen som PENDING och sökanden som ägare i samma transaktion. Blir
 * bara den ena till står antingen en restaurang utan någon som kan sköta den,
 * eller en personalrad som pekar i tomma intet.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function applyForRestaurant(
  input: ApplicationInput,
  /**
   * Språket sökanden läser sidan på.
   *
   * Kommer från klienten, och det är oproblematiskt här: det styr bara vilken
   * text ett fel får, aldrig vad som sparas. Ett värde vi inte känner igen
   * faller till standardspråket i `dictionary()` — regel 2 gäller belopp och
   * rabatter, inte vilken mening som visas.
   *
   * `Accept-Language` hade varit fel källa. Sidan ligger under `/de/anslut`
   * eller `/bs/anslut`, och den som aktivt bytt språk i sidhuvudet ska få
   * felet på det språk hon står i — inte på det hennes telefon råkar säga.
   */
  rawLocale: string,
): Promise<ActionResult> {
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "sv";
  const texts = dictionary(locale);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ansökan kräver ett konto: någon ska bli ägare, och någon ska gå att nå när
  // Burp granskat. Funktionen i databasen kontrollerar samma sak — det här är
  // för att ge ett begripligt besked i stället för ett rättighetsfel.
  if (!user) {
    redirect(
      `/skapa-konto?next=${encodeURIComponent(localePath(locale, "/anslut"))}`,
    );
  }

  const validation = validateApplication(input);
  if (!validation.ok) {
    return { ok: false, message: applicationErrorText(validation.problem, texts) };
  }

  const { error } = await supabase.rpc("apply_for_restaurant", {
    p_input: validation.value,
  });

  if (error) {
    return {
      ok: false,
      message: databaseErrorText(error.message, validation.value.country, texts),
    };
  }

  // Backoffice-kön ska visa ansökan direkt, inte när cachen råkar gå ut.
  revalidatePath("/backoffice");
  revalidatePath("/backoffice/restauranger");

  // Kön visar ansökan, men bara för den som öppnar backoffice. Brevet är det
  // som gör att någon får veta att den finns. Efter svaret — sökanden ska få
  // sin bekräftelse oavsett hur leverantören mår.
  after(() =>
    notifyRestaurantApplication({
      restaurantName: validation.value.name,
      city: validation.value.city,
      country: validation.value.country,
      orgNumber: validation.value.org_number,
      email: validation.value.email,
      phone: validation.value.phone,
      description: validation.value.description,
    }),
  );

  return { ok: true };
}
