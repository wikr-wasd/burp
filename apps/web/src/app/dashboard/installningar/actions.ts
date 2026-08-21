"use server";

import { revalidatePath } from "next/cache";
import {
  COUNTRY_INFO,
  normalizePostalCode,
  parseAmount,
  parseCoordinates,
  parseOrderPolicy,
  toWkt,
  serializeOrderPolicy,
  validateOpeningHours,
  WEEKDAY_KEYS,
  type CurrencyCode,
  type OpeningHours,
  type OrderStatus,
  type StaffRole,
} from "@burp/core";
import { requireStaff } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { connectableProviders, paymentProvider, PaymentProviderError } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { untranslatedSurface } from "@/lib/i18n";

/**
 * Restaurangens inställningar.
 *
 * Öppettider och orderregler styr om gäster överhuvudtaget kan beställa —
 * `is_restaurant_open()` gate:ar hela QR-flödet och avhämtning. Fram till nu
 * gick de bara att ändra med SQL.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });

function done(): ActionResult {
  revalidatePath("/dashboard/installningar");
  // Öppettiderna syns på den publika restaurangsidan, som är cachad en timme.
  revalidatePath("/r", "layout");
  return { ok: true };
}

/* ── Öppettider ──────────────────────────────────────────────────────────── */

export async function saveOpeningHours(hours: OpeningHours): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  const problems = validateOpeningHours(hours);
  if (problems.length > 0) {
    const first = problems[0]!;
    const day = untranslatedSurface().weekday[first.day];

    // Överlapp kan numera korsa dygnsgränsen: fredagens nattpass mot lördagens
    // morgonpass rapporteras på lördagen, som är den dag som lades till sist.
    const message =
      first.kind === "OVERLAP"
        ? `${day}: passet överlappar ett annat. Kom ihåg att ett nattpass fortsätter in på nästa dag.`
        : first.kind === "ZERO_LENGTH"
          ? `${day}: öppnar och stänger på samma klockslag.`
          : `${day}: ogiltigt klockslag. Använd formatet 11:00.`;

    return fail(message);
  }

  // Skriver bara de sju kända nycklarna. Kom något annat med i objektet ska
  // det inte hamna i databasen och riskera att förvirra is_restaurant_open().
  const payload: Record<string, unknown> = {};
  for (const day of WEEKDAY_KEYS) {
    payload[day] = hours[day].map((slot) => ({ opens: slot.opens, closes: slot.closes }));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurants")
    .update({ opening_hours: payload })
    .eq("id", staff.restaurantId);

  return error ? fail(error.message) : done();
}

/* ── Orderregler ─────────────────────────────────────────────────────────── */

export interface OrderPolicyInput {
  editWindowSeconds: number;
  editableUntilStatus: OrderStatus;
  allowAddItems: boolean;
  allowRemoveItems: boolean;
  allowChangeOptions: boolean;
  allowCancelUntilStatus: OrderStatus;
  autoAccept: boolean;
  prepTimeMinutes: number;
  allowScheduledOrders: boolean;
}

export async function saveOrderPolicy(input: OrderPolicyInput): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  if (!Number.isInteger(input.prepTimeMinutes) || input.prepTimeMinutes < 1 || input.prepTimeMinutes > 240) {
    return fail("Tillagningstiden ska vara mellan 1 och 240 minuter.");
  }
  if (!Number.isInteger(input.editWindowSeconds) || input.editWindowSeconds < 0 || input.editWindowSeconds > 3600) {
    return fail("Ändringsfönstret ska vara mellan 0 och 3600 sekunder.");
  }

  // parseOrderPolicy filtrerar bort okända statusvärden och faller tillbaka på
  // standard, så en manipulerad klient kan inte skriva in "BANANA".
  const policy = parseOrderPolicy(serializeOrderPolicy(input));

  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurants")
    .update({ order_policy: serializeOrderPolicy(policy) })
    .eq("id", staff.restaurantId);

  return error ? fail(error.message) : done();
}

