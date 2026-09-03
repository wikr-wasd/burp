import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, Undo2, CircleX } from "lucide-react";
import { formatMoney } from "@burp/core";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { dictionary, type Dictionary } from "@/lib/i18n";
import { getMoneyEvents } from "@/lib/money-events";
import { isPeriodKey, periodFor, PERIODS, type PeriodKey } from "@/lib/statistics";

/**
 * Vem gjorde vad med pengarna.
 *
 * Ägare och chef. Servitören står med i listan — det är hon som kvitterar
 * notorna — och en logg över vem som rört pengarna ska läsas av den som har
 * ansvar för dem, inte av alla som förekommer i den. Databasen säger samma sak
 * en gång till: `restaurant_money_events()` vägrar för andra roller.
 *
 * Sidan visar två saker och inte allt: återbetalningar och avbrutna order. Det
 * är de två som kostar pengar och som någon frågar om i efterhand. En logg som
 * visar varje statusändring drunknar i "Serverad" och blir därför inte läst.
 */

export const metadata: Metadata = {
  title: "Händelser",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}


export default async function MoneyEventsPage({ searchParams }: PageProps) {
  const staff = await requireStaff(["owner", "manager"]);
  const params = await searchParams;

  const periodKey: PeriodKey = isPeriodKey(params.period) ? params.period : "manad";
  const period = periodFor(periodKey);
  const events = await getMoneyEvents(staff.restaurantId, period.from, period.to);

  const clock = new Intl.DateTimeFormat("sv-SE", {
    timeZone: staff.timeZone,
    dateStyle: "short",
    timeStyle: "short",
  });

  const t = dictionary(staff.locale).staff;

  return (
    <StaffShell
      staff={staff}
      current="handelser"
      title={t.reports.eventsTitle}
      intro={t.reports.eventsIntro}
      width="narrow"
      actions={
        <nav className="flex gap-2" aria-label="Period">
          {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
            <Link
              key={key}
              href={`/dashboard/handelser?period=${key}`}
              aria-current={key === periodKey ? "page" : undefined}
              className={`chip ${key === periodKey ? "chip-active" : ""}`}
            >
              {PERIODS[key].label}
            </Link>
          ))}
        </nav>
      }
    >
      {events.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Ingenting att redovisa i perioden"
          body={t.reports.eventsEmptyBody}
        />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => {
            const Icon = event.kind === "REFUND" ? Undo2 : CircleX;

            return (
              <li key={`${event.kind}-${event.orderId}-${event.at}`} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="flex items-center gap-2 font-medium">
                    <Icon size={16} aria-hidden="true" className="text-[var(--muted)]" />
                    {event.kind === "REFUND" ? t.reports.eventRefund : t.reports.eventCancelled}
                  </p>
                  <p className="tabular-nums font-semibold">
                    {event.kind === "REFUND" ? "−" : ""}
                    {formatMoney(event.amountOre, event.currency)}
                  </p>
                </div>

                <p className="label-caps mt-1 normal-case">
                  {clock.format(new Date(event.at))} · {describeActor(event.actorKind, event.actorName, t.reports)}
                </p>

                {/* Skälet är obligatoriskt på en återbetalning (migration 0027)
                    — en motbokning utan skäl är oförklarlig för den som stämmer
                    av kassan tre månader senare. Här är den läsbar. */}
                {event.reason ? (
                  <p className="mt-2 text-sm">{event.reason}</p>
                ) : null}

                <p className="mt-2 text-xs text-[var(--muted)]">
                  Beställning {event.orderId.slice(0, 8)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-sm text-[var(--muted)]">
        {t.reports.eventsCancelHint}
      </p>
    </StaffShell>
  );
}

/** "Test Ägare" eller, när ingen människa låg bakom, vad som faktiskt hände. */
function describeActor(
  kind: string,
  name: string | null,
  labels: Dictionary["staff"]["reports"],
): string {
  if (name) return name;
  if (kind === "GUEST") return labels.actorGuest;
  if (kind === "WEBHOOK") return labels.actorWebhook;
  return labels.actorSystem;
}
