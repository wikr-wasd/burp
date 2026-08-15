import { resolveMediaUrl } from "./media-url";

/**
 * Bild att visa för en rätt eller restaurang.
 *
 * Ordningen är: godkänd uppladdad bild först, platshållare annars. En meny
 * full av tomma grå rutor ser trasig ut — inte ofärdig, trasig — och det är
 * första intrycket en gäst får av en restaurang som just anslutit.
 *
 * Platshållaren är deterministisk: samma rätt ger samma bild varje gång, så
 * menyn inte flimrar mellan laddningar.
 */
export function dishImage(name: string, uploaded: string | null | undefined): string {
  return resolveMediaUrl(uploaded) ?? `/bild/${encodeURIComponent(name)}`;
}

/**
 * Är bilden en platshållare?
 *
 * Används för att låta bli att skryta med en bild som inte är restaurangens
 * egen — en platshållare ska inte ligga som stor hjältebild eller hamna i
 * og:image, där den skulle representera restaurangen i ett delat inlägg.
 */
export function isPlaceholder(url: string): boolean {
  return url.startsWith("/bild/");
}
