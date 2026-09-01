"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import type { MfaSettingsLabels } from "@/components/staff/mfa-labels";
import { createClient } from "@/lib/supabase/client";

/**
 * Tvåstegsverifiering, registrerad av personen själv.
 *
 * Delad mellan restaurangens inställningar och Burps backoffice. Dansen med
 * Supabase är densamma — registrera faktorn, visa rutan, bekräfta med en kod —
 * och den ska bara finnas på ett ställe. Det som SKILJER är texterna, och de
 * kommer utifrån: personalens ur `staff.locale`, backofficens som svenska via
 * `untranslatedSurface()`, eftersom en plattformsadmin inte är personal
 * någonstans och saknar `staff.locale`.
 *
 * Faktorn hör till personen och inte till restaurangen. Den ligger i Supabase
 * auth, inte i något av våra scheman, och därför gör komponenten sina anrop
 * själv i stället för att gå via en serveråtgärd — det finns ingen rad hos oss
 * att skriva.
 *
 * TOTP, inte SMS. SMS-koder faller för SIM-swap, kräver ett avtal med en
 * leverantör och kostar per meddelande i Bosnien och Serbien.
 */

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export function MfaSettings({ labels }: { labels: MfaSettingsLabels }) {
  const [hasFactor, setHasFactor] = useState<boolean | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Läget hämtas i webbläsaren och inte som en prop. Sidan bakom är cachad per
  // request, och en faktor som registreras här ska synas utan omladdning.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.mfa.listFactors();
      if (!cancelled) setHasFactor((data?.totp?.length ?? 0) > 0);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function startEnrollment() {
    setBusy(true);
    setError(null);

    const supabase = createClient();

    /*
     * En påbörjad men obekräftad faktor blir kvar hos Supabase om man avbryter,
     * och nästa försök faller då på att namnet redan är taget. Städa först.
     */
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      if (factor.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Burp ${new Date().toISOString().slice(0, 10)}`,
    });

    if (enrollError || !data) {
      /*
       * Skilj den avstängda funktionen från allt annat.
       *
       * Supabase har TOTP AVSTÄNGT som standard och svarar då 422 med
       * `mfa_totp_enroll_not_enabled`. Panelen visade tidigare samma allmänna
       * text som för ett nätverksfel — och det är exakt därför hela
       * tvåstegsverifieringen låg död från migration 0051 (2026-08-22) till
       * 2026-09-01 utan att någon kunde se varför. Schemat, RLS-grinden,
       * gränssnittet och återställningen i backoffice fungerade var för sig;
       * det gick bara inte att registrera en faktor.
       *
       * Lokalt slås den på i `supabase/config.toml`, i molnet under
       * Authentication → Multi-Factor Authentication.
       *
       * Skälet loggas dessutom oavsett. Ett fel som bara syns som en översatt
       * mening i ett kort kan inte felsökas av den som får rapporten.
       */
      const reason =
        enrollError && "code" in enrollError ? String(enrollError.code) : undefined;

      console.error("[burp] mfa.enroll misslyckades", enrollError);

      setError(reason === "mfa_totp_enroll_not_enabled" ? labels.notEnabled : labels.failed);
      setBusy(false);
      return;
    }

    setEnrollment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setBusy(false);
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!enrollment) return;

    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: code.trim(),
    });

    if (verifyError) {
      setError(labels.codeFailed);
      setCode("");
      setBusy(false);
      return;
    }

    setEnrollment(null);
    setHasFactor(true);
    setDone(true);
    setBusy(false);
  }

  async function cancelEnrollment() {
    if (!enrollment) return;

    setBusy(true);
    const supabase = createClient();
    await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    setEnrollment(null);
    setCode("");
    setBusy(false);
  }

  async function disable() {
    if (!window.confirm(labels.disableConfirm)) return;

    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();

    for (const factor of data?.all ?? []) {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removeError) {
        setError(labels.failed);
        setBusy(false);
        return;
      }
    }

    setHasFactor(false);
    setDone(false);
    setBusy(false);
  }

  if (hasFactor === null) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 size={16} aria-hidden="true" className="animate-spin" />
        {labels.loading}
      </p>
    );
  }

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-start gap-3">
        {hasFactor ? (
          <ShieldCheck size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-green-700" />
        ) : (
          <ShieldOff size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--muted)]" />
        )}

        <div className="min-w-0 flex-1">
          <p className="font-medium">{hasFactor ? labels.statusOn : labels.statusOff}</p>

          {done ? <p className="mt-1 text-sm text-green-700">{labels.enabled}</p> : null}

          {enrollment ? (
            <form onSubmit={confirm} className="mt-4 space-y-4">
              <p className="text-sm text-[var(--muted)]">{labels.scanHint}</p>

              {/*
                Rutan kommer som en färdig SVG i en data-URI från Supabase.
                `unoptimized` därför att Next inte kan optimera en data-URI, och
                den behöver det inte heller — den är redan så liten den blir.
              */}
              <Image
                src={enrollment.qrCode}
                alt=""
                width={200}
                height={200}
                unoptimized
                className="rounded-[var(--radius)] border border-[var(--rule)] bg-white p-2"
              />

              <p className="text-sm text-[var(--muted)]">
                {labels.secretHint}{" "}
                <code className="select-all break-all font-mono text-[var(--foreground)]">
                  {enrollment.secret}
                </code>
              </p>

              <label className="block">
                <span className="label-caps">{labels.codeLabel}</span>
                <input
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="field mt-1.5 max-w-[12rem] text-center text-xl tracking-[0.4em]"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy || code.trim().length < 6}
                  className="btn btn-primary"
                >
                  {labels.verify}
                </button>
                <button
                  type="button"
                  onClick={cancelEnrollment}
                  disabled={busy}
                  className="btn btn-secondary"
                >
                  {labels.cancel}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-3">
              {hasFactor ? (
                <button type="button" onClick={disable} disabled={busy} className="btn btn-secondary">
                  {labels.disable}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startEnrollment}
                  disabled={busy}
                  className="btn btn-primary"
                >
                  {labels.enable}
                </button>
              )}
            </div>
          )}

          {error ? (
            <p role="alert" className="mt-3 text-sm text-burp-700 dark:text-burp-100">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
