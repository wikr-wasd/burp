"use client";

import { useState, useTransition } from "react";
import { formatMoney, type CurrencyCode } from "@burp/core";
import {
  closeSettlementPeriod,
  closeSettlementPeriods,
  discardSettlementDraft,
  setSettlementStatus,
} from "@/app/backoffice/avrakning/actions";
import { SettlementFigures, SettlementStatusBadge } from "@/components/staff/settlement-figures";
import type { MonthBounds, Settlement, SettlementNumbers } from "@/lib/settlement-period";
import type { Dictionary } from "@/lib/i18n";

/**
 * Månadens avräkning, restaurang för restaurang.
 *
 * En rad kan stå i två lägen och det är hela vyns logik:
 *
 *   Öppen   — perioden är inte stängd. Siffrorna är en FÖRHANDSVISNING och
 *             räknas om vid varje sidladdning.
 *   Stängd  — det finns en avräkning. Då visas de LAGRADE siffrorna, inte
 *             förhandsvisningens. Ett underlag någon fått i handen ska inte
 *             ändra sig på skärmen bredvid statusen "Fakturerad".
 *
 * Utkastet är undantaget: det får räknas om, så där visas båda när de skiljer
 * sig åt.
 */

export interface SettlementBoardRow {
  restaurantId: string;
  restaurantName: string;
  currency: CurrencyCode | null;
  preview: SettlementNumbers;
  settlement: Settlement | null;
}

export function SettlementBoard({
  bounds,
  rows,
  toClose,
  canWrite,
  figureLabels,
}: {
  bounds: MonthBounds;
  rows: SettlementBoardRow[];
  /** Restauranger som massknappen tar. Perioder utan order räknas inte in. */
  toClose: readonly string[];
  canWrite: boolean;
  /** Avräkningens sifferetiketter. Backoffice är svensk — se ordboken. */
  figureLabels: Dictionary["staff"]["reports"];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.message ?? "Åtgärden misslyckades.");
    });
  }

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius)] bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}

      {canWrite && toClose.length > 0 ? (
        <div className="card mt-4 flex flex-wrap items-center justify-between gap-4 p-4">
          <p className="text-sm">
            {toClose.length} {toClose.length === 1 ? "restaurang" : "restauranger"} har order i
            perioden men ingen avräkning.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => closeSettlementPeriods(toClose, bounds.start, bounds.end))}
            className="btn btn-primary"
          >
            Stäng perioden för alla
          </button>
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {rows.map((row) => {
          const settlement = row.settlement;
          const shown = settlement ?? row.preview;
          const currency = (settlement?.currency ?? row.currency) as CurrencyCode | null;
          const isOpen = expanded === row.restaurantId;

          // Ett utkast får räknas om, och gör det inte av sig självt. Skiljer
          // det sig från underlaget just nu är det värt att säga innan någon
          // fakturerar en siffra som hunnit bli inaktuell.
          const drifted =
            settlement?.status === "DRAFT" &&
            settlement.amountDueOre !== row.preview.amountDueOre;

          return (
            <li key={row.restaurantId} className="card">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.restaurantName}</p>
                  <p className="label-caps mt-0.5 normal-case">
                    {shown.ordersCount} {shown.ordersCount === 1 ? "order" : "order"}
                    {currency ? (
                      <> · {formatMoney(shown.grossOre, currency)} omsatt</>
                    ) : (
                      <> · flera valutor i perioden</>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {settlement ? (
                    <SettlementStatusBadge status={settlement.status} />
                  ) : (
                    <span className="badge bg-[var(--background)] text-[var(--muted)]">Öppen</span>
                  )}

                  <span className="text-lg font-semibold tabular-nums">
                    {currency ? formatMoney(shown.amountDueOre, currency) : "—"}
                  </span>

                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : row.restaurantId)}
                    aria-expanded={isOpen}
                    className="btn btn-secondary min-h-9 px-3 text-sm"
                  >
                    {isOpen ? "Dölj" : "Visa"}
                  </button>
                </div>
              </div>

              {currency === null ? (
                <p className="border-t border-[var(--rule)] px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                  Perioden innehåller order i fler än en valuta och går inte att summera. Det
                  händer bara om restaurangen bytt land mitt i månaden — dela perioden vid bytet.
                </p>
              ) : null}

              {drifted && currency ? (
                <p className="border-t border-[var(--rule)] px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                  Underlaget har ändrats sedan utkastet skrevs — det räknas nu till{" "}
                  {formatMoney(row.preview.amountDueOre, currency)}. Kasta utkastet och stäng
                  perioden på nytt.
                </p>
              ) : null}

              {isOpen && currency ? (
                <div className="border-t border-[var(--rule)]">
                  <SettlementFigures numbers={shown} currency={currency} labels={figureLabels} />
                </div>
              ) : null}

              {canWrite ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule)] px-4 py-3">
                  {!settlement ? (
                    <button
                      type="button"
                      disabled={pending || currency === null}
                      onClick={() =>
                        run(() =>
                          closeSettlementPeriod(row.restaurantId, bounds.start, bounds.end),
                        )
                      }
                      className="btn btn-secondary min-h-9 text-sm"
                    >
                      Stäng perioden
                    </button>
                  ) : null}

                  {settlement?.status === "DRAFT" ? (
                    invoicing === settlement.id ? (
                      <div className="flex w-full flex-wrap items-end gap-2">
                        <label className="min-w-48 flex-1">
                          <span className="text-sm font-medium">Fakturanummer</span>
                          <input
                            value={invoiceNumber}
                            onChange={(event) => setInvoiceNumber(event.target.value)}
                            maxLength={40}
                            autoFocus
                            placeholder="B-2026-0142"
                            className="field mt-1 w-full"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={pending || invoiceNumber.trim() === ""}
                          onClick={() => {
                            const number = invoiceNumber;
                            run(() =>
                              setSettlementStatus(settlement.id, "DRAFT", "INVOICED", number),
                            );
                            setInvoicing(null);
                            setInvoiceNumber("");
                          }}
                          className="btn btn-primary min-h-9 text-sm"
                        >
                          Markera fakturerad
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInvoicing(null);
                            setInvoiceNumber("");
                          }}
                          className="btn btn-secondary min-h-9 text-sm"
                        >
                          Avbryt
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setInvoicing(settlement.id)}
                          className="btn btn-primary min-h-9 text-sm"
                        >
                          Fakturera
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => discardSettlementDraft(settlement.id))}
                          className="btn btn-secondary min-h-9 text-sm"
                        >
                          Kasta utkastet
                        </button>
                      </>
                    )
                  ) : null}

                  {settlement?.status === "INVOICED" ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => setSettlementStatus(settlement.id, "INVOICED", "PAID"))
                        }
                        className="btn btn-primary min-h-9 text-sm"
                      >
                        Markera betald
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => setSettlementStatus(settlement.id, "INVOICED", "VOID"))
                        }
                        className="btn btn-secondary min-h-9 text-sm"
                      >
                        Makulera
                      </button>
                    </>
                  ) : null}

                  {settlement?.invoiceNumber ? (
                    <span className="label-caps ml-auto normal-case">
                      Faktura {settlement.invoiceNumber}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