/* ── Personal ────────────────────────────────────────────────────────────── */

export async function setStaffRole(staffId: string, role: StaffRole): Promise<ActionResult> {
  const staff = await requireStaff(["owner"]);

  // Ägaren får inte degradera sig själv. Sista ägaren som blir kock låser
  // hela restaurangen ute från sina egna inställningar.
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("staff")
    .select("id, user_id, role")
    .eq("id", staffId)
    .maybeSingle();

  if (!target) return fail("Personen hittades inte.");

  if (target.user_id === staff.userId && role !== "owner") {
    return fail("Du kan inte ta bort din egen ägarroll. Utse en annan ägare först.");
  }

  const { error } = await supabase.from("staff").update({ role }).eq("id", staffId);
  return error ? fail(error.message) : done();
}

export async function setStaffActive(staffId: string, isActive: boolean): Promise<ActionResult> {
  const staff = await requireStaff(["owner"]);

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("staff")
    .select("id, user_id")
    .eq("id", staffId)
    .maybeSingle();

  if (!target) return fail("Personen hittades inte.");
  if (target.user_id === staff.userId) {
    return fail("Du kan inte stänga av dig själv.");
  }

  const { error } = await supabase.from("staff").update({ is_active: isActive }).eq("id", staffId);
  return error ? fail(error.message) : done();
}

/**
 * Bjuder in en ny medarbetare.
 *
 * Kräver service role: att skapa en användare i `auth` går inte med gästens
 * eller personalens egen nyckel. Det är en av de få platser där admin-klienten
 * är motiverad — och därför kontrolleras rollen här, före anropet, i stället
 * för att förlita sig på RLS som ändå kringgås.
 *
 * Finns personen redan som användare kopplas hen bara till restaurangen. Ett
 * nytt konto skapas aldrig för en e-post som redan finns.
 */
export async function inviteStaff(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const staff = await requireStaff(["owner"]);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "staff") as StaffRole;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Ange en giltig e-postadress.");
  }
  if (!["owner", "manager", "staff", "kitchen"].includes(role)) {
    return fail("Ogiltig roll.");
  }

  const admin = createAdminClient();

  // Söker upp befintlig användare först. inviteUserByEmail returnerar ett fel
  // för en adress som redan finns, och det felet ska inte visas för den som
  // bara vill lägga till en kollega som redan har ett konto.
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = existingUsers?.users.find((user) => user.email?.toLowerCase() === email);

  let userId = existing?.id;

  if (!userId) {
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteError || !invited.user) {
      return fail(inviteError?.message ?? "Inbjudan kunde inte skickas.");
    }
    userId = invited.user.id;
  }

  const { error } = await admin.from("staff").upsert(
    {
      restaurant_id: staff.restaurantId,
      user_id: userId,
      role,
      is_active: true,
      invited_by: staff.userId,
    },
    { onConflict: "restaurant_id,user_id" },
  );

  if (error) return fail(error.message);

  revalidatePath("/dashboard/installningar");
  return {
    ok: true,
    message: existing
      ? `${email} är tillagd. Personen kan logga in med sitt befintliga konto.`
      : `Inbjudan skickad till ${email}.`,
  };
}

/* ── Restaurangens egen sida ─────────────────────────────────────────────── */

export interface PresentationInput {
  description: string;
  phone: string;
  cuisines: string;
  priceTier: number | null;
  streetAddress: string;
  postalCode: string;
  city: string;
  /** Koordinater eller en kartlänk. Tom sträng lämnar punkten orörd. */
  location: string;
}

/**
 * Sparar det som utgör restaurangens presentation utåt.
 *
 * Fram till nu gick beskrivning, telefon, kökstyper, prisklass och adress bara
 * att ändra med SQL. En restaurang som inte kan ändra sin egen presentation
 * har ingen egen sida — den har en katalogpost någon annan skriver.
 *
 * Skrivningen går via den vanliga RLS-klienten. `restaurants_update_owner`
 * (migration 0009) släpper bara igenom ägare och chefer för den egna
 * restaurangen; service role skulle bara ta bort skyddsnätet.
 */
