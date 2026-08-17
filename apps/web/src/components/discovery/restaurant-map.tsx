"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { publicEnv } from "@/lib/env";

import "leaflet/dist/leaflet.css";

/**
 * Kartan över alla restauranger.
 *
 * Leaflet, inte Google Maps eller Mapbox. Skälet är detsamma som för den
 * enskilda restaurangens karta (`map-embed.tsx`): Burp ska inte behöva en
 * nyckel från en leverantör för att kunna rita en karta, och byter vi
 * leverantör ska det vara en URL som ändras, inte en komponent.
 *
 * ⚠️ Rutorna kommer som standard från OpenStreetMaps egna servrar. Det
 * fungerar i utveckling men strider mot deras användningsvillkor för en publik
 * tjänst. `NEXT_PUBLIC_MAP_TILE_URL` finns för att peka om dem till en betald
 * leverantör innan lansering — se docs/OPEN-QUESTIONS.md.
 *
 * Biblioteket importeras dynamiskt inuti effekten, inte i toppen av filen.
 * Leaflet läser `window` när modulen laddas och kraschar i serverrenderingen.
 * Sidan runt omkring renderas på servern och är indexerbar; kartan är det
 * enda som kräver en webbläsare.
 *
 * Nålarna är egen HTML (`divIcon`), inte Leaflets standardikon. Den senare är
 * en PNG som laddas från bibliotekets egen katalog, hamnar fel i en
 * bundlare och dessutom är blå — färgen designspråket uttryckligen inte
 * använder.
 */

export interface MapPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Rad under namnet i popupen: kök och stad. */
  meta: string;
  /** "Öppet till 22:00" eller "Stängt idag". */
  status: string;
  isOpen: boolean;
  href: string;
}

/** Sarajevo. Används bara om ingen restaurang har koordinater. */
const FALLBACK_CENTER: [number, number] = [43.8563, 18.4131];

export function RestaurantMap({
  pins,
  label,
  emptyLabel,
  failedLabel,
}: {
  pins: readonly MapPin[];
  /** Tillgängligt namn på kartan. */
  label: string;
  /** Visas i stället för kartan när ingen träff har koordinater. */
  emptyLabel: string;
  /** Visas om kartan inte gick att ladda. */
  failedLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const run = async () => {
      /*
       * `.default`, inte modulen själv.
       *
       * Leaflet 1.9 pekar `main` på en UMD-fil och har varken `module` eller
       * `exports`. En dynamisk import ger därför en namnrymd där hela
       * biblioteket ligger under `default` — `mod.map` är undefined, och
       * kartan blev en tom ruta utan ett enda felmeddelande. Reservvägen
       * finns för den dag paketet börjar leverera ESM.
       */
      const mod = await import("leaflet");
      const L = (mod as unknown as { default?: typeof mod }).default ?? mod;

      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          // Rullhjulet hör till sidan, inte till kartan. En karta som fångar
          // scrollen mitt i en lista är det säkraste sättet att låsa fast en
          // gäst som bara ville vidare.
          scrollWheelZoom: false,
          attributionControl: true,
        }).setView(FALLBACK_CENTER, 12);

        L.tileLayer(publicEnv.NEXT_PUBLIC_MAP_TILE_URL, {
          attribution: publicEnv.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION,
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;

      // Nålarna ritas om när filtret ändras. Gamla måste bort först — annars
      // ligger en bortfiltrerad restaurang kvar på kartan.
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];

      for (const pin of pins) {
        const icon = L.divIcon({
          className: "",
          html: `<span class="map-pin${pin.isOpen ? "" : " map-pin-closed"}"></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -26],
        });

        const marker = L.marker([pin.latitude, pin.longitude], {
          icon,
          title: pin.name,
          alt: pin.name,
        })
          .addTo(map)
          .bindPopup(
            `<a class="map-popup" href="${escapeAttribute(pin.href)}">` +
              `<strong>${escapeHtml(pin.name)}</strong>` +
              `<span>${escapeHtml(pin.meta)}</span>` +
              `<span class="${pin.isOpen ? "map-popup-open" : ""}">${escapeHtml(pin.status)}</span>` +
              `</a>`,
          );

        markersRef.current.push(marker);
      }

      if (pins.length > 0) {
        // Vyn ska rymma träffarna, inte stå kvar på förra sökningen. Med en
        // enda träff blir gränserna en punkt, och `fitBounds` zoomar då in i
        // gatunivå — därför ett tak på zoomen.
        map.fitBounds(
          pins.map((pin) => [pin.latitude, pin.longitude] as [number, number]),
          { padding: [40, 40], maxZoom: 15 },
        );
      }
    };

    /*
     * Ett tyst fel är värre än ett synligt.
     *
     * Utan den här grenen blev en trasig karta en tom ruta med en kantlinje —
     * inget i konsolen, inget för gästen, inget att felsöka. Listan bredvid
     * bär ändå all information kartan visar, så sidan fungerar; gästen ska
     * bara veta att rutan inte är på väg att fyllas.
     */
    void run().catch((error: unknown) => {
      console.error("[karta] Kunde inte rita kartan:", error);
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [pins]);

  // Kartan rivs först när komponenten försvinner, inte vid varje filterbyte.
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
    },
    [],
  );

  if (pins.length === 0 || failed) {
    return (
      <div className="card grid h-full min-h-64 place-items-center p-8 text-center text-[var(--muted)]">
        {failed ? failedLabel : emptyLabel}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={label}
      className="h-full min-h-64 w-full rounded-[var(--radius)] border border-[var(--rule)]"
    />
  );
}

/** Popupens innehåll är HTML som Leaflet skriver in. Namnen måste escapas. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
