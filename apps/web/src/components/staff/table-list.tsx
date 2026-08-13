"use client";

import { useState, useTransition } from "react";
import { archiveTable, setTableLocked } from "@/app/dashboard/bord/actions";
import type { TableWithQr } from "@/app/dashboard/bord/page";

/**
 * Bordslistan med QR-koder.
 *
 * Utskriften använder webbläsarens egen print-dialog mot en utskriftsstil.
 * Alternativet vore att generera en PDF på servern, men då måste någon
 * underhålla en PDF-layout — och restaurangen vill ändå kunna välja skrivare,
 * pappersstorlek och antal kopior i dialogen.
 */
export function TableList({ tables }: { tables: TableWithQr[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);

  function toggleLock(table: TableWithQr) {
    setError(null);
    startTransition(async () => {
      const result = await setTableLocked(table.id, table.status !== "LOCKED");
      if (!result.ok) setError(result.message ?? "Kunde inte ändra bordets status.");
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
          className="rounded-md border border-black/15 px-4 py-2 text-sm dark:border-white/20"
        >
          Skriv ut alla koder
        </button>
        <span className="text-sm opacity-60">{tables.length} bord</span>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-red-600/10 px-3 py-2 text-sm text-red-700 print:hidden dark:text-red-400">
          {error}
        </p>
      ) : null}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {tables.map((table) => (
          <li
            key={table.id}
            className="break-inside-avoid rounded-xl border border-black/10 p-4 dark:border-white/15"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">Bord {table.tableNumber}</p>
                <p className="text-sm opacity-60">
                  {[table.zone, table.capacity ? `${table.capacity} platser` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>

              {table.hasOpenSession ? (
                <span className="rounded-full bg-green-600/15 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
                  Öppen nota
                </span>
              ) : null}
              {table.status === "LOCKED" ? (
                <span className="rounded-full bg-red-600/15 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400">
                  Låst
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
                className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20"
              >
                {table.status === "LOCKED" ? "Lås upp" : "Lås bordet"}
              </button>

              {confirmArchive === table.id ? (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => archive(table.id)}
                    className="rounded-md bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Bekräfta
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmArchive(null)}
                    className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
                  >
                    Avbryt
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmArchive(table.id)}
                  className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
                >
                  Ta bort
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
