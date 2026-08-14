import { publicEnv } from "./env";

/**
 * Löser en bildpekare till en URL som går att visa.
 *
 * `menu_items.image_url` och `restaurants.hero_image_url` sätts av triggern i
 * migration 0017, som skriver en RELATIV lagringsväg:
 *
 *     /storage/v1/object/public/menu-media/{restaurant_id}/{uuid}.jpg
 *
 * Databasen vet inte vilken Supabase-instans den kör i — den vore fel plats
 * att lägga en värdadress i, eftersom samma dump då skulle peka på dev från
 * produktion. Adressen sätts därför här, där miljön är känd.
 *
 * Värden som redan är absoluta lämnas orörda. En restaurang kan ha en bild hos
 * en extern värd sedan tidigare, och video ligger hos en videotjänst
 * (avsnitt 8.2) med en helt egen URL.
 */
export function resolveMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  if (value.startsWith("/storage/")) {
    return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}${value}`;
  }

  // Något annat format. Returneras som det är hellre än att gissa — en trasig
  // bild är lättare att felsöka än en tyst bortfiltrerad.
  return value;
}
