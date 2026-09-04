/**
 * Utskickens typer och mallista — utan runtime-koppling.
 *
 * ── Varför en egen fil ─────────────────────────────────────────────────────
 *
 * `lib/campaigns.ts` är `server-only` och importerar Supabase-klienten, som i
 * sin tur importerar `next/headers`. Komponenten som ritar utskicksrutan är
 * klientkod, och en enda `import { CAMPAIGN_TEMPLATES } from "@/lib/campaigns"`
 * därifrån drar hela den kedjan in i klientbunten:
 *
 *     You're importing a module that depends on "next/headers".
 *     This API is only available in Server Components…
 *
 * Sidan svarar då 500. **Typkontrollen och lint ser det inte** — typerna är
 * rätt, och felet uppstår när bundlern följer importen. Det enda som avslöjar
 * det är att faktiskt hämta sidan, vilket röktestet gör.
 *
 * Samma fälla som `lib/table-attributes.ts` finns för: en konstant som låg i
 * en `"use server"`-modul och gjordes om till en serveråtgärd av bundlern.
 * Formen på felet skiljer sig, orsaken är densamma — en delad konstant måste
 * bo i en fil utan runtime under sig.
 */

export type CampaignTemplate = "WELCOME" | "WE_MISS_YOU" | "OFFER" | "NEWS";

/** Mallarna i den ordning de visas. Speglar enumet i migration 0076. */
export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  "WELCOME",
  "WE_MISS_YOU",
  "OFFER",
  "NEWS",
];

export function isCampaignTemplate(value: string): value is CampaignTemplate {
  return (CAMPAIGN_TEMPLATES as readonly string[]).includes(value);
}

export interface CampaignRow {
  id: string;
  template: CampaignTemplate;
  subject: string;
  status: "DRAFT" | "SENDING" | "SENT" | "FAILED";
  recipients: number;
  failed: number;
  sentAt: string | null;
}
