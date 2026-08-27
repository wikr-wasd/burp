"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { MapPin, Search, Store, UtensilsCrossed } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { fill, localePath } from "@/lib/i18n";

/**
 * Sökrutan som svarar medan man skriver.
 *
 * ── Varför formuläret ligger kvar under ─────────────────────────────────────
 *
 * Den här komponenten ERSÄTTER inte sidans sökning, den ligger ovanpå. Sidan
 * söker fortfarande genom sin `<form method="get">`: den fungerar utan
 * JavaScript, ger en adress som går att dela och är vad Google följer. Trycker
 * gästen Enter utan att välja ett förslag skickas formuläret precis som förut.
 *
 * Det är också reservvägen. Faller förslagen bort — nätet, en rate limit, ett
 * fel — står ett vanligt sökfält kvar och gör vad det alltid gjort.
 *
 * ── Varför cmdk och inte en egen lista ──────────────────────────────────────
 *
 * Piltangenter, Home/End, aria-activedescendant och rullning till markerad rad
 * är fiffligare att få rätt än det ser ut, och en kombinationsruta som är fel
 * märkt är obrukbar med skärmläsare. cmdk är litet, sköter just det, och bär
 * inget eget utseende — knapparna, fälten och färgerna är fortfarande Burps
 * (se globals.css).
 */

interface Suggestions {
  restaurants: {
    id: string;
    name: string;
    slug: string;
    citySlug: string;
    city: string;
    cuisines: string[];
  }[];
  dishes: {
    slug: string;
    name: string;
    citySlug: string;
    city: string;
    restaurants: number;
  }[];
  cities: { name: string; slug: string }[];
}

const EMPTY: Suggestions = { restaurants: [], dishes: [], cities: [] };

/**
 * Texterna rutan behöver — RENA STRÄNGAR, uppräknade en och en.
 *
 * Inte `Dictionary["home"]`. Det avsnittet bär funktioner (`hits(n)` och
 * liknande), och en funktion går inte att serialisera över server/klient-
 * gränsen: sidan svarar 500, och felet ser ut att komma från komponenten och
 * inte från vad som skickades in. Uppräkningen kostar tio rader och gör det
 * omöjligt att råka skicka med en.
 */
export interface SearchLabels {
  placeholder: string;
  label: string;
  button: string;
  searching: string;
  /** Bär `{query}`. */
  empty: string;
  dishes: string;
  restaurants: string;
  cities: string;
}

