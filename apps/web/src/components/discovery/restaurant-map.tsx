"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Circle, Map as LeafletMap, Marker } from "leaflet";
import { distanceMeters, roundDistance } from "@burp/core";
import { publicEnv } from "@/lib/env";
import { fill } from "@/lib/i18n";
import { focusRestaurant, useFocusedRestaurant } from "@/lib/map-focus";

import "leaflet/dist/leaflet.css";

/**
 * Kartan över alla restauranger.
 *
 * Leaflet, inte Google Maps eller Mapbox. Skälet är detsamma som för den
 * enskilda restaurangens karta: Burp ska inte behöva en nyckel från en
 * leverantör för att kunna rita en karta, och byter vi leverantör ska det vara
 * en URL som ändras, inte en komponent.
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

/**
 * Texterna kartan skriver in i Leaflets egen markup.
 *
 * Rena strängar, inga funktioner: komponenten är en klientkomponent och allt
 * som skickas hit måste gå att serialisera. `{value}` och `{unit}` fylls med
 * `fill()`.
 */
export interface MapTexts {
  /** Knappen som frågar efter platsen. */
  locate: string;
  /** Medan webbläsaren letar. */
  locating: string;
  /** När gästen sagt nej, eller när platsen inte gick att få fram. */
  locateFailed: string;
  /** Etikett på gästens egen punkt. */
  youAreHere: string;
  /** "{value} {unit} härifrån" */
  distanceAway: string;
}

/** Sarajevo. Används bara om ingen restaurang har koordinater. */
const FALLBACK_CENTER: [number, number] = [43.8563, 18.4131];

/**
 * Zoomnivån när vi vet var gästen står.
 *
 * 16 är kvartersnivå — gatunamnen syns och det går att se åt vilket håll man
 * ska gå. Vyn vidgas ändå av `flyToBounds` nedan om närmaste ställe ligger
 * längre bort, men aldrig i onödan: frågan gästen kom med är "vad finns nära
 * mig", och svaret på den är inte en översikt över landet.
 */
const LOCATED_ZOOM = 16;

/**
 * Hur långt vyn får vidgas för att få med närmaste restaurang.
 *
 * Ligger allt längre bort än så är sammanhanget inte till hjälp — då är det
 * bättre att stå kvar hos gästen och låta listan bredvid svara.
 */
const MAX_CONTEXT_METERS = 5_000;

interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function RestaurantMap({
  pins,
  label,
  emptyLabel,
  failedLabel,
  texts,
  area,
  origin,
}: {
  pins: readonly MapPin[];
  /** Tillgängligt namn på kartan. */
  label: string;
  /** Visas i stället för kartan när ingen träff har koordinater. */
  emptyLabel: string;
  /** Visas om kartan inte gick att ladda. */
  failedLabel: string;
  texts: MapTexts;
  /**
   * "Sök i det här området".
   *
   * Rena strängar och ett parameternamn — inga funktioner, eftersom en
   * funktion inte går över server/klient-gränsen. Kartan bygger adressen själv
   * ur webbläsarens nuvarande sökparametrar, så att stad, kök och fritext
   * följer med in i områdessökningen.
   */
  area?: { searchLabel: string; clearLabel: string; param: string };
  /**
   * Var gästen ungefär befinner sig, läst ur IP-adressen på servern.
   *
   * Grovt — stadsnivå, ibland fel stad — men gratis och utan att fråga. Den
   * används bara för att välja VAR kartan öppnar, aldrig för att räkna avstånd
   * eller filtrera: ett avstånd byggt på en IP-gissning vore en siffra som ser
   * exakt ut och inte är det.
   *
   * Undefined lokalt och hos varje värd som inte skickar huvudena. Då väljer
   * kartan tätaste klungan i stället.
   */
  origin?: { latitude: number; longitude: number };
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const meRef = useRef<{ marker: Marker; halo: Circle } | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  /*
   * Nålarna per restaurang-id.
   *
   * `markersRef` är listan som ska städas bort; den här är uppslaget som
   * behövs när listan pekar hit. Två strukturer över samma markörer, med olika
   * uppgift — och båda töms på samma ställe.
   */
  const markersById = useRef<Map<string, Marker>>(new Map());
  const focused = useFocusedRestaurant();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /*
   * Har gästen flyttat kartan sedan sidan laddades?
   *
   * Knappen ska INTE stå framme från början. En karta som redan visar
   * träffarna behöver ingen "sök här" — den visar dem ju. Först när gästen
   * panorerat eller zoomat finns det ett annat område att fråga om.
   */
  const [moved, setMoved] = useState(false);

  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);

  /*
   * Platsen hämtas här, vyn flyttas någon annanstans.
   *
   * Att skilja de två åt är vad som gör att en gäst som panorerat bort inte
   * rycks tillbaka. Vyn flyttas en gång, i effekten längre ner, när positionen
   * går från null till något.
   */
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
        // Ett nej är inte ett fel att logga som ett. Kartan fungerar utan
        // platsen; knappen ska bara sluta lova något den inte kan hålla.
        if (error.code !== error.PERMISSION_DENIED) {
          console.warn("[karta] Kunde inte läsa platsen:", error.message);
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  /*
   * Har gästen redan sagt ja en gång letar vi upp platsen direkt.
   *
   * Ingen rutedialog vid första besöket. En sajt som ber om platsen i samma
   * ögonblick som den öppnas får nej av de flesta — och webbläsaren tystar
   * sedan frågan för domänen, vilket gör att den som VILLE dela sin plats inte
   * längre kan. `permissions.query` säger om svaret redan finns, utan att
   * fråga; först när det är "granted" hämtar vi något.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions) return;

    let cancelled = false;

    void navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === "granted") locate();
      })
      .catch(() => {
        // Äldre Safari saknar geolocation i Permissions API. Då står knappen
        // kvar och gästen får trycka på den — vilket är hela reservvägen.
      });

  return () => {
      cancelled = true;
    };
  }, [locate]);

  /*
   * Listan pekar på ett kort — nålen lyser upp.
   *
   * Vyn flyttas INTE. Att panorera kartan för varje kort musen sveper över
   * hade gjort den till en karusell, och den som letar tappar var hon var.
   * Zoomen och mitten är gästens; markeringen är vår.
   */
  useEffect(() => {
    for (const [id, marker] of markersById.current) {
      const element = marker.getElement();
      if (!element) continue;

      element.classList.toggle("map-pin-focused", id === focused);
    }
  }, [focused, pins]);

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
      leafletRef.current = L;

      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          // Rullhjulet hör till sidan, inte till kartan. En karta som fångar
          // scrollen mitt i en lista är det säkraste sättet att låsa fast en
          // gäst som bara ville vidare.
          scrollWheelZoom: false,
          attributionControl: true,
          // Zoomknapparna ritas om i eget hörn, se nedan.
          zoomControl: false,
        }).setView(FALLBACK_CENTER, 12);

        /*
         * Gästen flyttade kartan.
         *
         * `moveend` täcker både panorering och zoom. Flaggan styr bara om
         * knappen syns — sökningen sker först när någon trycker på den, för en
         * karta som söker om vid varje ryck är en karta man inte vågar röra.
         */
        mapRef.current.on("moveend", () => setMoved(true));

        // Uppe till höger, inte uppe till vänster. Vänsterkanten är där
        // popuperna fälls ut och där platsknappen står.
        L.control.zoom({ position: "topright" }).addTo(mapRef.current);

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
      markersById.current.clear();

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
          // Nålen man pekar på lägger sig överst. I en klunga går det annars
          // inte att se vilken av dem som svarar.
          riseOnHover: true,
        })
          .addTo(map)
          .bindPopup(popupHtml(pin, position, texts));

        /*
         * Nålen säger till listan vilken restaurang den är.
         *
         * `mouseover` och inte bara `click`: den som drar musen över kartan
         * letar, och kortet nedanför ska hinna lysa upp innan hon bestämt sig.
         * Klicket öppnar popupen som förut — det här ersätter ingenting.
         */
        marker.on("mouseover", () => focusRestaurant(pin.id));
        marker.on("mouseout", () => focusRestaurant(null));
        marker.on("click", () => focusRestaurant(pin.id));

        markersRef.current.push(marker);
        markersById.current.set(pin.id, marker);
      }

      if (pins.length > 0 && !position) {
        /*
         * Kartan öppnar på ETT område, aldrig på hela regionen.
         *
         * Att rymma varje träff lät rimligt och såg fel ut: med restauranger i
         * Sarajevo, Zagreb och Beograd blev startvyn halva Balkan, tre nålar
         * och ingenting att känna igen. En karta som visar allt visar inget.
         *
         * Området väljs i den här ordningen:
         *   1. Klungan närmast gästen, när IP-positionen finns.
         *   2. Annars den största klungan — den stad som har flest ställen.
         *
         * Hoppas över helt när GPS-positionen är känd. Då bestämmer effekten
         * nedan vyn, och två flyttar efter varandra ger ett ryck.
         */
        const openOn = pickArea(pins, origin);

        map.fitBounds(
          openOn.map((pin) => [pin.latitude, pin.longitude] as [number, number]),
          {
            padding: [40, 40],
            // Ett tak, av samma skäl som förut: en enda träff ska visa
            // kvarteret den ligger i, inte husväggen.
            maxZoom: 16,
          },
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
  }, [pins, position, texts, origin]);

  /*
   * Gästens egen punkt, och vyn som flyttar sig dit.
   *
   * Egen effekt därför att den ska köra när positionen kommer — inte när
   * filtret ändras. Låg de ihop rycktes vyn tillbaka till gästen varje gång
   * hen bytte kök i listan.
   */
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !position) return;

    const here: [number, number] = [position.latitude, position.longitude];

    meRef.current?.marker.remove();
    meRef.current?.halo.remove();

    /*
     * Noggrannheten ritas som en cirkel, inte som en siffra.
     *
     * En GPS i en stadskärna kan ha femtio meters fel, och en punkt utan
     * ringen runt sig påstår en exakthet den inte har. Ringen är grå och inte
     * röd: rött är restaurangernas färg på den här kartan, och gästen är inte
     * en restaurang.
     *
     * Färgerna sätts i `globals.css` genom klassen, så att de följer ljust och
     * mörkt läge. Leaflets egna färgvärden måste ändå anges — de skrivs som
     * attribut på SVG-elementet, och `transparent` låter stilmallen vinna.
     */
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
      // Gästens punkt ligger över nålarna. Står man mitt i en klunga ska den
      // egna punkten inte försvinna under någon annans.
      zIndexOffset: 1000,
      keyboard: false,
    }).addTo(map);

    meRef.current = { marker, halo };

    /*
     * Vyn: gästen och närmaste ställe, om det ligger inom gångavstånd.
     *
     * Att rymma båda svarar på frågan "vad finns nära mig" i stället för att
     * bara visa var man står. Ligger närmaste ställe längre bort än fem
     * kilometer vidgas vyn inte — då är sammanhanget inte till hjälp, och en
     * karta som zoomar ut till halva landet är sämre än en som stannar kvar.
     */
    const nearest = nearestPin(pins, position);

    if (nearest && nearest.meters <= MAX_CONTEXT_METERS) {
      map.flyToBounds([here, [nearest.pin.latitude, nearest.pin.longitude]], {
        padding: [56, 56],
        maxZoom: LOCATED_ZOOM,
        duration: 0.8,
      });
    } else {
      map.flyTo(here, LOCATED_ZOOM, { duration: 0.8 });
    }
  }, [position, pins, texts.youAreHere]);

  // Kartan rivs först när komponenten försvinner, inte vid varje filterbyte.
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = [];
      meRef.current = null;
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

  /** Sant när listan redan är filtrerad på ett område. */
  const searching = Boolean(area && searchParams.get(area.param));

  /** Söker om på rutan gästen ser just nu. */
  const searchThisArea = useCallback(() => {
    const map = mapRef.current;
    if (!map || !area) return;

    const bounds = map.getBounds();
    const params = new URLSearchParams(searchParams.toString());

    /*
     * Sex decimaler räcker till drygt en decimeter.
     *
     * Fler gör adressen svårläst utan att göra rutan rättare — och adressen
     * ska gå att dela, vilket är hela skälet att området ligger i URL:en och
     * inte i ett tillstånd som försvinner vid omladdning.
     */
    params.set(
      area.param,
      [
        bounds.getSouth().toFixed(6),
        bounds.getWest().toFixed(6),
        bounds.getNorth().toFixed(6),
        bounds.getEast().toFixed(6),
      ].join(","),
    );

    setMoved(false);
    router.push(`${pathname}?${params.toString()}`);
  }, [area, pathname, router, searchParams]);

  const clearArea = useCallback(() => {
    if (!area) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete(area.param);

    setMoved(false);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [area, pathname, router, searchParams]);

  return (
    <div className="relative h-full min-h-64 w-full">
      <div
        role="application"
        aria-label={label}
        className="h-full w-full overflow-hidden rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--surface-muted)]"
      >
        {/* Se place-map.tsx: Leaflet måste få ett element som React aldrig
            skriver om, annars tappar rutorna sin bredd. */}
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/*
        Platsknappen är en riktig knapp i sidans markup, inte en Leaflet-kontroll.
        Då får den designsystemets utseende, tabbfokus och en läsbar etikett utan
        att en enda HTML-sträng skrivs in i kartan.

        Den försvinner när platsen är känd: en knapp som inte gör något nytt står
        i vägen, och punkten på kartan säger redan att den fungerade.
      */}
      {/*
        "Sök i det här området".

        Står mitt upptill och inte i ett hörn: den svarar på vad man ser, och
        det är mitten man tittar på. Den finns bara när gästen faktiskt flyttat
        kartan — en karta som redan visar träffarna behöver ingen sådan knapp.
      */}
      {area && moved && !searching ? (
        <button
          type="button"
          onClick={searchThisArea}
          className="btn btn-primary absolute top-3 left-1/2 z-[500] -translate-x-1/2 shadow-lg"
        >
          {area.searchLabel}
        </button>
      ) : null}

      {area && searching ? (
        <button
          type="button"
          onClick={clearArea}
          className="btn btn-secondary absolute top-3 left-1/2 z-[500] -translate-x-1/2 shadow-lg"
        >
          {area.clearLabel}
        </button>
      ) : null}

      {position ? null : (
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="absolute bottom-3 left-3 z-[1000] inline-flex items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] shadow-md transition hover:border-[var(--rule-control)] disabled:opacity-60"
        >
          <span aria-hidden="true" className={locating ? "map-locate-spin" : undefined}>
            <LocateIcon />
          </span>
          {locating ? texts.locating : denied ? texts.locateFailed : texts.locate}
        </button>
      )}
    </div>
  );
}

