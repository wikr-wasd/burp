"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES, COUNTRY_INFO, type CountryCode } from "@burp/core";
import { createRestaurantAsAdmin, type ActionResult } from "@/app/backoffice/actions";
import type { ApplicationInput } from "@/lib/restaurant-application";

/**
 * Burp lägger upp en restaurang.
 *
 * Samma fält som ansökningsformuläret, med två skillnader som är hela skälet
 * till att Burp behöver en egen väg: statusen går att sätta, och ingen behöver
 * ha ett konto. Vid uppsökande försäljning finns ofta ett påskrivet avtal men
 * ingen inloggning ännu.
 *
 * Ligger bakom en `<details>`. Godkännandekön är det backoffice används till
 * varje dag; att lägga upp en restaurang för hand är undantaget och ska inte
 * ta plats från det vanliga.
 */
export function NewRestaurantForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [open, setOpen] = useState(false);

  const empty: ApplicationInput & { status: "PENDING" | "ACTIVE" } = {
    name: "",
    country: "BA",
    orgNumber: "",
    streetAddress: "",
    postalCode: "",
    city: "",
    phone: "",
    email: "",
    description: "",
    status: "ACTIVE",
  };

  const [form, setForm] = useState(empty);
  const info = COUNTRY_INFO[form.country as CountryCode] ?? COUNTRY_INFO.BA;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      className="card mt-6 p-5"
    >
      <summary className="cursor-pointer font-medium">Lägg upp en restaurang</summary>

      <form
        className="mt-5 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const outcome = await createRestaurantAsAdmin(form);
            setResult(outcome);
            if (outcome.ok) {
              setForm(empty);
              router.refresh();
            }
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label-caps">Land</span>
            <select
              value={form.country}
              onChange={(event) => set("country", event.target.value)}
              className="field mt-1.5"
            >
              {COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {COUNTRY_INFO[code].name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label-caps">Status</span>
            <select
              value={form.status}
              onChange={(event) =>
                set("status", event.target.value as "PENDING" | "ACTIVE")
              }
              className="field mt-1.5"
            >
              {/* ACTIVE som förval: en restaurang Burp själv lägger upp är
                  redan granskad. PENDING finns för det som ska in i kön ändå. */}
              <option value="ACTIVE">Aktiv — syns för gäster direkt</option>
              <option value="PENDING">Väntar — hamnar i granskningskön</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label-caps">Namn</span>
            <input
              required
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              className="field mt-1.5"
            />
          </label>

          <label className="block">
            <span className="label-caps">{info.orgNumberLabel}</span>
            <input
              required
              inputMode="numeric"
              value={form.orgNumber}
              onChange={(event) => set("orgNumber", event.target.value)}
              className="field mt-1.5"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <label className="block">
            <span className="label-caps">Gatuadress</span>
            <input
              required
              value={form.streetAddress}
              onChange={(event) => set("streetAddress", event.target.value)}
              className="field mt-1.5"
            />
          </label>
          <label className="block">
            <span className="label-caps">Postnr</span>
            <input
              required
              inputMode="numeric"
              value={form.postalCode}
              onChange={(event) => set("postalCode", event.target.value)}
              className="field mt-1.5"
            />
          </label>
          <label className="block">
            <span className="label-caps">Stad</span>
            <input
              required
              value={form.city}
              onChange={(event) => set("city", event.target.value)}
              className="field mt-1.5"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label-caps">Telefon</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => set("phone", event.target.value)}
              placeholder={`${info.phonePrefix} …`}
              className="field mt-1.5"
            />
          </label>
          <label className="block">
            <span className="label-caps">E-post</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
              className="field mt-1.5"
            />
          </label>
        </div>

        {result?.message ? (
          <p
            role="alert"
            className="border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100"
          >
            {result.message}
          </p>
        ) : null}

        {result?.ok ? (
          <p role="status" className="border-l-2 border-green-600 bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
            Upplagd. Ingen ägare är knuten än — gör det via restaurangens
            personalflik när kontot finns.
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Lägger upp…" : "Lägg upp"}
        </button>
      </form>
    </details>
  );
}
