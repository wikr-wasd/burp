/**
 * Karta över restaurangens läge.
 *
 * OpenStreetMap, inte Google Maps. Skälet är praktiskt: Googles inbäddning
 * kräver en API-nyckel som måste ligga i miljön, faktureras per visning och
 * skulle behöva rullas i tre miljöer. OSM:s inbäddning kräver ingenting och
 * ser likadan ut för alla. Vägbeskrivningen leder ändå till gästens egen
 * kartapp — kartan här är till för att visa VAR stället ligger, inte för att
 * navigera i.
 *
 * Avvägningen: en iframe till openstreetmap.org innebär att gästens
 * webbläsare kontaktar en tredje part. Den laddas därför lazy, alltså först
 * när gästen scrollat ner till den, och sidan fungerar utan den.
 *
 * Ska kartan bytas mot en betald leverantör är det den här filen som ändras,
 * ingen annan.
 */

export function MapEmbed({
  latitude,
  longitude,
  name,
  className = "",
}: {
  latitude: number;
  longitude: number;
  name: string;
  className?: string;
}) {
  /*
   * Rutan runt punkten, i grader.
   *
   * 0,004° är ungefär 400 meter i nord-sydlig led. Tillräckligt tätt för att
   * kvarteret ska gå att känna igen, tillräckligt vidöppet för att gatan runt
   * omkring ska synas. Longituden krymper mot polerna men på Balkan är
   * skillnaden liten nog att inte spela roll för en översiktskarta.
   */
  const span = 0.004;
  const bbox = [
    longitude - span,
    latitude - span / 2,
    longitude + span,
    latitude + span / 2,
  ].join("%2C");

  const src =
    `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}` +
    `&layer=mapnik&marker=${latitude}%2C${longitude}`;

  return (
    <div className={`border border-[var(--rule)] ${className}`}>
      <iframe
        src={src}
        title={`Karta över ${name}`}
        loading="lazy"
        // Kartan behöver inte veta var gästen är, inte spela upp något och
        // inte köra i helskärm. Allt som inte behövs stängs av.
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups"
        className="block h-64 w-full sm:h-80"
      />
    </div>
  );
}
