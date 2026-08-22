"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES, COUNTRY_INFO, type CountryCode } from "@burp/core";
import { applyForRestaurant, type ActionResult } from "@/app/[locale]/anslut/actions";
import { fill, type Dictionary, type Locale } from "@/lib/i18n";
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
 *
 * Texterna kommer in som en färdig `join`-ordbok och hämtas inte här.
 * Komponenten är en klientkomponent, och det som korsar gränsen måste vara
 * rena strängar — ett test i `i18n.test.ts` kräver det av hela avsnittet.
 */
export function ApplicationForm({
  locale,
  texts,
  countryNames,
}: {
  locale: Locale;
  texts: Dictionary["join"];
  /**
   * Ländernas namn, skilda från `texts`.
   *
   * `join.country` är etiketten över rullgardinen — ordet "Land" — och
   * `country` är vad länderna heter. Två olika saker som ovillkorligen hade
   * krockat i samma objekt.
   */
  countryNames: Dictionary["country"];
}) {
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
        <h2 className="font-display text-2xl">{texts.doneTitle}</h2>
        <p className="mt-3 text-[var(--muted)]">{texts.doneBody}</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="btn btn-primary mt-6"
        >
          {texts.toDashboard}
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
          const outcome = await applyForRestaurant(form, locale);
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
          {texts.country}
        </label>
        <select
          id="country"
          value={form.country}
          onChange={(event) => set("country", event.target.value)}
          className="field mt-1.5"
        >
          {/*
            Landsnamnen kommer ur ordboken och inte ur `COUNTRY_INFO.name`.
            Det senare står på engelska och är ett maskinnamn — "Bosnia and
            Herzegovina" i en bosnisk rullgardin är precis det slarv som får
            en restauratör att tro att sidan inte är gjord för henne.
          */}
          {COUNTRIES.map((code) => (
            <option key={code} value={code}>
              {countryNames[code]}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          {fill(texts.countryHelp, { currency: info.currency })}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="label-caps" htmlFor="name">
            {texts.name}
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
          {/* JIB, OIB, PIB. Aldrig översatt — hon letar efter sitt eget ord. */}
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
            {texts.street}
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
            {texts.postalCode}
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
            {texts.city}
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
            {texts.phone}
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
            {texts.email}
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
          {texts.description} <span className="normal-case">{texts.optional}</span>
        </label>
        <textarea
          id="description"
          rows={3}
          maxLength={600}
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder={texts.descriptionPlaceholder}
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
        {pending ? texts.submitting : texts.submit}
      </button>
    </form>
  );
}
