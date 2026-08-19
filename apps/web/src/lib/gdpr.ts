import "server-only";

import { createAdminClient } from "./supabase/admin";

/**
 * GDPR: gästens rätt till en kopia och till radering (migration 0041).
 *
 * Båda går genom service role, och det är ett av de fall regel 5 pekar ut som
 * berättigade: funktionerna i databasen läser och skriver tvärs över tabeller
 * där gästen saknar egen policy, och en RLS-baserad variant hade gett en
 * OFULLSTÄNDIG export — vilket är sämre än ingen. Skyddet ligger i stället i
 * att **id:t aldrig kommer från klienten.** Anroparen skickar den inloggade
 * sessionens eget id, hämtat med `getUser()`, som verifierar signaturen mot
 * Supabase.
 */

/**
 * Allt Burp har om gästen, som JSON.
 *
 * Nycklarna är på engelska med flit. Artikel 20 kräver ett maskinläsbart
 * format, och en nyckel som byter namn med gästens språkval är inte
 * maskinläsbar. Texten gästen själv skrivit står som hon skrev den.
 */
export async function exportGuestData(userId: string): Promise<unknown> {
  const { data, error } = await createAdminClient().rpc("export_guest_data", {
    p_user_id: userId,
  });

  if (error) throw new Error(error.message);
  return data;
}

export interface EraseResult {
  ok: boolean;
  message?: string;
  /** Vad som avidentifierades. Kvittot på att raderingen skedde. */
  summary?: Record<string, number>;
}

/**
 * Raderar gästen.
 *
 * Hela raderingen sker i EN transaktion i databasen. Bokföringen står kvar utan
 * person: order, avgifter och omdömesbetyg finns kvar, allt som pekar ut någon
 * är borta. Se migration 0041 för varför det inte går att bara radera raderna.
 */
export async function eraseGuest(userId: string): Promise<EraseResult> {
  const { data, error } = await createAdminClient().rpc("erase_guest", {
    p_user_id: userId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    summary: (data as Record<string, number> | null) ?? undefined,
  };
}
