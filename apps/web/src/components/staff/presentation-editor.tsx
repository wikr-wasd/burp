"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COUNTRY_INFO, CURRENCY_INFO, type CountryCode } from "@burp/core";
import { ImageUpload } from "@/components/staff/image-upload";
import { MapEmbed } from "@/components/site/map-embed";
import { fill, type Dictionary } from "@/lib/i18n";
import {
  savePresentation,
  type ActionResult,
  type PresentationInput,
} from "@/app/dashboard/installningar/actions";

/**
 * Restaurangens egen sida, redigerad av restaurangen.
 *
 * Det här är skillnaden mellan en marknadsplats och en katalog. En katalog
 * beskriver ställena; en marknadsplats låter ställena beskriva sig själva.
 * Fram till nu gick beskrivning, telefon, kökstyper, prisklass och adress bara
 * att ändra med SQL — vilket i praktiken betyder att ingen restaurangägare
 * kunde ändra dem.
 *
 * Ett formulär, en sparaknapp. Inte inline-redigering fält för fält: adressen
 * och punkten på kartan hör ihop, och den som flyttar sin restaurang ska kunna
 * ändra båda innan något sparas.
 */

export interface Presentation {
  description: string | null;
  phone: string | null;
  cuisines: string[];
  priceTier: number | null;
  streetAddress: string;
  postalCode: string;
  city: string;
  // Null tills ägaren klistrat in en kartlänk. En ny restaurang har inga.
  latitude: number | null;
  longitude: number | null;
  heroImageUrl: string | null;
}

