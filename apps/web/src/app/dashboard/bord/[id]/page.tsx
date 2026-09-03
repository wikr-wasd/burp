import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatMoney } from "@burp/core";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireStaff } from "@/lib/auth";
import { getTableOrders } from "@/lib/orders";
import { dictionary, fill, LOCALE_DATE_TAGS } from "@/lib/i18n";

/**
 * Vad det här bordet har beställt.
 *
 * Servitören klickade på ett bord i översikten. Frågan hen ställer är inte
 * "vilka order är aktiva" utan "vad har de fått, och vad är kvar att betala" —
 * därför hela sessionen och alla statusar, inte bara de som köket arbetar med.
 *
 * Servitören ska in här, alltså samma rollista som orderytan. Kocken
 * omdirigeras till `/kok` av `requireStaff`; han lagar mat och kvitterar inte
 * notor.
 *
 * Ingen interaktivitet: att kvittera och att återbetala hör hemma i kassan, där
 * hela handslaget finns. En andra knapp för samma sak här hade blivit en andra
 * väg att röra pengar, och den vägen ska det finnas exakt en av.
 */

export const metadata: Metadata = {
  title: "Bordet",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TablePage({ params }: PageProps) {
  const { id } = await params;
  const staff = await requireStaff(["owner", "manager", "staff"]);

  const table = await getTableOrders(staff.restaurantId, id);
  if (!table) notFound();

  const t = dictionary(staff.locale).staff;
  const money = (ore: number) => formatMoney(ore, staff.currency);
  const clock = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString(LOCALE_DATE_TAGS[staff.locale], {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: staff.timeZone,
        })
      : "";

  return (
    <StaffShell
      staff={staff}
      current="oversikt"
      title={fill(t.orderType.table, { number: table.tableNumber })}
      intro={table.zone ?? undefined}
      width="narrow"
    >
      <p className="mt-2">
        <Link href="/dashboard" className="link inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t.tableView.back}
        </Link>
      </p>

      {table.orders.length === 0 ? (
        <section className="card mt-6 px-4 py-10 text-center">
          <h2 className="font-display text-2xl">{t.tableView.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-sm text-[var(--muted)]">{t.tableView.emptyBody}</p>
        </section>
      ) : (
        <>
          {/*
            Summan står överst.

            Servitören som går till bordet bär två frågor i huvudet — vad de
            beställt och vad de är skyldiga — och den andra besvaras med en
            siffra. Att lägga den under en lista som kan vara tio order lång
            hade betytt att den viktigaste raden är den man ser sist.
          */}
          <section className="card mt-6 p-4">
            <dl className="grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="label-caps">{t.tableView.total}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {money(table.totalOre)}
                </dd>
              </div>
              <div>
                <dt className="label-caps">{t.tableView.paid}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">{money(table.paidOre)}</dd>
              </div>
              <div>
                <dt className="label-caps">{t.tableView.due}</dt>
                <dd
                  className={`mt-1 text-xl font-semibold tabular-nums ${
                    table.dueOre > 0 ? "text-burp-600" : "text-green-700 dark:text-green-400"
                  }`}
                >
                  {money(table.dueOre)}
                </dd>
              </div>
            </dl>

            {table.dueOre > 0 ? (
              <p className="mt-4 text-center">
                <Link href="/dashboard/kassa" className="btn btn-secondary">
                  {t.tableView.openReceipt}
                </Link>
              </p>
            ) : null}
          </section>

          <section className="mt-10">
            <h2 className="font-display text-2xl">{t.tableView.ordersTitle}</h2>

            <ul className="mt-3 space-y-3">
              {table.orders.map((order) => {
                const struck = order.status === "CANCELLED" || order.status === "REFUNDED";

                return (
                  <li key={order.id} className="card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="badge">{t.status[order.status]}</span>
                      <span className="text-sm text-[var(--muted)] tabular-nums">
                        {fill(t.tableView.placed, { time: clock(order.placedAt) })}
                      </span>
                    </div>

                    {/*
                      Raderna stryks men tas inte bort. Servitören ska se ATT
                      något ströks — annars ser bordet ut att ha beställt mindre
                      än gästen minns, och det är en diskussion vid disken.
                    */}
                    <ul
                      className={`mt-3 space-y-1.5 ${struck ? "opacity-60" : ""}`}
                    >
                      {order.items.map((item) => (
                        <li key={item.id} className="flex gap-3 text-sm">
                          <span className="w-8 shrink-0 tabular-nums">{item.quantity}×</span>
                          <span className={struck ? "line-through" : ""}>
                            {item.name}
                            {item.options.length > 0 ? (
                              <span className="block text-[var(--muted)]">
                                {item.options.join(" · ")}
                              </span>
                            ) : null}
                            {item.note ? (
                              <span className="block text-[var(--muted)] italic">{item.note}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {order.note ? (
                      <p className="mt-3 border-l-2 border-[var(--rule)] pl-3 text-sm italic">
                        {order.note}
                      </p>
                    ) : null}

                    <p className="mt-3 flex items-baseline justify-between gap-4 border-t border-[var(--rule)] pt-3 text-sm">
                      {struck ? (
                        <span className="text-[var(--muted)]">{t.tableView.notCounted}</span>
                      ) : (
                        <span />
                      )}
                      <span className={`font-semibold tabular-nums ${struck ? "line-through opacity-60" : ""}`}>
                        {money(order.totalOre)}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </StaffShell>
  );
}