export function SearchCommand({
  locale,
  city,
  cuisine,
  initialQuery,
  labels,
}: {
  locale: Locale;
  /** Vald stad, som följer med i sökningen och i förslagen. */
  city?: string;
  cuisine?: string;
  initialQuery?: string;
  labels: SearchLabels;
}) {
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery ?? "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestions>(EMPTY);

  const containerRef = useRef<HTMLDivElement | null>(null);

  /*
   * Fördröjning innan anropet.
   *
   * Utan den blir varje tangenttryck en förfrågan, och den som skriver
   * "punjene paprike" skickar femton. Med den skickas en — och 160 ms är kort
   * nog att listan känns som att den följer med.
   */
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSuggestions(EMPTY);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed });
      if (city) params.set("city", city);

      fetch(`/api/search?${params}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: (Suggestions & { ok: boolean }) | null) => {
          if (cancelled) return;
          setSuggestions(payload?.ok ? payload : EMPTY);
        })
        .catch(() => {
          // Ett tyst fel här får inte se ut som "inga träffar". Listan stängs,
          // och formuläret under gör vad det alltid gjort.
          if (!cancelled) setSuggestions(EMPTY);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, city]);

  // Ett klick utanför stänger listan. Escape gör det också, via cmdk.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const hasHits = useMemo(
    () =>
      suggestions.restaurants.length > 0 ||
      suggestions.dishes.length > 0 ||
      suggestions.cities.length > 0,
    [suggestions],
  );

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  /** Fritext: samma väg som formuläret, med stad och kök kvar. */
  function submitFreeText() {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (city) params.set("stad", city);
    if (cuisine) params.set("kok", cuisine);

    const search = params.toString();
    setOpen(false);
    router.push(localePath(locale, search ? `/?${search}` : "/"));
  }

  return (
    <div ref={containerRef} className="relative mt-8 max-w-xl">
      <Command
        // Filtreringen sker på servern, mot menyer och beskrivningar. cmdk:s
        // egen fuzzy-matchning hade sorterat om den efter sina egna regler och
        // dolt träffar som databasen tyckte var relevanta.
        shouldFilter={false}
        loop
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="w-full"
      >
        <form
          action={localePath(locale, "/")}
          method="get"
          role="search"
          onSubmit={(event) => {
            // Har gästen en markerad rad tar cmdk hand om Enter innan detta.
            event.preventDefault();
            submitFreeText();
          }}
          className="flex gap-2"
        >
          {city ? <input type="hidden" name="stad" value={city} /> : null}
          {cuisine ? <input type="hidden" name="kok" value={cuisine} /> : null}

          <div className="relative flex-1">
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]"
            />
            <Command.Input
              name="q"
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={labels.placeholder}
              aria-label={labels.label}
              className="field field-search"
            />
          </div>

          <button type="submit" className="btn btn-primary shrink-0">
            {labels.button}
          </button>
        </form>

        {open && query.trim().length >= 2 ? (
          <Command.List
            className="card absolute inset-x-0 top-full z-30 mt-2 max-h-[22rem] overflow-y-auto p-2 shadow-lg"
          >
            {loading && !hasHits ? (
              <Command.Loading>
                <p className="px-3 py-2 text-sm text-[var(--muted)]">{labels.searching}</p>
              </Command.Loading>
            ) : null}

            {!loading && !hasHits ? (
              <Command.Empty className="px-3 py-2 text-sm text-[var(--muted)]">
                {fill(labels.empty, { query: query.trim() })}
              </Command.Empty>
            ) : null}

            {/*
              Rätterna först.

              Den som skriver ett rättnamn letar efter rätten, och rättsidan
              svarar på "var får jag den och vad kostar den" — vilket en lista
              över ställen inte gör.
            */}
            {suggestions.dishes.length > 0 ? (
              <Command.Group heading={labels.dishes} className="suggest-group">
                {suggestions.dishes.map((dish) => (
                  <Command.Item
                    key={`${dish.citySlug}-${dish.slug}`}
                    value={`ratt-${dish.citySlug}-${dish.slug}`}
                    onSelect={() =>
                      go(localePath(locale, `/${dish.citySlug}/ratt/${dish.slug}`))
                    }
                    className="suggest-item"
                  >
                    <UtensilsCrossed size={16} aria-hidden="true" className="text-burp-600" />
                    <span className="min-w-0 flex-1 truncate">{dish.name}</span>
                    <span className="shrink-0 text-sm text-[var(--muted)]">
                      {dish.city} · {dish.restaurants}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {suggestions.restaurants.length > 0 ? (
              <Command.Group heading={labels.restaurants} className="suggest-group">
                {suggestions.restaurants.map((restaurant) => (
                  <Command.Item
                    key={restaurant.id}
                    value={`rest-${restaurant.id}`}
                    onSelect={() =>
                      go(
                        localePath(
                          locale,
                          `/r/${restaurant.citySlug}/${restaurant.slug}`,
                        ),
                      )
                    }
                    className="suggest-item"
                  >
                    <Store size={16} aria-hidden="true" className="text-[var(--muted)]" />
                    <span className="min-w-0 flex-1 truncate">{restaurant.name}</span>
                    <span className="shrink-0 text-sm text-[var(--muted)]">
                      {[restaurant.cuisines[0], restaurant.city].filter(Boolean).join(" · ")}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {suggestions.cities.length > 0 ? (
              <Command.Group heading={labels.cities} className="suggest-group">
                {suggestions.cities.map((entry) => (
                  <Command.Item
                    key={entry.slug}
                    value={`stad-${entry.slug}`}
                    onSelect={() => go(localePath(locale, `/${entry.slug}`))}
                    className="suggest-item"
                  >
                    <MapPin size={16} aria-hidden="true" className="text-[var(--muted)]" />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        ) : null}
      </Command>
    </div>
  );
}
