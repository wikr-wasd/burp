/**
 * Restaurangens bokningsregler.
 *
 * Samma form som `order-policy.ts`: en jsonb-kolumn i snake_case som läses hit
 * och skrivs tillbaka. Tvillingen är `restaurants.reservation_policy` i
 * migration 0054 — ändras formen på ena stället måste den ändras på det andra.
 *
 * ── Vad som INTE ligger här ─────────────────────────────────────────────────
 *
 * Uträkningen av vilka tider som är lediga. Den ligger i `reservation_slots()`
 * i databasen och ska ligga där ensam: den är en fråga över rader — öppettider,
 * bord, befintliga bokningar — och två uträkningar av samma sak glider isär.
 * Då visar sidan en tid som bokningen sedan nekar, vilket är exakt vad
 * `open_restaurant_ids` (migration 0025) en gång fick införas för att undvika.
 *
 * Det som ligger här är reglerna som går att bedöma utan databasen: vad ett
 * giltigt sällskap är, och hur länge ett bord hålls.
 */

export interface ReservationPolicy {
  /** Falskt = restaurangen tar inte emot bokningar. Standardläget. */
  enabled: boolean;
  /** Hur länge ett bord hålls per bokning. */
  durationMinutes: number;
  /** Hur länge bordet väntar på en gäst som inte kommit. */
  graceMinutes: number;
  /** Kortaste framförhållning. En bokning om tio minuter är ett telefonsamtal. */
  leadMinutes: number;
  /** Hur långt fram det går att boka. */
  horizonDays: number;
  /** Största sällskap som får boka själv. Större sällskap ringer. */
  maxPartySize: number;
}

/**
 * Standardreglerna.
 *
 * `enabled` är FALSKT med flit. En restaurang som inte bett om bokning ska inte
 * plötsligt ta emot den — tomma bord klockan sju för gäster som aldrig dök upp
 * är ett dyrare misstag än en knapp som saknas.
 *
 * 90 minuter är ett bord i två vändor på en kväll. 15 minuters karens är den
 * tid en försenad gäst rimligen får, och den tid ett tomt bord får kosta.
 */
export const DEFAULT_RESERVATION_POLICY: ReservationPolicy = {
  enabled: false,
  durationMinutes: 90,
  graceMinutes: 15,
  leadMinutes: 60,
  horizonDays: 30,
  maxPartySize: 12,
};

/** Gränser som skyddar mot orimliga värden i formuläret. */
const LIMITS = {
  durationMinutes: { min: 30, max: 360 },
  graceMinutes: { min: 0, max: 120 },
  leadMinutes: { min: 0, max: 60 * 24 * 7 },
  horizonDays: { min: 1, max: 365 },
  maxPartySize: { min: 1, max: 50 },
} as const;

export function parseReservationPolicy(raw: unknown): ReservationPolicy {
  if (raw === null || typeof raw !== "object") return { ...DEFAULT_RESERVATION_POLICY };
  const input = raw as Record<string, unknown>;

  return {
    enabled: bool(input["enabled"], DEFAULT_RESERVATION_POLICY.enabled),
    durationMinutes: clamped("durationMinutes", input["duration_minutes"]),
    graceMinutes: clamped("graceMinutes", input["grace_minutes"]),
    leadMinutes: clamped("leadMinutes", input["lead_minutes"]),
    horizonDays: clamped("horizonDays", input["horizon_days"]),
    maxPartySize: clamped("maxPartySize", input["max_party_size"]),
  };
}

/** Skriver tillbaka till databasens snake_case-format. */
export function serializeReservationPolicy(policy: ReservationPolicy): Record<string, unknown> {
  return {
    enabled: policy.enabled,
    duration_minutes: policy.durationMinutes,
    grace_minutes: policy.graceMinutes,
    lead_minutes: policy.leadMinutes,
    horizon_days: policy.horizonDays,
    max_party_size: policy.maxPartySize,
  };
}

/** Varför en bokningsförfrågan inte går att ta emot. */
export type ReservationProblem =
  | "DISABLED"
  | "PARTY_TOO_SMALL"
  | "PARTY_TOO_LARGE"
  | "TOO_SOON"
  | "TOO_FAR"
  | "NO_NAME";

export interface ReservationRequest {
  partySize: number;
  /** Tidpunkten gästen valt. */
  at: Date;
  guestName: string;
}

/**
 * Kontrollerar det som går att avgöra utan databasen.
 *
 * Klienten föreslår, servern avgör — och kontrollerna är avsiktligt fler än
 * gränssnittet behöver. En gäst som anropar API:t direkt ska mötas av samma
 * regler som en som klickar. Att tiden faktiskt är ledig avgörs sedan av
 * `reservation_slots()`, som är den enda som vet det.
 *
 * Returnerar det FÖRSTA problemet, eller null. Ett fel i taget är vad
 * formuläret kan visa vettigt.
 */
export function validateReservationRequest(
  request: ReservationRequest,
  policy: ReservationPolicy,
  now: Date = new Date(),
): ReservationProblem | null {
  if (!policy.enabled) return "DISABLED";

  if (request.guestName.trim() === "") return "NO_NAME";

  if (!Number.isInteger(request.partySize) || request.partySize < 1) return "PARTY_TOO_SMALL";
  if (request.partySize > policy.maxPartySize) return "PARTY_TOO_LARGE";

  const minutesAhead = (request.at.getTime() - now.getTime()) / 60_000;

  if (minutesAhead < policy.leadMinutes) return "TOO_SOON";
  if (minutesAhead > policy.horizonDays * 24 * 60) return "TOO_FAR";

  return null;
}

/**
 * Håller bokningen fortfarande sitt bord?
 *
 * Karensen är RÄKNAD och inte satt av ett bakgrundsjobb. Ett jobb som ligger
 * nere lämnar bord låsta hela kvällen, och raden ska ändå stå kvar som den är:
 * den är historik, och historik skrivs inte om av en klocka.
 *
 * Samma regel finns i `reservation_slots()` (migration 0054). De två MÅSTE
 * hållas i takt — precis som `loyalty_balance()` och `calculateBalance()`.
 */
export function holdsTable(
  reservation: { status: string; startsAt: Date; seatedAt: Date | null },
  policy: ReservationPolicy,
  now: Date = new Date(),
): boolean {
  if (reservation.status === "SEATED") return true;
  if (reservation.status !== "BOOKED") return false;
  if (reservation.seatedAt !== null) return true;

  const releaseAt = reservation.startsAt.getTime() + policy.graceMinutes * 60_000;
  return now.getTime() <= releaseAt;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clamped(key: keyof typeof LIMITS, value: unknown): number {
  const fallback = DEFAULT_RESERVATION_POLICY[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  const { min, max } = LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}
