"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2 } from "lucide-react";
import { formatMoney, type CurrencyCode } from "@burp/core";
import type { Dictionary } from "@/lib/i18n";
import { fill } from "@/lib/i18n";

/**
 * Boka bord.
 *
 * ── Varför tiderna hämtas och aldrig räknas här ─────────────────────────────
 *
 * Vilka tider som är lediga avgörs av `reservation_slots()` i databasen. Den
 * här komponenten frågar och visar; den bedömer aldrig själv. Två uträkningar
 * av samma sak glider isär, och då visar sidan en tid som bokningen sedan
 * nekar — precis det `open_restaurant_ids` (migration 0025) en gång infördes
 * för att undvika.
 *
 * ── Ordningen: dag, sällskap, tid, bord ─────────────────────────────────────
 *
 * Bordet väljs SIST och bara bland dem som faktiskt är lediga just då. Att
 * välja bord först hade betytt att gästen fastnar för fönsterbordet och sedan
 * får veta att det är upptaget hela kvällen.
 *
 * ── Inget konto ─────────────────────────────────────────────────────────────
 *
 * Samma löfte som QR-beställningen. Namnet är det restaurangen behöver;
 * telefonnumret är det de ringer om något ändras. Är gästen inloggad knyts
 * bokningen till kontot av servern, utan att formuläret frågar om det.
 */

interface SlotTable {
  at: string;
  tableId: string;
  tableNumber: string;
  zone: string | null;
  capacity: number;
  attributes: string[];
  surchargeOre: number;
}

interface TimeOption {
  at: string;
  tables: SlotTable[];
}

