import { MapPin, Navigation } from "lucide-react";
import { dictionary, type Locale } from "@/lib/i18n";
import { CopyAddress } from "./copy-address";

/**
 * Vägbeskrivning till restaurangen.
 *
 * Gästen ska kunna skicka adressen vidare till den kartapp hen redan använder
 * i stället för att skriva av den. Tre appar täcker praktiskt taget alla:
 * Apple Kartor på iPhone, Google Maps på Android, och Waze för dem som kör bil
 * och vill ha trafiken med.
 *
 * Länkarna bygger på koordinater, inte på adresstexten. En adress måste
 * geokodas av mottagaren, och en gata som stavas olika i två register kan
 * hamna i fel kvarter — eller i fel stad. Koordinaterna kommer från
 * `restaurants.latitude/longitude` (migration 0013) och pekar på exakt en
 * punkt. Namnet skickas med som etikett så att gästen ser vart hen är på väg,
 * inte bara ett par tal.
 *
 * Det här är vanliga länkar, inte knappar med JavaScript. En länk fungerar
 * utan skript, går att långtrycka och öppna i ny flik, och syns för Google.
 */

export interface DirectionsProps {
  locale: Locale;
  name: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
}

export function Directions({
  locale,
  name,
  streetAddress,
  postalCode,
  city,
  latitude,
  longitude,
}: DirectionsProps) {
  const t = dictionary(locale);
  const coordinates = `${latitude},${longitude}`;
  const label = encodeURIComponent(name);
  const fullAddress = `${streetAddress}, ${postalCode} ${city}`;

  const links = [
    {
      name: "Google Maps",
      Icon: MapPin,
      // `api=1` är den dokumenterade, versionsstabila formen. Den äldre
      // maps.google.com-syntaxen fungerar men kan ändras utan förvarning.
      href: `https://www.google.com/maps/dir/?api=1&destination=${coordinates}`,
    },
    {
      name: "Apple Kartor",
      Icon: MapPin,
      // `daddr` är destinationen, `q` etiketten som visas på nålen.
      href: `https://maps.apple.com/?daddr=${coordinates}&q=${label}`,
    },
    {
      name: "Waze",
      Icon: Navigation,
      href: `https://waze.com/ul?ll=${coordinates}&q=${label}&navigate=yes`,
    },
  ];

  return (
    <div>
      <address className="text-lg not-italic">
        {streetAddress}
        <br />
        {postalCode} {city}
      </address>

      <div className="mt-5 flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.name}
            href={link.href}
            // Kartappen öppnas utanför Burp. `noopener` hindrar den nya fliken
            // från att kunna röra den här sidan via window.opener.
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            <link.Icon size={16} aria-hidden="true" />
            {link.name}
            <span className="sr-only">{t.directions.opensInNewTab}</span>
          </a>
        ))}

        <CopyAddress
          address={`${name}, ${fullAddress}`}
          labels={{
            copy: t.directions.copy,
            copied: t.directions.copied,
            notice: t.directions.copiedNotice,
          }}
        />
      </div>
    </div>
  );
}
