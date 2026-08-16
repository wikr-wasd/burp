"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES, COUNTRY_INFO, type CountryCode } from "@burp/core";
import { applyForRestaurant, type ActionResult } from "@/app/anslut/actions";
import type { ApplicationInput } from "@/lib/restaurant-application";

/**
 * Ansökningsformuläret.
 *
 * Landet väljs först och styr resten: vad organisationsnumret heter, hur många
 * siffror det har, vilket landsnummer telefonen börjar med. Att fråga om land
 * sist — som formulär ofta gör, eftersom det känns som en detalj — betyder att
 * fälten ovanför inte kan hjälpa till förrän man fyllt i dem.
 *
 * Inget fält frågar om moms, valuta eller tidszon. Allt tre följer av landet
 * och skulle bara vara tre fler sätt att fylla i fel.
 */
export function ApplicationForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState<ApplicationInput>({
    name: "",
    country: "BA",
    orgNumber: "",
    streetAddress: "",
    postalCode: "",
    city: "",
    phone: "",
    email: "",
    description: "",
  });

  const info = COUNTRY_INFO[form.country as CountryCode] ?? COUNTRY_INFO.BA;

  function set<K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  if (done) {
    return (
      <div className="card mt-8 p-6">
        <h2 className="font-display text-2xl">Tack — ansökan är inne.</h2>
        <p className="mt-3 text-[var(--muted)]">
          Burp går igenom den och hör av sig. Under tiden kan du redan lägga upp
          menyn och öppettiderna: din restaurang är osynlig för gäster tills den
          godkänts, så ingenting du gör nu syns utåt i förväg.
        </p>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="btn btn-primary mt-6"
        >
          Till din dashboard
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-8 space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const outcome = await applyForRestaurant(form);
          setResult(outcome);
          if (outcome.ok) {
            setDone(true);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <label className="label-caps" htmlFor="country">
          Land
        </label>
        <select
          id="country"
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
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Avgör valuta ({info.currency}), momssatser och tidszon. Går att ändra
          senare bara genom Burp.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="label-caps" htmlFor="name">
            Restaurangens namn
          </label>
          <input
            id="name"
            required
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            className="field mt-1.5"
          />
        </div>

        <div>
          <label className="label-caps" htmlFor="org">
            {info.orgNumberLabel}
          </label>
          <input
            id="org"
            required
            inputMode="numeric"
            value={form.orgNumber}
            onChange={(event) => set("orgNumber", event.target.value)}
            className="field mt-1.5"
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <label className="label-caps" htmlFor="street">
            Gatuadress
          </label>
          <input
            id="street"
            required
            value={form.streetAddress}
            onChange={(event) => set("streetAddress", event.target.value)}
            className="field mt-1.5"
          />
        </div>
        <div>
          <label className="label-caps" htmlFor="postal">
            Postnummer
          </label>
          <input
            id="postal"
            required
            inputMode="numeric"
            value={form.postalCode}
            onChange={(event) => set("postalCode", event.target.value)}
            className="field mt-1.5"
          />
        </div>
        <div>
          <label className="label-caps" htmlFor="city">
            Stad
          </label>
          <input
            id="city"
            required
            value={form.city}
            onChange={(event) => set("city", event.target.value)}
            className="field mt-1.5"
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="label-caps" htmlFor="phone">
            Telefon
          </label>
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(event) => set("phone", event.target.value)}
            placeholder={`${info.phonePrefix} …`}
            className="field mt-1.5"
          />
        </div>
        <div>
          <label className="label-caps" htmlFor="email">
            E-post
          </label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => set("email", event.target.value)}
            className="field mt-1.5"
          />
        </div>
      </div>

      <div>
        <label className="label-caps" htmlFor="description">
          Kort presentation <span className="normal-case">valfritt</span>
        </label>
        <textarea
          id="description"
          rows={3}
          maxLength={600}
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder="Vad gör stället speciellt? Två meningar räcker."
          className="field mt-1.5 resize-y"
        />
      </div>

      {result?.message ? (
        <p
          role="alert"
          className="border-l-2 border-burp-600 bg-burp-50 px-3 py-2 text-sm text-burp-700 dark:bg-burp-900/40 dark:text-burp-100"
        >
          {result.message}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Skickar…" : "Skicka ansökan"}
      </button>
    </form>
  );
}