export function BookingForm({
  restaurantId,
  currency,
  timeZone,
  localeTag,
  initialDate,
  maxPartySize,
  horizonDays,
  labels,
}: {
  restaurantId: string;
  currency: CurrencyCode;
  timeZone: string;
  /** Språktagg för datum och klockslag, t.ex. "bs-BA". */
  localeTag: string;
  /** Dagens datum i RESTAURANGENS tidszon, ISO. Räknat på servern. */
  initialDate: string;
  maxPartySize: number;
  horizonDays: number;
  labels: Dictionary["booking"];
}) {
  const router = useRouter();

  const [date, setDate] = useState(initialDate);
  const [partySize, setPartySize] = useState(2);
  const [times, setTimes] = useState<TimeOption[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedAt, setSelectedAt] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = useCallback(
    (amount: number) => formatMoney(amount, currency, localeTag),
    [currency, localeTag],
  );

  const clock = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { timeZone, hour: "2-digit", minute: "2-digit" }),
    [localeTag, timeZone],
  );

  /** Sista bokningsbara dagen. Bortom horisonten finns inga tider att visa. */
  const lastDate = useMemo(() => {
    const last = new Date(`${initialDate}T12:00:00Z`);
    last.setUTCDate(last.getUTCDate() + horizonDays);
    return last.toISOString().slice(0, 10);
  }, [initialDate, horizonDays]);

  /*
   * Tiderna hämtas om när dag eller sällskap ändras.
   *
   * Valet nollställs samtidigt: en tid som valdes för fyra personer är inte
   * med säkerhet ledig för sex, och ett bord som stod kvar markerat hade
   * skickat en bokning gästen inte längre menade.
   */
  useEffect(() => {
    let cancelled = false;

    setSelectedAt(null);
    setSelectedTable(null);
    setError(null);
    setLoading(true);

    const params = new URLSearchParams({
      restaurant: restaurantId,
      date,
      party: String(partySize),
    });

    fetch(`/api/reservations?${params}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { slots?: TimeOption[] } | null) => {
        if (cancelled) return;
        setTimes(payload?.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setTimes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId, date, partySize]);

  const tablesForTime = times?.find((option) => option.at === selectedAt)?.tables ?? [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedAt || !selectedTable) return;

    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        table_id: selectedTable,
        at: selectedAt,
        party_size: partySize,
        guest_name: name,
        guest_phone: phone,
        guest_email: email,
        note,
      }),
    }).catch(() => null);

    if (!response) {
      setError(labels.errorUnknown);
      setSubmitting(false);
      return;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      /*
       * 409 är inte ett fel i formuläret.
       *
       * Någon annan hann före mellan att sidan laddades och knappen trycktes —
       * det normala fallet klockan sju en fredag. Gästen ska få nya tider, inte
       * ombes rätta något.
       */
      if (response.status === 409) {
        setError(labels.errorTaken);
        setSelectedAt(null);
        setSelectedTable(null);
        setPartySize((current) => current); // triggar ingen hämtning
        refresh();
      } else {
        setError(problemText(payload?.problem, labels));
      }

      setSubmitting(false);
      return;
    }

    // Nyckeln kommer tillbaka en enda gång. Den ligger i adressen till
    // bekräftelsen och är gästens enda bevis på att bokningen är hens.
    router.push(`/bokning/${payload.reservation_id}?nyckel=${payload.cancel_token}`);
  }

  function refresh() {
    setLoading(true);
    const params = new URLSearchParams({
      restaurant: restaurantId,
      date,
      party: String(partySize),
    });

    void fetch(`/api/reservations?${params}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { slots?: TimeOption[] } | null) => setTimes(payload?.slots ?? []))
      .catch(() => setTimes([]))
      .finally(() => setLoading(false));
  }

  return (
    <form onSubmit={submit} className="card mt-5 p-4 sm:p-6">
      <div className="flex flex-wrap gap-4">
        <label className="block basis-44">
          <span className="label-caps">{labels.date}</span>
          <input
            type="date"
            value={date}
            min={initialDate}
            max={lastDate}
            onChange={(event) => setDate(event.target.value)}
            className="field mt-1.5"
          />
        </label>

        <label className="block basis-32">
          <span className="label-caps">{labels.partySize}</span>
          <select
            value={partySize}
            onChange={(event) => setPartySize(Number(event.target.value))}
            className="field mt-1.5"
          >
            {Array.from({ length: maxPartySize }, (_, index) => index + 1).map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6">
        <span className="label-caps">{labels.chooseTime}</span>

        {loading ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 size={16} aria-hidden="true" className="animate-spin" />
            {labels.searching}
          </p>
        ) : times && times.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">{labels.noTimes}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {(times ?? []).map((option) => (
              <li key={option.at}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAt(option.at);
                    // Minsta lediga bord är först i listan och är rätt val för
                    // de allra flesta. Den som vill ha fönsterbordet byter.
                    setSelectedTable(option.tables[0]?.tableId ?? null);
                  }}
                  aria-pressed={option.at === selectedAt}
                  className={`chip ${option.at === selectedAt ? "chip-active" : ""}`}
                >
                  {clock.format(new Date(option.at))}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedAt && tablesForTime.length > 0 ? (
        <fieldset className="mt-6">
          <legend className="label-caps">{labels.chooseTable}</legend>

          <ul className="mt-2 space-y-2">
            {tablesForTime.map((table) => (
              <li key={table.tableId}>
                <label className="flex cursor-pointer items-center gap-3 border border-[var(--rule)] p-3 has-[:checked]:border-burp-600">
                  <input
                    type="radio"
                    name="table"
                    value={table.tableId}
                    checked={selectedTable === table.tableId}
                    onChange={() => setSelectedTable(table.tableId)}
                    className="accent-burp-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {fill(labels.tableLabel, { number: table.tableNumber })}
                      {table.zone ? ` · ${table.zone}` : ""}
                    </span>
                    <span className="block text-sm text-[var(--muted)]">
                      {table.attributes.length > 0
                        ? table.attributes.map((key) => attributeLabel(key, labels)).join(" · ")
                        : labels.standardTable}
                    </span>
                  </span>

                  {/* Tillägget läggs på notan i restaurangen. Burp tar aldrig
                      emot beloppet — se migration 0054. */}
                  {table.surchargeOre > 0 ? (
                    <span className="shrink-0 font-semibold tabular-nums">
                      +{money(table.surchargeOre)}
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>

          {tablesForTime.some((table) => table.surchargeOre > 0) ? (
            <p className="mt-2 text-sm text-[var(--muted)]">{labels.surchargeHint}</p>
          ) : null}
        </fieldset>
      ) : null}

      {selectedAt ? (
        <div className="mt-6 space-y-4 border-t border-[var(--rule)] pt-5">
          <label className="block">
            <span className="label-caps">{labels.name}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
              autoComplete="name"
              className="field mt-1.5"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="block flex-1 basis-44">
              <span className="label-caps">{labels.phone}</span>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={40}
                autoComplete="tel"
                className="field mt-1.5"
              />
            </label>

            <label className="block flex-1 basis-44">
              <span className="label-caps">{labels.email}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={200}
                autoComplete="email"
                className="field mt-1.5"
              />
            </label>
          </div>

          <label className="block">
            <span className="label-caps">{labels.note}</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder={labels.notePlaceholder}
              className="field mt-1.5"
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || !selectedTable || name.trim() === ""}
            className="btn btn-primary w-full sm:w-auto"
          >
            <CalendarCheck size={16} aria-hidden="true" />
            {submitting ? labels.submitting : labels.submit}
          </button>
        </div>
      ) : null}
    </form>
  );
}

/**
 * Bordens egenskaper är GRÄNSSNITT och översätts.
 *
 * Till skillnad från restaurangens egna texter, som står kvar som de skrivits.
 * Nyckeln kommer ur en fast lista i migration 0054 just därför att den ska gå
 * att översätta — en fritext hade betytt att "prozor", "Fenster" och "fönster"
 * är tre olika bord.
 */
function attributeLabel(key: string, labels: Dictionary["booking"]): string {
  const known = labels.attribute as Record<string, string>;
  return known[key] ?? key;
}

function problemText(problem: unknown, labels: Dictionary["booking"]): string {
  switch (problem) {
    case "PARTY_TOO_LARGE":
      return labels.errorPartyTooLarge;
    case "TOO_SOON":
      return labels.errorTooSoon;
    case "TOO_FAR":
      return labels.errorTooFar;
    case "NO_NAME":
      return labels.errorNoName;
    case "DISABLED":
      return labels.errorDisabled;
    default:
      return labels.errorUnknown;
  }
}