/** Hårkorset på platsknappen. Inline av samma skäl som allt annat: ingen extra begäran. */
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

/** Närmaste nål och hur långt dit, eller null om inga nålar finns. */
function nearestPin(
  pins: readonly MapPin[],
  from: { latitude: number; longitude: number },
): { pin: MapPin; meters: number } | null {
  let best: { pin: MapPin; meters: number } | null = null;

  for (const pin of pins) {
    const meters = distanceMeters(from, pin);
    if (!best || meters < best.meters) best = { pin, meters };
  }

  return best;
}

/** Popupens innehåll. Skrivs in som HTML av Leaflet, så allt måste escapas. */
function popupHtml(
  pin: MapPin,
  position: { latitude: number; longitude: number } | null,
  texts: MapTexts,
): string {
  const distance = position ? roundDistance(distanceMeters(position, pin)) : null;

  return (
    `<a class="map-popup" href="${escapeAttribute(pin.href)}">` +
    `<strong>${escapeHtml(pin.name)}</strong>` +
    `<span>${escapeHtml(pin.meta)}</span>` +
    `<span class="${pin.isOpen ? "map-popup-open" : ""}">${escapeHtml(pin.status)}</span>` +
    (distance
      ? `<span class="map-popup-distance">${escapeHtml(
          fill(texts.distanceAway, { value: distance.value, unit: distance.unit }),
        )}</span>`
      : "") +
    `</a>`
  );
}

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

