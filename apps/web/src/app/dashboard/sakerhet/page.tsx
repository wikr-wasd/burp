import type { Metadata } from "next";
import { StaffShell } from "@/components/staff/staff-shell";
import { MfaSettings } from "@/components/staff/mfa-settings";
import { mfaLabels } from "@/components/staff/mfa-labels";
import { requireStaff } from "@/lib/auth";
import { dictionary } from "@/lib/i18n";

/**
 * Din inloggning.
 *
 * Egen sida och inte en sektion i Inställningar, därför att Inställningar är
 * restaurangens och kräver ägare eller chef. Andra faktorn är personens egen,
 * och kocken — som aldrig ser den sidan — har den inloggning som står
 * påslagen längst av alla. Samma resonemang som språkväljaren i menyn.
 *
 * `requireStaff()` utan rollista: varje anställd får skydda sitt eget konto.
 */

export const metadata: Metadata = {
  title: "Din inloggning",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const staff = await requireStaff();
  const t = dictionary(staff.locale).staff;

  return (
    <StaffShell
      staff={staff}
      current="sakerhet"
      title={t.section.sakerhet}
      intro={staff.email ?? undefined}
      width="narrow"
    >
      <section className="mt-6">
        <h2 className="font-display text-2xl">{t.settings.mfaTitle}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{t.settings.mfaHint}</p>
        <MfaSettings labels={mfaLabels(t.settings)} />
      </section>
    </StaffShell>
  );
}
