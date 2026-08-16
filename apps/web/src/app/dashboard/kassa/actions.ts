"use server";

import { revalidatePath } from "next/cache";
import { parseAmount, settleCash, type CurrencyCode } from "@burp/core";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Registrering av kontantbetalning (öppen fråga 6).
 *
 * Servitören, chefen och ägaren får kvittera. Köket får inte — det hanterar
 * mat, inte kassa — och RLS i migration 0024 säger samma sak. `requireStaff`
 * här finns för att ge ett begripligt svar i stället för ett tomt databasfel.
 *
 * Klienten skickar beloppet som text, inte som öre. `parseAmount()` tolkar det
 * i restaurangens valuta: "1200" i ett serbiskt fält är 1200 dinarer, inte
 * 12,00. Att låta klienten räkna om till minsta enhet hade betytt att varje
 * fält behöver veta hur många decimaler valutan har — och det är exakt den
 * kunskapen som ligger i @burp/core just för att inte spridas ut.
 *
 * Summan tas INTE från klienten som ett färdigt öresbelopp av samma skäl som
 * priser aldrig gör det: ordersumman läses här ur databasen, och avvikelsen
 * mot den räknas fram på servern.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const REGISTER_ROLES = ["owner", "manager", "staff"] as const;

export async function registerCashPayment(
  orderId: string,
  amountInput: string,
): Promise<ActionResult> {
  const staff = await requireStaff(REGISTER_ROLES);
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, total_ore, currency, restaurant_id")
    .eq("id", orderId)
    .maybeSingle();

  // Ordern kan saknas antingen för att den inte finns eller för att RLS gömmer
  // en annan restaurangs order. Svaret är detsamma — vi bekräftar inte att ett
  // främmande order-id existerar.
  if (!order || order.restaurant_id !== staff.restaurantId) {
    return { ok: false, message: "Ordern hittades inte." };
  }

  if (order.status !== "COMPLETED") {
    return {
      ok: false,
      message: "Bara en slutförd order kan kvitteras. Markera den som serverad först.",
    };
  }

  const currency = order.currency as CurrencyCode;
  const receivedOre = parseAmount(amountInput, currency);

  if (receivedOre === null) {
    return { ok: false, message: "Beloppet gick inte att tolka." };
  }

  // Kastar på noll, negativa belopp och på allt som inte är ett heltal i
  // valutans minsta enhet. Fångas här så att felet blir en mening i
  // gränssnittet i stället för en 500:a.
  let settlement;
  try {
    settlement = settleCash(receivedOre, order.total_ore);
  } catch {
    return { ok: false, message: "Beloppet måste vara större än noll." };
  }

  const { error } = await supabase.from("payments").insert({
    order_id: order.id,
    restaurant_id: order.restaurant_id,
    amount_ore: receivedOre,
    // Valutan fryses på ordern (migration 0020). Betalningen ärver den i
    // stället för att läsa restaurangens nuvarande — byter restaurangen valuta
    // ska en gammal nota fortfarande stämma.
    currency,
    provider: "CASH",
    method: "cash",
    status: "CAPTURED",
    captured_at: new Date().toISOString(),
    idempotency_key: crypto.randomUUID(),
    // Avvikelsen sparas som den räknades, inte som den skrevs in. Vill någon
    // veta varför kassan gick plus 3 fening en fredag står svaret här.
    provider_payload: {
      settlement: settlement.kind,
      difference_ore: settlement.differenceOre,
      order_total_ore: order.total_ore,
      registered_by: staff.userId,
    },
  });

  if (error) {
    // 23505 = unique_violation. Det enda unika indexet som kan slå här är
    // `payments_cash_order_key`: någon hann kvittera samma nota först, eller
    // knappen trycktes två gånger. Databasen är det som avgör, inte
    // gränssnittet — därför ett begripligt svar i stället för felkoden.
    if (error.code === "23505") {
      return { ok: false, message: "Ordern är redan kvitterad." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/kassa");
  return { ok: true };
}
