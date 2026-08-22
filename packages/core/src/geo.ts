/**
 * Koordinater som en restaurangägare kan mata in.
 *
 * Ingen restaurangägare vet sin latitud. Alla kan däremot hitta sitt ställe i
 * Google Maps och kopiera länken ur adressfältet. Den här funktionen tar emot
 * båda, plus några andra format som råkar hamna i ett klippbord, och plockar
 * ut punkten.
 *
 * Alternativet vore geokodning av adressen. Det kräver en betald tjänst, en
 * nyckel som ska rullas i tre miljöer, och ger ändå fel svar för restauranger
 * i gränder utan husnummer — vilket är ganska många av dem Burp riktar sig
 * till. Att ägaren pekar ut punkten själv är både billigare och exaktare.
 *
 * Returnerar null vid allt som inte otvetydigt är en punkt. Anropande kod ska
 * visa ett fel, aldrig gissa: en gissad koordinat skickar gäster till fel
 * adress, och det upptäcks av en hungrig gäst som står på fel gata.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Jordens giltiga intervall. Allt utanför är en felskrivning, inte en plats. */
function isOnEarth(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Avvisar (0, 0).
 *
 * Punkten ligger i Guineabukten och är vad man får när ett fält lämnats tomt
 * någonstans i kedjan. En restaurang ligger inte där, och en nolla som råkar
 * sparas skickar varje gäst ut i Atlanten.
 */
function isNullIsland(latitude: number, longitude: number): boolean {
  return latitude === 0 && longitude === 0;
}

function build(latitude: number, longitude: number): Coordinates | null {
  if (!isOnEarth(latitude, longitude)) return null;
  if (isNullIsland(latitude, longitude)) return null;

  // Sex decimaler är ungefär elva centimeter. Mer är brus, och brus i ett
  // adressfält ser ut som precision det inte finns täckning för.
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
  };
}

/**
 * Mönster som testas i tur och ordning, mest specifika först.
 *
 * Ordningen är inte godtycklig: en Google Maps-URL innehåller ofta BÅDE ett
 * `@`-par (kartans mittpunkt, alltså var vyn står) och ett `!3d!4d`-par
 * (själva platsen). Platsen är den vi vill ha, så den läses först. Läser man
 * mittpunkten i stället hamnar nålen där ägaren råkade ha scrollat.
 */
const PATTERNS: readonly { name: string; regex: RegExp }[] = [
  // Google Maps, platsens exakta punkt: ...!3d43.8595!4d18.4287
  { name: "google-place", regex: /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/ },

  // Google Maps, kartans mittpunkt: /@43.8595,18.4287,17z
  { name: "google-view", regex: /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/ },

  // OpenStreetMap: #map=17/43.8595/18.4287
  { name: "osm", regex: /#map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/ },

  // Frågeparameter: ?q=43.8595,18.4287 eller ?ll=... eller ?daddr=...
  {
    name: "query",
    regex: /[?&](?:q|ll|daddr|destination|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i,
  },

  // Rena tal: "43.8595, 18.4287" — även med decimalkomma och semikolon.
  { name: "plain", regex: /^\s*(-?\d+(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/ },
];

export function parseCoordinates(input: string): Coordinates | null {
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (trimmed === "") return null;

  for (const { name, regex } of PATTERNS) {
    const match = trimmed.match(regex);
    if (!match) continue;

    /*
     * Decimalkomma bara i "rena tal".
     *
     * "43,8595, 18,4287" är hur en svensk eller bosnisk tangentbordsvana
     * skriver det. I en URL betyder kommat däremot fältseparator, och att byta
     * det mot punkt där skulle slå isär koordinatparet.
     */
    const normalize = (value: string) =>
      name === "plain" ? Number(value.replace(",", ".")) : Number(value);

    const point = build(normalize(match[1]!), normalize(match[2]!));
    if (point) return point;
  }

  return null;
}

/**
 * Punkten som WKT, formatet PostGIS läser.
 *
 * OBS ordningen: POINT tar longitud FÖRE latitud, tvärtemot hur en människa
 * säger dem och tvärtemot hur varje kartlänk skriver dem. Att blanda ihop det
 * placerar en restaurang i Sarajevo någonstans i Indiska oceanen, och felet
 * syns inte i något typsystem.
 */
export function toWkt({ latitude, longitude }: Coordinates): string {
  return `POINT(${longitude} ${latitude})`;
}

/**
 * Avståndet mellan två punkter, i meter.
 *
 * Haversine på en klotformad jord. Jorden är en ellipsoid och formeln har
 * därför ett fel på upp till en halv procent — fem meter per kilometer. För
 * "hur långt är det till stället" är det ingenting; för lantmäteri vore det
 * fel formel, men det är inte vad Burp gör.
 *
 * Fågelvägen, inte gångvägen. En gäst som ser "400 m" och går 600 för att
 * floden ligger emellan känner sig inte lurad — men den som ser "2 minuter"
 * och går i tio gör det. Därför meter och aldrig minuter: siffran ska vara
 * ärlig om vad den mäter.
 */
export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const EARTH_RADIUS_M = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a))));
}

/**
 * Avståndet avrundat till något en människa säger högt.
 *
 * Under en kilometer: närmaste femtiotal meter. "430 m" låter uppmätt, och
 * det är det inte — GPS:en i en telefon har ofta tio meters fel och
 * fågelvägen är ändå inte den väg gästen går. "450 m" lovar precis så mycket
 * som siffran håller.
 *
 * Över en kilometer: en decimal upp till tio, sedan heltal. "12,3 km" är
 * falsk precision för något man ändå kör bil till.
 *
 * Returnerar talet och enheten var för sig. Ordningen mellan dem, och om det
 * heter "m" eller något annat, är en fråga för ordboken — inte för core.
 */
export interface RoundedDistance {
  value: number;
  unit: "m" | "km";
}

export function roundDistance(meters: number): RoundedDistance {
  if (meters < 1000) {
    return { value: Math.max(0, Math.round(meters / 50) * 50), unit: "m" };
  }

  const km = meters / 1000;
  return { value: km < 10 ? Number(km.toFixed(1)) : Math.round(km), unit: "km" };
}
