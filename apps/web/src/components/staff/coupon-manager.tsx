"use client";

import { useState, useTransition } from "react";
import { Plus, Ticket } from "lucide-react";
import { formatMoney, normalizeCouponCode, type CurrencyCode } from "@burp/core";
import {
  createCoupon,
  setCouponActive,
  type CouponInput,
} from "@/app/dashboard/erbjudanden/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Rabattkoder.
 *
 * Formuläret gör ett val åt restaurangen som är värt att förstå: en kupong ger
 * ANTINGEN procent ELLER ett fast belopp, aldrig båda. Det är inte en
 * begränsning i gränssnittet utan i databasen (`coupons_one_kind`) — en kupong
 * som ger både 20 % och 5 mark är en kupong ingen kan svara på vad den ger.
 */

export interface CouponRow {
  id: string;
  code: string;
  discountOre: number | null;
  discountBps: number | null;
  minOrderOre: number;
  maxDiscountOre: number | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  maxPerGuest: number;
  isActive: boolean;
  redemptions: number;
  redeemedOre: number;
}

const EMPTY: CouponInput = {
  code: "",
  kind: "PERCENT",
  percent: "10",
  amount: "",
  maxDiscount: "",
  minOrder: "",
  validUntil: "",
  maxRedemptions: "",
  maxPerGuest: "1",
};

