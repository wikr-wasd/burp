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
} from "@burp/core";
import { requireStaff, staffErrors } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { connectableProviders, paymentProvider, PaymentProviderError } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dictionary, fill } from "@/lib/i18n";

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
    const texts = dictionary(staff.locale);
    const day = texts.weekday[first.day];

    // Överlapp kan numera korsa dygnsgränsen: fredagens nattpass mot lördagens
    // morgonpass rapporteras på lördagen, som är den dag som lades till sist.
    const template =
      first.kind === "OVERLAP"
        ? texts.staff.errors.hoursOverlap
        : first.kind === "ZERO_LENGTH"
          ? texts.staff.errors.hoursZeroLength
          : texts.staff.errors.hoursInvalidTime;

    return fail(fill(template, { day }));
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
    return fail(staffErrors(staff).editWindowRange);
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

/*
 * Personalhanteringen låg här till 2026-08-21, som en ANDRA uppsättning vid
 * sidan av /dashboard/personal.
 *
 * Den skrev `staff` direkt med service role och gick alltså förbi
 * `invite_staff()` (migration 0046) — och därmed förbi `can_grant_role()`,
 * inbjudningarnas token, deras utgångstid och möjligheten att återkalla dem.
 * Hierarkiregeln fanns i stället som en app-kontroll här, vilket är precis den
 * sortens andra kopia som glider isär.
 *
 * /dashboard/personal ersätter den helt. Det enda den här kunde som den nya
 * inte kan var att koppla på ett BEFINTLIGT Burp-konto utan inbjudan — och
 * `accept_staff_invitation()` gör `on conflict do update`, så en länk
 * fungerar lika bra för någon som redan har ett konto.
 */

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

  if (!street) return fail(staffErrors(staff).streetRequired);
  if (!city) return fail(staffErrors(staff).cityRequired);
  if (postal === null) {
    return fail(
      `Postnumret ser inte ut att gälla i ${COUNTRY_INFO[staff.country].name}.`,
    );
  }

  if (input.priceTier !== null && ![1, 2, 3, 4].includes(input.priceTier)) {
    return fail(staffErrors(staff).priceTierRange);
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
        staffErrors(staff).locationUnreadable,
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
      return fail(staffErrors(staff).punchCardRange);
    }
    update["punch_card_size"] = size;

    if (input.maxReward.trim()) {
      const cap = parseAmount(input.maxReward, currency);
      if (cap === null || cap <= 0) return fail(staffErrors(staff).capUnreadable);
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
        : staffErrors(staff).providerUnreachable,
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