/**
 * Hur nära två nålar måste ligga för att räknas till samma område.
 *
 * Femton kilometer rymmer en stad med förorter och skiljer ändå Sarajevo från
 * Zagreb. Talet är trubbigt med flit: alternativet är riktig klustring per
 * zoomnivå, och det löser ett problem Burp inte har förrän en stad har hundra
 * restauranger.
 */
const AREA_RADIUS_METERS = 15_000;

/**
 * Väljer det område kartan ska öppna på.
 *
 * Nålarna grupperas girigt: varje nål hamnar i första gruppen den ligger nära
 * nog, annars startar den en egen. Ordningen spelar ingen roll för resultatet
 * så länge grupperna är väl åtskilda — och är de inte det är de i praktiken
 * samma stad ändå.
 */
function pickArea(
  pins: readonly MapPin[],
  origin?: { latitude: number; longitude: number },
): MapPin[] {
  const groups: MapPin[][] = [];

  for (const pin of pins) {
    const group = groups.find(
      (candidate) => distanceMeters(candidate[0]!, pin) <= AREA_RADIUS_METERS,
    );

    if (group) group.push(pin);
    else groups.push([pin]);
  }

  if (groups.length === 0) return [...pins];

  // Vet vi var gästen är vinner närheten över storleken. Frågan hon kom med är
  // "vad finns nära mig", inte "var finns flest".
  if (origin) {
    let closest = groups[0]!;
    let best = Number.POSITIVE_INFINITY;

    for (const group of groups) {
      const meters = Math.min(...group.map((pin) => distanceMeters(origin, pin)));
      if (meters < best) {
        best = meters;
        closest = group;
      }
    }

    return closest;
  }

  return groups.reduce((largest, group) => (group.length > largest.length ? group : largest));
}
