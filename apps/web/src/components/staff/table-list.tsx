"use client";

import { useState, useTransition } from "react";
import { archiveTable, setTableLocked } from "@/app/dashboard/bord/actions";
import { fill, type Dictionary } from "@/lib/i18n";
import type { TableWithQr } from "@/app/dashboard/bord/page";

/**
 * Bordslistan med QR-koder.
 *
 * Utskriften använder webbläsarens egen print-dialog mot en utskriftsstil.
 * Alternativet vore att generera en PDF på servern, men då måste någon
 * underhålla en PDF-layout — och restaurangen vill ändå kunna välja skrivare,
 * pappersstorlek och antal kopior i dialogen.
 */
export function TableList({
  tables,
  labels,
  tableLabel,
  openBillLabel,
}: {
  tables: TableWithQr[];
  /** Bordsytans texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["tables"];
  /** Mallen "Bord {number}" ur det delade ordertypsavsnittet. */
  tableLabel: string;
  /** Samma ord som översiktens tillstånd — se ordboken. */
  openBillLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);

  function toggleLock(table: TableWithQr) {
    setError(null);
    startTransition(async () => {
      const result = await setTableLocked(table.id, table.status !== "LOCKED");
      if (!result.ok) setError(result.message ?? labels.statusFailed);
    });
  }

  function archive(tableId: string) {
    setError(null);
    startTransition(async () => {
      const result = await archiveTable(tableId);
      if (!result.ok) setError(result.message ?? "Kunde inte arkivera bordet.");
      setConfirmArchive(null);
    });
  }

  return (
    <>
      <div className="mt-6 flex items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="border border-[var(--rule)] px-4 py-2 text-sm"
        >
          {labels.printAll}
        </button>
        <span className="text-sm opacity-60">{tables.length} bord</span>
      </div>

      {error ? (
        <p role="alert" className="mt-4 bg-red-600/10 px-3 py-2 text-sm text-red-700 print:hidden dark:text-red-400">
          {error}
        </p>
      ) : null}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {tables.map((table) => (
          <li
            key={table.id}
            className="card break-inside-avoid p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-2xl">
                  {fill(tableLabel, { number: table.tableNumber })}
                </p>
                <p className="text-sm opacity-60">
                  {[
                    table.zone,
                    table.capacity ? fill(labels.seatsCount, { n: table.capacity }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>

              {table.hasOpenSession ? (
                <span className="bg-green-600/15 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
                  {openBillLabel}
                </span>
              ) : null}
              {table.status === "LOCKED" ? (
                <span className="bg-red-600/15 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400">
                  {labels.locked}
                </span>
              ) : null}
            </div>

            {/* QR:en är genererad på servern som SVG. Innehållet är vår egen
                markup från qrcode-paketet, inte användarinmatning. */}
            <div
              className="mx-auto mt-4 w-40 [&_svg]:h-auto [&_svg]:w-full"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: table.qrSvg }}
            />

            <p className="mt-2 break-all text-center font-mono text-xs opacity-50">{table.url}</p>

            <div className="mt-4 flex gap-2 print:hidden">
              <button
                type="button"
                disabled={pending}
                onClick={() => toggleLock(table)}
                className="flex-1 border border-[var(--rule)] px-3 py-2 text-sm disabled:opacity-50"
              >
                {table.status === "LOCKED" ? labels.unlock : labels.lock}
              </button>

              {confirmArchive === table.id ? (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => archive(table.id)}
                    className="bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {labels.confirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmArchive(null)}
                    className="border border-[var(--rule)] px-3 py-2 text-sm"
                  >
                    {labels.cancel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmArchive(table.id)}
                  className="border border-[var(--rule)] px-3 py-2 text-sm"
                >
                  {labels.remove}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
