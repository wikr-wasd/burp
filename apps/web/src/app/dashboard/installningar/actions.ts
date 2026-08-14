"use server";

import { revalidatePath } from "next/cache";
import {
  parseOrderPolicy,
  serializeOrderPolicy,
  validateOpeningHours,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  type OpeningHours,
  type OrderStatus,
  type StaffRole,
} from "@burp/core";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
    const day = WEEKDAY_LABELS[first.day];

    const message =
      first.kind === "OVERLAP"
        ? `${day}: två pass överlappar varandra.`
        : first.kind === "CLOSES_BEFORE_OPENS"
          ? `${day}: stängningstiden ligger före öppningstiden.`
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