export async function savePresentation(input: PresentationInput): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);

  const street = input.streetAddress.trim();
  const postal = normalizePostalCode(staff.country, input.postalCode);
  const city = input.city.trim();

  if (!street) return fail("Gatuadressen får inte vara tom.");
  if (!city) return fail("Staden får inte vara tom.");
  if (postal === null) {
    return fail(
      `Postnumret ser inte ut att gälla i ${COUNTRY_INFO[staff.country].name}.`,
    );
  }

  if (input.priceTier !== null && ![1, 2, 3, 4].includes(input.priceTier)) {
    return fail("Prisklassen måste vara 1–4.");
  }

  /*
   * Kökstyperna kommer som en kommaseparerad rad.
   *
   * Dubbletter tas bort och tomma led faller bort, så att "Grill, , grill"
   * inte blir tre filter på startsidan. Ordningen behålls — den är ägarens
   * prioritering, och den syns i listan.
   */
  const cuisines = [
    ...new Set(
      input.cuisines
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].slice(0, 8);

  const update: Record<string, unknown> = {
    description: input.description.trim() || null,
    phone: input.phone.trim() || null,
    cuisines,
    price_tier: input.priceTier,
    street_address: street,
    postal_code: postal,
    city,
  };

  /*
   * Punkten skrivs bara när ägaren angett en.
   *
   * `latitude` och `longitude` är genererade kolumner (migration 0013) och går
   * inte att skriva till — punkten sitter i `location`. Ett tomt fält betyder
   * "rör inte", inte "nollställ": en tom rad ska aldrig kunna radera en
   * fungerande kartnål.
   */
  if (input.location.trim()) {
    const point = parseCoordinates(input.location);
    if (!point) {
      return fail(
        "Kunde inte läsa någon plats ur det där. Klistra in en länk från Google Maps, " +
          "eller skriv koordinaterna som \"43.8595, 18.4287\".",
      );
    }
    update["location"] = toWkt(point);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurants")
    .update(update)
    .eq("id", staff.restaurantId);

  return error ? fail(error.message) : done();
}

/* ── Klippkort ───────────────────────────────────────────────────────────── */

/**
 * Tionde besöket bjuder restaurangen på.
 *
 * En annan mekanik än lojalitetspoängen: poäng räknar kronor, klippkortet
 * räknar besök. Storleken lagras på restaurangen; antalet besök lagras aldrig
 * utan räknas ur ordrarna (regel 7).
 *
 * Ändrad storlek gäller framåt. Gamla uttag bär sin egen storlek på raden, så
 * att "tionde måltiden" inte blir obegriplig den dag restaurangen byter till
 * åtta.
 */
export async function savePunchCard(input: {
  /** Tom sträng stänger av klippkortet. */
  size: string;
  /** Tom sträng = hela ordern bjuds. */
  maxReward: string;
}): Promise<ActionResult> {
  const staff = await requireStaff(["owner", "manager"]);
  const currency = staff.currency as CurrencyCode;

  const update: Record<string, unknown> = {};

  if (!input.size.trim()) {
    update["punch_card_size"] = null;
    update["punch_card_max_reward_ore"] = null;
  } else {
    const size = Number(input.size.trim());
    if (!Number.isInteger(size) || size < 2 || size > 50) {
      return fail("Antalet besök ska vara mellan 2 och 50. Ett kort på ett besök är inget kort.");
    }
    update["punch_card_size"] = size;

    if (input.maxReward.trim()) {
      const cap = parseAmount(input.maxReward, currency);
      if (cap === null || cap <= 0) return fail("Taket gick inte att tolka.");
      update["punch_card_max_reward_ore"] = cap;
    } else {
      update["punch_card_max_reward_ore"] = null;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurants")
    .update(update)
    .eq("id", staff.restaurantId);

  return error ? fail(error.message) : done();
}

/* ── Kortbetalning ───────────────────────────────────────────────────────── */

/**
 * Kopplar restaurangens eget inlösenavtal.
 *
 * Det viktiga att förstå om det här steget: **kontot är restaurangens, inte
 * Burps.** Gästens pengar går rakt in på det och Burp rör dem aldrig. Det är
 * inte en teknisk detalj utan hela skälet till att kortbetalning går att
 * bygga: att förmedla pengar åt någon annan är tillståndspliktigt, och Bosnien
 * och Serbien ligger utanför EU/EES där ett sådant tillstånd tar över ett år.
 *
 * Bara ägaren. En chef sköter drift och meny; att binda restaurangen till ett
 * inlösenavtal är ett ekonomiskt beslut.
 */
export async function startCardOnboarding(): Promise<ActionResult & { url?: string }> {
  const staff = await requireStaff(["owner"]);

  const providers = connectableProviders(staff.currency);
  const providerId = providers[0];

  if (!providerId) {
    // Ingen leverantör täcker restaurangens valuta. I Bosnien och Serbien är
    // det läget tills ett Monri-avtal finns — och kontantflödet fungerar under
    // tiden, så det här är ett besked och inte ett fel.
    return fail(
      `Ingen betalleverantör är kopplad för ${staff.currency} ännu. Kontantbetalning fungerar som vanligt.`,
    );
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("restaurant_payment_accounts")
    .select("external_account_id")
    .eq("restaurant_id", staff.restaurantId)
    .eq("provider", providerId)
    .maybeSingle();

  const base = publicEnv.NEXT_PUBLIC_SITE_URL;

  let link;
  try {
    link = await paymentProvider(providerId).createOnboardingLink({
      restaurantId: staff.restaurantId,
      country: staff.country,
      currency: staff.currency,
      email: staff.email,
      existingAccountId: existing?.external_account_id ?? null,
      returnUrl: new URL("/dashboard/installningar?kort=klart", base).toString(),
      refreshUrl: new URL("/dashboard/installningar?kort=avbrutet", base).toString(),
    });
  } catch (error) {
    return fail(
      error instanceof PaymentProviderError
        ? error.message
        : "Kunde inte nå betalleverantören. Försök igen.",
    );
  }

  /*
   * Raden skapas som PENDING och blir ACTIVE först när leverantören säger att
   * kontot får ta emot pengar. Att lita på att formuläret fylldes i hade gett
   * en kortknapp som nekar varje betalning — leverantören granskar underlaget
   * i efterhand, och det tar ibland dagar.
   */
  const { error: writeError } = await admin
    .from("restaurant_payment_accounts")
    .upsert(
      {
        restaurant_id: staff.restaurantId,
        provider: providerId,
        external_account_id: link.externalAccountId,
        currency: staff.currency,
      },
      { onConflict: "restaurant_id,provider" },
    );

  if (writeError) return fail(writeError.message);

  revalidatePath("/dashboard/installningar");
  return { ok: true, url: link.url };
}

/**
 * Stänger av kortbetalning.
 *
 * Kontot hos leverantören rörs inte — det är restaurangens och kan ha
 * historik, tvister och utbetalningar kvar. Det som ändras är att Burp slutar
 * erbjuda kortknappen. Att radera raden hade gjort gamla betalningar
 * omöjliga att härleda till ett konto.
 */
export async function disableCardPayments(): Promise<ActionResult> {
  const staff = await requireStaff(["owner"]);

  const admin = createAdminClient();
  const { error } = await admin
    .from("restaurant_payment_accounts")
    .update({ status: "DISABLED" })
    .eq("restaurant_id", staff.restaurantId);

  return error ? fail(error.message) : done();
}
