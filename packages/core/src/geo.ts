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