export function PresentationEditor({
  restaurantId,
  restaurantName,
  country,
  publicPath,
  initial,
  labels,
  imageLabels,
  heroMedia,
}: {
  restaurantId: string;
  restaurantName: string;
  country: CountryCode;
  /** Adressen till den publika sidan, t.ex. /r/sarajevo/cevabdzinica-zeljo. */
  publicPath: string;
  initial: Presentation;
  /** Inställningarnas texter ur ordboken. Rena strängar — komponenten är klientkod. */
  labels: Dictionary["staff"]["settings"];
  /** Bilduppladdningens besked. Delas med menyredigeraren — se ordboken. */
  imageLabels: Dictionary["staff"]["image"];
  /** Medieraden bakom bilden, så att den går att justera (migration 0063). */
  heroMedia?: { id: string; adjust: unknown } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const [form, setForm] = useState<PresentationInput>({
    description: initial.description ?? "",
    phone: initial.phone ?? "",
    cuisines: initial.cuisines.join(", "),
    priceTier: initial.priceTier,
    streetAddress: initial.streetAddress,
    postalCode: initial.postalCode,
    city: initial.city,
    location: "",
  });

  const info = COUNTRY_INFO[country];

  function set<K extends keyof PresentationInput>(key: K, value: PresentationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  return (
    <section>
      <h2 className="font-display text-2xl">{labels.pageTitle}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {labels.pageHint}{" "}
        <a href={publicPath} target="_blank" rel="noreferrer" className="link">
          {labels.showPage}
        </a>
      </p>

      <form
        className="mt-6 space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const outcome = await savePresentation(form);
            setResult(outcome);
            if (outcome.ok) {
              // Punkten är sparad; fältet töms så att det inte ser ut som att
              // en gammal länk fortfarande väntar på att skickas in.
              setForm((current) => ({ ...current, location: "" }));
              router.refresh();
            }
          });
        }}
      >
        <label className="block">
          <span className="label-caps">{labels.presentation}</span>
          <textarea
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
            rows={4}
            maxLength={600}
            placeholder={labels.presentationPlaceholder}
            className="field mt-1.5 resize-y"
          />
          <span className="mt-1 block text-xs text-[var(--muted)]">
            {fill(labels.presentationCount, { n: form.description.length })}
          </span>
        </label>

        <div>
          <span className="label-caps">{labels.hero}</span>
          <p className="mt-1 mb-3 text-xs text-[var(--muted)]">
            {labels.heroHint}
          </p>
          <ImageUpload
            restaurantId={restaurantId}
            label={labels.heroUpload}
            labels={imageLabels}
            currentUrl={initial.heroImageUrl}
            mediaId={heroMedia?.id ?? null}
            adjust={heroMedia?.adjust}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="label-caps">{labels.phone}</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => set("phone", event.target.value)}
              placeholder={`${info.phonePrefix} …`}
              className="field mt-1.5"
            />
          </label>

          <label className="block">
            <span className="label-caps">{labels.cuisines}</span>
            <input
              type="text"
              value={form.cuisines}
              onChange={(event) => set("cuisines", event.target.value)}
              placeholder={labels.cuisinesPlaceholder}
              className="field mt-1.5"
            />
            <span className="mt-1 block text-xs text-[var(--muted)]">
              {labels.cuisinesHint}
            </span>
          </label>
        </div>

        <div>
          <span className="label-caps">{labels.priceTier}</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((tier) => (
              <button
                key={tier}
                type="button"
                aria-pressed={form.priceTier === tier}
                onClick={() => set("priceTier", form.priceTier === tier ? null : tier)}
                className={`inline-flex min-h-11 items-center border px-4 text-sm transition-colors duration-[var(--speed)] ${
                  form.priceTier === tier
                    ? "border-burp-600 bg-burp-600 text-white"
                    : "border-[var(--rule)] hover:border-burp-600"
                }`}
              >
                {/* Mellanslag mellan symbolerna. "KMKMKM" läses som ett ord,
                    "KM KM KM" som tre steg på en skala. */}
                {Array.from({ length: tier }, () => CURRENCY_INFO[info.currency].symbol).join(" ")}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            {labels.priceTierHint}
          </p>
        </div>

        <fieldset>
          <legend className="label-caps">{labels.address}</legend>

          <div className="mt-2 grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <input
              type="text"
              value={form.streetAddress}
              onChange={(event) => set("streetAddress", event.target.value)}
              aria-label={labels.street}
              placeholder={labels.street}
              className="field"
            />
            <input
              type="text"
              value={form.postalCode}
              onChange={(event) => set("postalCode", event.target.value)}
              aria-label={labels.postalCode}
              placeholder={labels.postalCode}
              inputMode="numeric"
              className="field"
            />
            <input
              type="text"
              value={form.city}
              onChange={(event) => set("city", event.target.value)}
              aria-label={labels.city}
              placeholder={labels.city}
              className="field"
            />
          </div>
        </fieldset>

        <div>
          <span className="label-caps">{labels.mapPlace}</span>
          <p className="mt-1 mb-3 text-xs text-[var(--muted)]">
            {labels.mapHint}
          </p>

          <input
            type="text"
            value={form.location}
            onChange={(event) => set("location", event.target.value)}
            aria-label={labels.mapLinkLabel}
            placeholder={labels.mapLinkPlaceholder}
            className="field"
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <MapEmbed
              latitude={initial.latitude}
              longitude={initial.longitude}
              name={restaurantName}
            />
            <p className="text-xs text-[var(--muted)] sm:max-w-40">
              {labels.mapCurrentHint}
            </p>
          </div>
        </div>

        {result?.message ? (
          <p
            role="alert"
            className={`border-l-2 px-3 py-2 text-sm ${
              result.ok
                ? "border-green-600 bg-green-600/10 text-green-800 dark:text-green-300"
                : "border-burp-600 bg-burp-50 text-burp-700 dark:bg-burp-900/40 dark:text-burp-100"
            }`}
          >
            {result.message}
          </p>
        ) : null}

        {result?.ok && !result.message ? (
          <p role="status" className="border-l-2 border-green-600 bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
            {labels.presentationSaved}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? labels.saving : labels.save}
        </button>
      </form>
    </section>
  );
}
