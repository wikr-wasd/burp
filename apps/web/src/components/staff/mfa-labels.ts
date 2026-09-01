import type { Dictionary } from "@/lib/i18n";

/**
 * Texterna tvåstegspanelen behöver, och mappningen ur ordboken.
 *
 * Egen fil och inte en del av `mfa-settings.tsx`, därför att den filen är
 * `"use client"`. En funktion som exporteras därifrån blir en klientreferens,
 * och en serverkomponent som anropar den får ett proxy-objekt i stället för
 * ett resultat. Typen och mappningen hör alltså hemma i en vanlig modul.
 *
 * Panelen används på två ytor med olika språkkälla — restaurangens
 * inställningar läser `staff.locale`, backoffice skickar in svenska med
 * `untranslatedSurface()` — och mappningen ska ändå bara finnas en gång.
 */

/** Rena strängar. Panelen är klientkod och kan inte ta emot funktioner. */
export interface MfaSettingsLabels {
  statusOn: string;
  statusOff: string;
  enable: string;
  scanHint: string;
  secretHint: string;
  codeLabel: string;
  verify: string;
  cancel: string;
  disable: string;
  disableConfirm: string;
  enabled: string;
  failed: string;
  /** Funktionen är avstängd på Supabase-projektet — inte ett fel personen kan rätta. */
  notEnabled: string;
  codeFailed: string;
  loading: string;
}

export function mfaLabels(t: Dictionary["staff"]["settings"]): MfaSettingsLabels {
  return {
    statusOn: t.mfaStatusOn,
    statusOff: t.mfaStatusOff,
    enable: t.mfaEnable,
    scanHint: t.mfaScanHint,
    secretHint: t.mfaSecretHint,
    codeLabel: t.mfaCodeLabel,
    verify: t.mfaVerify,
    cancel: t.mfaCancel,
    disable: t.mfaDisable,
    disableConfirm: t.mfaDisableConfirm,
    enabled: t.mfaEnabled,
    failed: t.mfaFailed,
    notEnabled: t.mfaNotEnabled,
    codeFailed: t.mfaCodeFailed,
    loading: t.mfaLoading,
  };
}
