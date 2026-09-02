import { imageAdjustStyle, parseImageAdjust } from "@burp/core";

/**
 * Matbild med fast bildformat.
 *
 * Vanlig `<img>` och inte `next/image`. Bilderna kommer från tre håll med helt
 * olika ursprung: Supabase Storage i molnet, samma sak på `127.0.0.1` lokalt,
 * och den genererade SVG-platshållaren under `/bild/`. `next/image` kräver att
 * varje värd står i `remotePatterns` och optimerar inte SVG utan
 * `dangerouslyAllowSVG` — vi skulle alltså stänga av skyddet för att få tillbaka
 * det vi redan har: en fil som är några kilobyte stor.
 *
 * Bildformatet sätts med `aspect-ratio` på omslaget i stället för på bilden.
 * Utan det hoppar layouten när bilderna kommer in, och i en lista med tjugo
 * rätter hoppar den tjugo gånger.
 */

interface FoodImageProps {
  src: string;
  alt: string;
  /** Tailwind-klass för bildformatet, t.ex. `aspect-[4/3]`. */
  ratio?: string;
  /** Extra klasser på omslaget. */
  className?: string;
  /**
   * Sant för den bild som syns direkt vid sidladdning. Bara en per sida — hela
   * poängen med lazy är att resten väntar.
   */
  priority?: boolean;
  /**
   * Restaurangens egen justering, rakt ur `image_adjust`-kolumnen (migration
   * 0063). Tas emot orörd och tolkas här, så att varje anropsplats bara
   * skickar kolumnen vidare utan att veta något om formen.
   */
  adjust?: unknown;
}

export function FoodImage({
  src,
  alt,
  ratio = "aspect-[4/3]",
  className = "",
  priority = false,
  adjust,
}: FoodImageProps) {
  // Fokuspunkten avgör VAD som överlever beskärningen. Utan den kapar
  // `object-cover` alltid från mitten, och en hög tallrik tappar toppen.
  const style = imageAdjustStyle(parseImageAdjust(adjust));

  return (
    <span
      className={`block overflow-hidden bg-[var(--surface)] ${ratio} ${className}`}
    >
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        // `fetchPriority` på hjältebilden gör att den hämtas före resten av
        // sidans resurser. Det är den enda bilden gästen ser innan de scrollar.
        fetchPriority={priority ? "high" : "auto"}
        style={style}
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
    </span>
  );
}
