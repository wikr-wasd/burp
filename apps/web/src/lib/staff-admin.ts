import "server-only";

import type { StaffRole } from "@burp/core";
import { createClient } from "./supabase/server";

/**
 * Personalen och inbjudningarna (migration 0046).
 *
 * All behörighet ligger i databasen. Funktionerna där är SECURITY DEFINER —
 * de måste vara det för att kunna läsa namn ur `profiles` och skriva i `staff`
 * — och kontrollerar hierarkin själva. Den här filen översätter bara svaren och
 * ska aldrig innehålla en egen rollkontroll: två uppsättningar regler för samma
 * fråga glider isär, och den i appen är den som går att kringgå.
 */

export interface StaffMember {
  userId: string;
  email: string;
  fullName: string | null;
  role: StaffRole;
  isActive: boolean;
  /** Sant för den inloggade. Man ska inte kunna stänga av sig själv av misstag. */
  isMe: boolean;
}

export interface StaffInvitation {
  id: string;
  email: string;
  role: StaffRole;
  expiresAt: string;
  createdAt: string;
}

export async function getStaff(restaurantId: string): Promise<StaffMember[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("restaurant_staff", { p_restaurant_id: restaurantId });

  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

  return rows.map((row) => ({
    userId: String(row["user_id"]),
    email: String(row["email"] ?? ""),
    fullName: (row["full_name"] as string | null) ?? null,
    role: row["role"] as StaffRole,
    isActive: Boolean(row["is_active"]),
    isMe: Boolean(row["is_me"]),
  }));
}

export async function getOpenInvitations(restaurantId: string): Promise<StaffInvitation[]> {
  const supabase = await createClient();

  // Läses med RLS. `staff_invitations_select_management` släpper bara igenom
  // ägare och chef, vilket är samma gräns som sidan drar.
  const { data } = await supabase
    .from("staff_invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    role: row.role as StaffRole,
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
  }));
}

/**
 * Hemligheten i inbjudningslänken.
 *
 * 32 byte ur en kryptografisk källa, base64url — 43 tecken utan tecken som
 * behöver kodas i en URL. Databasen sparar bara en hash av den, så det här är
 * enda gången strängen finns i klartext. Kommer den bort går inbjudan inte att
 * få tillbaka, bara att återkalla och göra om.
 */
export function newInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}