export function CouponManager({
  coupons,
  currency,
  labels,
}: {
  coupons: CouponRow[];
  currency: CurrencyCode;
  /** Rapportytornas texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["reports"];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CouponInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof CouponInput>(key: K, value: CouponInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await createCoupon(form);
      if (result.ok) {
        setForm(EMPTY);
        setOpen(false);
      } else {
        setError(result.message ?? "Kupongen kunde inte skapas.");
      }
    });
  }

  return (
    <div className="mt-8">
      {open ? (
        <div className="card p-4">
          <h2 className="font-display text-xl">{labels.newCoupon}</h2>

          <label className="mt-4 block">
            <span className="label-caps">{labels.code}</span>
            <input
              type="text"
              value={form.code}
              onChange={(event) => set("code", event.target.value)}
              onBlur={(event) => set("code", normalizeCouponCode(event.target.value))}
              placeholder={labels.codePlaceholder}
              className="field mt-1.5 uppercase"
            />
            {/* Gästen skriver av koden från en skylt eller ett sms. Skiftläge,
                mellanslag och bindestreck plockas bort på båda sidor — en kod
                som inte fungerar för att någon skrev "sommar 25" är ingen
                säkerhetsåtgärd, bara en förlorad beställning. */}
            <span className="mt-1 block text-xs text-[var(--muted)]">
              {labels.codeHint}
            </span>
          </label>

          <div className="mt-4">
            <span className="label-caps">{labels.discount}</span>
            <div className="mt-1.5 flex gap-2">
              {(["PERCENT", "AMOUNT"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={form.kind === kind}
                  onClick={() => set("kind", kind)}
                  className={`min-h-11 flex-1 rounded-lg border text-sm font-medium transition-colors ${
                    form.kind === kind
                      ? "border-burp-600 bg-burp-600 text-white"
                      : "border-[var(--rule)] hover:border-burp-600"
                  }`}
                >
                  {kind === "PERCENT" ? labels.percent : labels.fixedAmount}
                </button>
              ))}
            </div>
          </div>

          {form.kind === "PERCENT" ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <label className="w-28">
                <span className="label-caps">{labels.percent}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.percent}
                  onChange={(event) => set("percent", event.target.value)}
                  className="field mt-1.5 tabular-nums"
                />
              </label>
              <label className="min-w-40 flex-1">
                <span className="label-caps">{labels.cap}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.maxDiscount}
                  onChange={(event) => set("maxDiscount", event.target.value)}
                  placeholder={`i ${currency}`}
                  className="field mt-1.5 tabular-nums"
                />
              </label>
            </div>
          ) : (
            <label className="mt-4 block w-40">
              <span className="label-caps">{labels.amount}</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => set("amount", event.target.value)}
                placeholder={`i ${currency}`}
                className="field mt-1.5 tabular-nums"
              />
            </label>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="w-40">
              <span className="label-caps">{labels.minimumBill}</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.minOrder}
                onChange={(event) => set("minOrder", event.target.value)}
                placeholder={labels.none}
                className="field mt-1.5 tabular-nums"
              />
            </label>

            <label className="w-40">
              <span className="label-caps">{labels.validUntil}</span>
              <input
                type="date"
                value={form.validUntil}
                onChange={(event) => set("validUntil", event.target.value)}
                className="field mt-1.5"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="w-40">
              <span className="label-caps">{labels.totalCount}</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.maxRedemptions}
                onChange={(event) => set("maxRedemptions", event.target.value)}
                placeholder={labels.unlimited}
                className="field mt-1.5 tabular-nums"
              />
            </label>

            <label className="w-40">
              <span className="label-caps">{labels.perGuest}</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.maxPerGuest}
                onChange={(event) => set("maxPerGuest", event.target.value)}
                className="field mt-1.5 tabular-nums"
              />
              {/* En gräns per gäst kräver ett konto att räkna på. Den anonyma
                  QR-gästen går inte att räkna inlösen på och stängs därför ute
                  av en sådan kupong — 0 släpper in henne. */}
              <span className="mt-1 block text-xs text-[var(--muted)]">
                0 = ingen gräns, och koden fungerar då även vid bordet.
              </span>
            </label>
          </div>

          {error ? (
            <p role="alert" className="mt-4 border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={submit} disabled={pending} className="btn btn-primary">
              {pending ? labels.creating : labels.create}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="btn btn-secondary"
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
          <Plus size={16} aria-hidden="true" />
          {labels.newCoupon}
        </button>
      )}

      {coupons.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Ticket}
            title={labels.couponsEmptyTitle}
            body={labels.couponsEmptyBody}
          />
        </div>
      ) : (
        <ul className="card mt-8 divide-y divide-[var(--rule)]">
          {coupons.map((coupon) => (
            <CouponRowView key={coupon.id} coupon={coupon} currency={currency} labels={labels} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CouponRowView({
  coupon,
  currency,
  labels,
}: {
  coupon: CouponRow;
  currency: CurrencyCode;
  /** Rapportytornas texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["reports"];
}) {
  const [pending, startTransition] = useTransition();

  const value =
    coupon.discountBps !== null
      ? `${coupon.discountBps / 100} %`
      : formatMoney(coupon.discountOre ?? 0, currency);

  const used =
    coupon.maxRedemptions !== null
      ? fill(labels.usedOf, { used: coupon.redemptions, total: coupon.maxRedemptions })
      : fill(labels.usedTimes, { used: coupon.redemptions });

  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
      <span className={`font-medium ${coupon.isActive ? "" : "text-[var(--muted)] line-through"}`}>
        {coupon.code}
      </span>
      <span className="tabular-nums">{value}</span>

      <span className="mr-auto text-sm text-[var(--muted)]">
        {used}
        {coupon.redeemedOre > 0
          ? ` · ${fill(labels.inDiscount, { amount: formatMoney(coupon.redeemedOre, currency) })}`
          : ""}
        {coupon.validUntil
          ? ` · till ${new Date(coupon.validUntil).toLocaleDateString("sv-SE")}`
          : ""}
      </span>

      {/* Avstängning, inte borttagning. Inlösenraderna pekar på kupongen och
          behöver den för att gå att läsa i efterhand. */}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setCouponActive(coupon.id, !coupon.isActive);
          })
        }
        className="min-h-11 text-sm text-[var(--muted)] underline underline-offset-2 hover:text-burp-600"
      >
        {coupon.isActive ? labels.turnOff : labels.turnOn}
      </button>
    </li>
  );
}
