/**
 * Karta över restaurangens läge.
 *
 * Fram till 2026-08-23 var det här en iframe till openstreetmap.org. Den är
 * ersatt av `PlaceMap`, som ritar kartan själv med Leaflet — se den filen för
 * skälen. Den här komponenten finns kvar som det lager som löser upp språket:
 * `PlaceMap` är en klientkomponent och får bara ta emot rena strängar, och
 * ordboken ska inte hämtas på var sida som råkar visa en karta.
 *
 * Ska kartan bytas mot en betald leverantör är det fortfarande bara en URL som
 * ändras — `NEXT_PUBLIC_MAP_TILE_URL`, se docs/OPEN-QUESTIONS.md.
 */

import { PlaceMap } from "@/components/site/place-map";
import { dictionary, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export function MapEmbed({
  locale = DEFAULT_LOCALE,
  latitude,
  longitude,
  name,
  className = "",
}: {
  locale?: Locale;
  /**
   * Koordinaterna, eller null.
   *
   * En restaurang som just godkänts har inga — ansökningsformuläret frågar inte
   * efter dem. Utan den här nullbarheten byggdes en bbox av `null - 0.004`,
   * alltså `NaN`, och iframen laddade en karta över ingenting. Komponenten
   * renderar i stället ingenting alls: en tom ruta där en karta ska stå säger
   * mindre än frånvaron av rutan.
   */
  latitude: number | null;
  longitude: number | null;
  name: string;
  className?: string;
}) {
  const t = dictionary(locale);

  if (latitude === null || longitude === null) return null;

  return (
    <PlaceMap
      latitude={latitude}
      longitude={longitude}
      name={name}
      className={className}
      texts={{
        label: t.directions.mapOf(name),
        locate: t.discover.mapLocate,
        locating: t.discover.mapLocating,
        locateFailed: t.discover.mapLocateFailed,
        youAreHere: t.discover.mapYouAreHere,
        distanceAway: t.discover.mapDistanceAway,
      }}
    />
  );
}
