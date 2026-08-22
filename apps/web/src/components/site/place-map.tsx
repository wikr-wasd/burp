"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Circle, Map as LeafletMap, Marker } from "leaflet";
import { distanceMeters, roundDistance } from "@burp/core";
import { publicEnv } from "@/lib/env";
import { fill } from "@/lib/i18n";

import "leaflet/dist/leaflet.css";

/**
 * Kartan över EN plats: restaurangens läge.
 *
 * Ersätter den inbäddade iframen från openstreetmap.org som stod här fram till
 * 2026-08-23. Tre skäl, i ordning:
 *
 * 1. Iframen kontaktade en tredje part i gästens webbläsare. Den var
 *    `sandbox`-ad och `no-referrer`, men den gick ändå iväg — och den enda
 *    anledningen var att vi inte ritade kartan själva. Nu gör vi det; bara
 *    rutorna hämtas, från samma URL som resten av produkten använder.
 * 2. Den gick inte att styla. En grå ram med Leaflets standardutseende mitt i
 *    ett designsystem läser som något inklistrat, och rutorna skrek i färg
 *    bredvid resten av sidan.
 * 3. Den kunde inte svara på "hur långt är det dit". Det kan den här.
 *
 * Samma klasser som kartan på startsidan — `globals.css`, avsnittet om
 * Leaflet. Två kartor som ser olika ut i samma produkt är sämre än en karta.
 *
 * Laddas först när gästen scrollat ner till den, precis som iframen gjorde.
 * Leaflet är ett par tiotals kilobyte och sidan handlar om mat, inte om
 * kartor: den som aldrig scrollar ner till "Hitta hit" ska inte betala för
 * biblioteket.
 */

export interface PlaceMapTexts {
  /** Tillgängligt namn på kartan, med restaurangens namn ifyllt. */
  label: string;
  locate: string;
  locating: string;
  locateFailed: string;
  youAreHere: string;
  /** "{value} {unit} härifrån" */
  distanceAway: string;
}

/**
 * Kvartersnivå.
 *
 * Den gamla iframen visade en ruta på ungefär 400 meter, alltså grovt zoom 16.
 * 17 är ett steg närmare: husnumren och gatunamnen syns, och en gäst som står
 * i korsningen känner igen sig. Kartan finns för att visa VAR stället ligger —
 * navigeringen sker i gästens egen kartapp, dit knappen bredvid leder.
 */
const PLACE_ZOOM = 17;

interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function PlaceMap({
  latitude,
  longitude,
  name,
  texts,
  className = "",
}: {
  latitude: number;
  longitude: number;
  name: string;
  texts: PlaceMapTexts;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const meRef = useRef<{ marker: Marker; halo: Circle } | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);

  /*
   * Kartan laddas när den kommer i närheten av vyn.
   *
   * `rootMargin` gör att den börjar ladda en skärmhöjd innan den syns, så att
   * rutorna hunnit fram när gästen kommer dit. Utan marginalen ser det ut som
   * att kartan laddar långsamt, fast den bara började sent.
   */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(element);

    /*
     * Reservutlösaren, för att rutan aldrig ska kunna bli stående tom.
     *
     * En `IntersectionObserver` levererar ingenting så länge fliken är dold —
     * öppnar gästen sidan i en bakgrundsflik körs återanropet först när hen
     * byter dit. Det är rätt beteende, och Chrome hämtar ikapp. Men skillnaden
     * mellan "har inte laddat än" och "kommer aldrig att ladda" syns inte för
     * den som tittar på rutan, och en tom ram med en kantlinje är precis det
     * tysta felet den här kodbasen har bestämt sig för att inte ha.
     *
     * Tre sekunder efter att sidan monterats laddas kartan oavsett. Då är den
     * kritiska renderingen över, och kostnaden är ett paket som ändå hämtas i
     * bakgrunden.
     */
    const fallback = setTimeout(() => setVisible(true), 3_000);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setDenied(true);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setLocating(false);
        setDenied(false);
        setPosition({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy,
        });
      },
      (error) => {
        setLocating(false);
        setDenied(true);
        if (error.code !== error.PERMISSION_DENIED) {
          console.warn("[karta] Kunde inte läsa platsen:", error.message);
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    if (!visible || !containerRef.current) return;

    let cancelled = false;

    const run = async () => {
      // Se kommentaren i restaurant-map.tsx: Leaflet 1.9 levererar UMD och
      // hela biblioteket hamnar under `default` i en dynamisk import.
      const mod = await import("leaflet");
      const L = (mod as unknown as { default?: typeof mod }).default ?? mod;
      leafletRef.current = L;

      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        attributionControl: true,
        zoomControl: false,
      }).setView([latitude, longitude], PLACE_ZOOM);

      L.control.zoom({ position: "topright" }).addTo(map);

      L.tileLayer(publicEnv.NEXT_PUBLIC_MAP_TILE_URL, {
        attribution: publicEnv.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

      L.marker([latitude, longitude], {
        icon: L.divIcon({
          className: "",
          html: `<span class="map-pin"></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        }),
        title: name,
        alt: name,
        keyboard: false,
      }).addTo(map);

      mapRef.current = map;
    };

    // Ett tyst fel är värre än ett synligt: utan den här grenen blev en trasig
    // karta en tom ruta med en kantlinje och ingenting i konsolen.
    void run().catch((error: unknown) => {
      console.error("[karta] Kunde inte rita kartan:", error);
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, latitude, longitude, name]);

  /*
   * Gästens punkt, och en vy som rymmer både hen och stället.
   *
   * Till skillnad från startsidans karta finns det bara ett mål här, och det
   * är hela poängen med sidan. Vyn vidgas därför alltid till att rymma båda,
   * oavsett hur långt det är — en gäst som läser om en restaurang i en annan
   * stad ska se att den ligger i en annan stad.
   */
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !position) return;

    const here: [number, number] = [position.latitude, position.longitude];

    meRef.current?.marker.remove();
    meRef.current?.halo.remove();

    const halo = L.circle(here, {
      radius: Math.max(position.accuracy, 25),
      className: "map-me-halo",
      interactive: false,
      color: "transparent",
      fillColor: "transparent",
      fillOpacity: 1,
    }).addTo(map);

    const marker = L.marker(here, {
      icon: L.divIcon({
        className: "",
        html: `<span class="map-me"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      title: texts.youAreHere,
      alt: texts.youAreHere,
      zIndexOffset: 1000,
      keyboard: false,
    }).addTo(map);

    meRef.current = { marker, halo };

    map.flyToBounds([here, [latitude, longitude]], {
      padding: [48, 48],
      maxZoom: PLACE_ZOOM,
      duration: 0.8,
    });
  }, [position, latitude, longitude, texts.youAreHere]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      meRef.current = null;
    },
    [],
  );

  const distance = position
    ? roundDistance(distanceMeters(position, { latitude, longitude }))
    : null;

  return (
    <div className={`relative ${className}`}>
      <div
        role="application"
        aria-label={texts.label}
        className="h-64 w-full overflow-hidden rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--surface-muted)] sm:h-80"
      >
        {/*
          Egen div åt Leaflet, som React aldrig skriver på.

          Leaflet lägger `leaflet-container` på kartans element, och den klassen
          bär `img { max-width: none }` — motgiftet mot Tailwinds `max-width:
          100%`. Ryker klassen får varje kartruta bredden noll: bilderna är
          hämtade, nålen sitter rätt, kontrollerna fungerar, och ytan är grå.
          Det syns varken i konsolen eller i nätverkspanelen.

          Det inträffade här under Fast Refresh, där React skrev om elementet
          under en karta som redan fanns. Om samma sak kan hända i produktion
          har jag inte bevisat — men två bibliotek som båda vill äga `className`
          på samma element är en kollision att undvika, inte att mäta.
        */}
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {failed ? null : (
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="absolute bottom-3 left-3 z-[1000] inline-flex items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] shadow-md transition hover:border-[var(--rule-control)] disabled:opacity-60"
        >
          <span aria-hidden="true" className={locating ? "map-locate-spin" : undefined}>
            <LocateIcon />
          </span>
          {/*
            Knappen byter roll när svaret finns: från "visa var jag är" till
            avståndet. Att låta den stå kvar oförändrad hade betytt att gästen
            trycker igen och inget händer.
          */}
          {distance
            ? fill(texts.distanceAway, { value: distance.value, unit: distance.unit })
            : locating
              ? texts.locating
              : denied
                ? texts.locateFailed
                : texts.locate}
        </button>
      )}
    </div>
  );
}

function LocateIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" strokeLinecap="round" />
    </svg>
  );
}
